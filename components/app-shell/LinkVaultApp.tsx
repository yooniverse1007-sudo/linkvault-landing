"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { AnalyzeYouTubeResponse } from "@/types/api";
import type { SavedLink } from "@/types/linkvault";
import {
  assertSavedLinksSchema,
  deleteSavedLink,
  findExistingSavedLink,
  loadSavedLinks,
  saveLink,
  updateSavedLinkAnalysis
} from "@/lib/links/saved-links";
import { hasSupabaseConfig } from "@/lib/supabase/client";
import { canonicalizeSourceUrl, detectPlatform } from "@/lib/url/source";

type PageKey = "home" | "sources" | "wiki" | "settings";

type PendingSave = {
  url: string;
  title: string;
  text: string;
};

const emptyPendingSave: PendingSave = {
  url: "",
  title: "",
  text: ""
};

function platformLabel(item: SavedLink) {
  return item.source_platform || detectPlatform(item.source_url);
}

function formatDate(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function uniqueList(values: Array<string | null | undefined>, limit = 12) {
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value, index, arr) => arr.indexOf(value) === index)
    .slice(0, limit);
}

function wikilinksFromMarkdown(markdown = "") {
  return [...markdown.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
}

function summarizeItem(item: SavedLink) {
  if (item.summary) return item.summary;
  if (
    (item.transcript_status === "missing_gemini_key" || item.transcript_status === "missing_openai_key") &&
    item.transcript_excerpt
  ) {
    return item.transcript_excerpt.replace(/\s+/g, " ").slice(0, 260);
  }
  if (item.selected_text) return item.selected_text.slice(0, 240);
  if (platformLabel(item) === "linkedin") return "아직 요약이 생성되지 않은 LinkedIn 게시물입니다.";
  return "저장된 원문을 바탕으로 분석을 기다리는 중입니다.";
}

function statusLabel(item: SavedLink) {
  const status = item.transcript_status || "";
  if (status === "ok") return "Gemini 분석 완료";
  if (status === "missing_gemini_key") return "Gemini 키 없음: 자막 미리보기";
  if (status === "missing_openai_key") return "이전 OpenAI 키 없음 기록";
  if (status === "no_caption_track") return "사용 가능한 자막 없음";
  if (status === "caption_fetch_failed") return "자막 불러오기 실패";
  if (status) return status;
  return "저장됨";
}

export function LinkVaultApp() {
  const [page, setPage] = useState<PageKey>("home");
  const [email, setEmail] = useState("");
  const [quickUrl, setQuickUrl] = useState("");
  const [items, setItems] = useState<SavedLink[]>([]);
  const [message, setMessage] = useState("이메일을 입력하고 저장 목록을 불러오세요.");
  const [pendingSave, setPendingSave] = useState<PendingSave>(emptyPendingSave);
  const [modalOpen, setModalOpen] = useState(false);
  const [saveEmail, setSaveEmail] = useState("");
  const [saveTitle, setSaveTitle] = useState("");
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState("");
  const supabaseReady = hasSupabaseConfig();

  useEffect(() => {
    const savedEmail = localStorage.getItem("linkvault_save_email") || "";
    setEmail(savedEmail);
    setSaveEmail(savedEmail);

    const params = new URLSearchParams(window.location.search);
    if (params.get("save") === "1") {
      const next = {
        url: params.get("url") || "",
        title: params.get("title") || "",
        text: params.get("text") || ""
      };
      setPendingSave(next);
      setSaveTitle(next.title);
      setModalOpen(true);
    }
    if (savedEmail && supabaseReady) {
      void loadSavedLinks(savedEmail)
        .then((data) => {
          setItems(data);
          setMessage(data.length ? "" : "아직 저장된 링크가 없습니다.");
        })
        .catch((err: unknown) => {
          setMessage(err instanceof Error ? err.message : "저장 목록을 불러오지 못했습니다.");
        });
    }
  }, [supabaseReady]);

  const concepts = useMemo(() => {
    const map = new Map<string, SavedLink[]>();
    items.forEach((item) => {
      const values = uniqueList([
        ...(item.wikilinks || []),
        ...wikilinksFromMarkdown(item.markdown_summary || ""),
        ...(item.topics || []),
        ...(item.keywords || [])
      ], 16);
      values.forEach((label) => {
        const list = map.get(label) || [];
        list.push(item);
        map.set(label, list);
      });
    });
    return [...map.entries()]
      .map(([label, linkedItems]) => ({ label, items: linkedItems }))
      .sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label))
      .slice(0, 18);
  }, [items]);

  function openSaveModal(data: PendingSave) {
    const next = {
      url: data.url || "",
      title: data.title || "",
      text: data.text || ""
    };
    setPendingSave(next);
    setSaveTitle(next.title);
    setSaveEmail(localStorage.getItem("linkvault_save_email") || email);
    setSaveError("");
    setBusy("");
    setModalOpen(true);
  }

  async function analyzeYouTubeLink(url: string, title: string) {
    const response = await fetch("/api/analyze-youtube", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ url, title })
    });
    if (!response.ok) return null;
    const data = (await response.json()) as AnalyzeYouTubeResponse | { error?: string };
    if ("error" in data && data.error) return null;
    return data as AnalyzeYouTubeResponse;
  }

  async function handleLoadSavedLinks(event?: FormEvent) {
    event?.preventDefault();
    if (!email.trim()) {
      setMessage("저장할 때 사용한 이메일을 입력해 주세요.");
      return;
    }
    if (!supabaseReady) {
      setMessage("Supabase 환경변수를 먼저 설정해 주세요.");
      return;
    }

    setBusy("loading");
    setMessage("저장 목록을 불러오는 중...");
    try {
      const data = await loadSavedLinks(email.trim());
      localStorage.setItem("linkvault_save_email", email.trim());
      setItems(data);
      setMessage(data.length ? "" : "아직 저장된 링크가 없습니다.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "저장 목록을 불러오지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function handleQuickSubmit(event: FormEvent) {
    event.preventDefault();
    const url = quickUrl.trim();
    if (!url) return;
    setBusy("metadata");
    try {
      let title = "";
      if (detectPlatform(url) === "youtube") {
        const response = await fetch("/api/youtube-metadata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url })
        });
        if (response.ok) {
          const data = (await response.json()) as { title?: string };
          title = data.title || "";
        }
      }
      openSaveModal({ url, title, text: "" });
    } finally {
      setBusy("");
    }
  }

  async function handleSaveSubmit(event: FormEvent) {
    event.preventDefault();
    setSaveError("");

    const ownerEmail = saveEmail.trim();
    const title = saveTitle.trim() || pendingSave.title || "Untitled";
    if (!pendingSave.url) {
      setSaveError("저장할 URL이 없습니다.");
      return;
    }
    if (!ownerEmail) {
      setSaveError("이메일을 입력해 주세요.");
      return;
    }
    if (!supabaseReady) {
      setSaveError("Supabase 환경변수를 먼저 설정해 주세요.");
      return;
    }

    setBusy("saving");
    try {
      localStorage.setItem("linkvault_save_email", ownerEmail);
      setEmail(ownerEmail);
      setBusy("checking-schema");
      await assertSavedLinksSchema();
      const platform = detectPlatform(pendingSave.url);
      const existing = await findExistingSavedLink(ownerEmail, pendingSave.url);
      if (existing) {
        setSaveError(`이미 저장된 링크입니다: ${existing.title || existing.source_url}`);
        return;
      }

      let analysis: AnalyzeYouTubeResponse | null = null;
      if (platform === "youtube") {
        setBusy("analyzing");
        analysis = await analyzeYouTubeLink(pendingSave.url, title);
      }

      setBusy("saving");
      await saveLink({
        owner_email: ownerEmail,
        source_url: pendingSave.url,
        canonical_source_url: canonicalizeSourceUrl(pendingSave.url),
        title,
        selected_text: pendingSave.text || null,
        source_platform: platform,
        summary: analysis?.summary || null,
        keywords: analysis?.keywords || [],
        topics: analysis?.topics || [],
        wikilinks: analysis?.wikilinks || [],
        markdown_source: analysis?.markdown_source || null,
        markdown_summary: analysis?.markdown_summary || null,
        transcript_status: analysis?.transcript_status || null,
        transcript_excerpt: analysis?.transcript_excerpt || null,
        analyzed_at: analysis ? new Date().toISOString() : null
      });

      setModalOpen(false);
      setPendingSave(emptyPendingSave);
      setQuickUrl("");
      setPage("sources");
      const refreshed = await loadSavedLinks(ownerEmail);
      setItems(refreshed);
      setMessage(refreshed.length ? "" : "아직 저장된 링크가 없습니다.");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function handleDelete(item: SavedLink) {
    if (!email.trim()) return;
    const ok = window.confirm(`삭제할까요?\n${item.title || item.source_url}`);
    if (!ok) return;
    setBusy(`delete:${item.id}`);
    try {
      await deleteSavedLink(item.id, email.trim());
      setItems((current) => current.filter((saved) => saved.id !== item.id));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "삭제하지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function handleReanalyze(item: SavedLink) {
    const ok = window.confirm(`다시 분석할까요?\n${item.title || item.source_url}`);
    if (!ok || !email.trim()) return;
    setBusy(`reanalyze:${item.id}`);
    try {
      const analysis = await analyzeYouTubeLink(item.source_url, item.title || "Untitled");
      if (!analysis) {
        window.alert("분석 API를 호출하지 못했습니다.");
        return;
      }
      const updated = await updateSavedLinkAnalysis(item.id, email.trim(), {
        summary: analysis.summary || null,
        keywords: analysis.keywords || [],
        topics: analysis.topics || [],
        wikilinks: analysis.wikilinks || [],
        markdown_source: analysis.markdown_source || null,
        markdown_summary: analysis.markdown_summary || null,
        transcript_status: analysis.transcript_status || null,
        transcript_excerpt: analysis.transcript_excerpt || null,
        analyzed_at: new Date().toISOString()
      });
      setItems((current) => current.map((saved) => (saved.id === item.id ? updated : saved)));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "다시 분석 중 오류가 발생했습니다.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="lv-shell">
      <aside className="lv-sidebar">
        <div>
          <div className="lv-brand">
            <span className="lv-brand-mark">L</span>
            LinkVault
          </div>
          <nav className="lv-nav" aria-label="LinkVault pages">
            {[
              ["home", "홈"],
              ["sources", "소스"],
              ["wiki", "위키"],
              ["settings", "설정"]
            ].map(([key, label]) => (
              <button
                className={page === key ? "active" : ""}
                key={key}
                type="button"
                onClick={() => setPage(key as PageKey)}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
        <div className="lv-profile">
          <strong>My Space</strong>
          <span>{email || "이메일 기준 라이브러리"}</span>
        </div>
      </aside>

      <main className="lv-main">
        {page === "home" && (
          <section className="lv-page">
            <div className="lv-topbar">
              <div>
                <h1>오늘도 지식을 수집하고 정리해봐요</h1>
                <p>YouTube 링크를 저장하면 자막을 가져와 위키형 요약과 개념으로 바꿉니다.</p>
              </div>
              <button className="lv-icon-button" type="button" onClick={() => openSaveModal({ url: "", title: "", text: "" })}>
                +
              </button>
            </div>
            <div className="lv-hero-panel">
              <span className="lv-pill">오늘 MVP: 북마클릿 저장</span>
              <h2>
                보고 있는 링크를
                <br />
                한 번에 저장하세요.
              </h2>
              <p>북마클릿으로 저장하거나, 아래 입력창에서 바로 저장 모달을 열 수 있습니다.</p>
              <form className="lv-url-capture" onSubmit={handleQuickSubmit}>
                <input
                  type="url"
                  value={quickUrl}
                  onChange={(event) => setQuickUrl(event.target.value)}
                  placeholder="YouTube URL을 붙여넣으세요"
                />
                <button className="lv-primary" type="submit" disabled={busy === "metadata"}>
                  {busy === "metadata" ? "확인 중" : "추가하기"}
                </button>
              </form>
              <div className="lv-quick-grid">
                {[
                  ["YouTube", "자막 추출", "저장 즉시 분석 시작"],
                  ["Wiki", "마크다운 요약", "개인 지식 노트 생성"],
                  ["Graph", "개념 연결", "[[위키링크]] 기반"],
                  ["Source", "출처 보관", "원문 URL과 함께 저장"]
                ].map(([eyebrow, title, desc]) => (
                  <div className="lv-quick-card" key={title}>
                    <span>{eyebrow}</span>
                    <strong>{title}</strong>
                    <small>{desc}</small>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {page === "sources" && (
          <section className="lv-page">
            <div className="lv-topbar">
              <div>
                <h1>소스</h1>
                <p>북마클릿으로 저장한 링크와 분석 상태를 최신순으로 확인합니다.</p>
              </div>
              <button className="lv-primary" type="button" onClick={() => openSaveModal({ url: "", title: "", text: "" })}>
                URL 추가
              </button>
            </div>
            <div className="lv-panel">
              <form className="lv-toolbar" onSubmit={handleLoadSavedLinks}>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="저장할 때 입력한 이메일"
                />
                <button className="lv-primary" type="submit" disabled={busy === "loading"}>
                  {busy === "loading" ? "불러오는 중" : "불러오기"}
                </button>
              </form>
              {!items.length && <div className="lv-empty">{message}</div>}
              <div className="lv-list">
                {items.map((item) => (
                  <article className="lv-saved-item" key={item.id}>
                    <div>
                      <div className="lv-item-head">
                        <h3>{item.title || "Untitled"}</h3>
                        <span>{platformLabel(item)}</span>
                      </div>
                      <a href={item.source_url} target="_blank" rel="noreferrer">
                        {item.source_url}
                      </a>
                      <div className="lv-meta">
                        <span>{formatDate(item.created_at)}</span>
                        <span>{statusLabel(item)}</span>
                      </div>
                      <p>{summarizeItem(item)}</p>
                      {!!uniqueList([...(item.keywords || []), ...(item.wikilinks || [])], 8).length && (
                        <div className="lv-chip-row">
                          {uniqueList([...(item.keywords || []), ...(item.wikilinks || [])], 8).map((keyword) => (
                            <span key={keyword}>{keyword}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="lv-actions">
                      {platformLabel(item) === "youtube" && (
                        <button type="button" onClick={() => handleReanalyze(item)} disabled={busy === `reanalyze:${item.id}`}>
                          {busy === `reanalyze:${item.id}` ? "분석 중" : "다시 분석"}
                        </button>
                      )}
                      <a href={item.source_url} target="_blank" rel="noreferrer">
                        원문 열기
                      </a>
                      <button type="button" onClick={() => handleDelete(item)} disabled={busy === `delete:${item.id}`}>
                        삭제
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {page === "wiki" && (
          <section className="lv-page">
            <div className="lv-topbar">
              <div>
                <h1>위키</h1>
                <p>저장한 콘텐츠가 어떤 개념으로 연결되는지 봅니다.</p>
              </div>
              <button className="lv-secondary" type="button" onClick={() => void handleLoadSavedLinks()}>
                그래프 새로고침
              </button>
            </div>
            <div className="lv-panel">
              {!concepts.length && <div className="lv-empty">소스 페이지에서 저장 목록을 불러오면 그래프가 표시됩니다.</div>}
              <div className="lv-concepts">
                {concepts.map((concept) => (
                  <article className="lv-concept" key={concept.label}>
                    <strong>[[{concept.label}]]</strong>
                    <span>{concept.items.length}개 콘텐츠</span>
                    <p>{concept.items.map((item) => item.title || "Untitled").join(", ")}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {page === "settings" && (
          <section className="lv-page">
            <div className="lv-topbar">
              <div>
                <h1>설정</h1>
                <p>북마클릿 설치와 앱 주소 설정을 관리합니다.</p>
              </div>
            </div>
            <BookmarkletPanel />
          </section>
        )}
      </main>

      {modalOpen && (
        <div className="lv-modal-scrim" role="presentation">
          <form className="lv-modal" onSubmit={handleSaveSubmit}>
            <div className="lv-modal-head">
              <h2>LinkVault에 저장</h2>
              <button type="button" onClick={() => setModalOpen(false)}>
                닫기
              </button>
            </div>
            <label>
              이메일
              <input
                type="email"
                value={saveEmail}
                onChange={(event) => setSaveEmail(event.target.value)}
                required
              />
            </label>
            <label>
              제목
              <input value={saveTitle} onChange={(event) => setSaveTitle(event.target.value)} placeholder="Untitled" />
            </label>
            <div className="lv-save-preview">
              <strong>{saveTitle || pendingSave.title || "Untitled"}</strong>
              <span>{pendingSave.url || "저장할 URL을 입력하세요."}</span>
              {pendingSave.text && <p>{pendingSave.text}</p>}
            </div>
            {!pendingSave.url && (
              <label>
                URL
                <input
                  type="url"
                  value={pendingSave.url}
                  onChange={(event) => setPendingSave((current) => ({ ...current, url: event.target.value }))}
                  required
                />
              </label>
            )}
            {saveError && <div className="lv-error">{saveError}</div>}
            <button
              className="lv-primary"
              type="submit"
              disabled={busy === "saving" || busy === "analyzing" || busy === "checking-schema"}
            >
              {busy === "checking-schema"
                ? "DB 확인 중"
                : busy === "analyzing"
                  ? "자막 분석 중"
                  : busy === "saving"
                    ? "저장 중"
                    : "저장하기"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function BookmarkletPanel() {
  const [appUrl, setAppUrl] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("linkvault_app_url") || "";
    const current = `${window.location.origin}${window.location.pathname}`.replace(/\/$/, "");
    setAppUrl(saved || current);
  }, []);

  const bookmarklet = useMemo(() => {
    const cleanUrl = appUrl.trim().replace(/\/$/, "");
    return `javascript:(()=>{const app='${cleanUrl.replace(/'/g, "\\'")}';if(!/^https?:/.test(app)){alert('LinkVault 앱 주소를 https 배포 URL로 설정한 뒤 북마클릿을 다시 설치해 주세요.');return;}const u=encodeURIComponent(location.href);const t=encodeURIComponent(document.title||'');const selected=window.getSelection?String(window.getSelection()):'';const s=encodeURIComponent(selected.slice(0,4000));window.open(app+'?save=1&url='+u+'&title='+t+'&text='+s,'_blank','noopener,noreferrer,width=520,height=720');})();`;
  }, [appUrl]);

  function handleAppUrlChange(value: string) {
    setAppUrl(value);
    localStorage.setItem("linkvault_app_url", value.trim().replace(/\/$/, ""));
  }

  return (
    <div className="lv-panel lv-install-panel">
      <span className="lv-pill">Install</span>
      <h2>Save to LinkVault</h2>
      <p>아래 버튼을 브라우저 북마크바로 드래그하세요. 설치 후 어떤 페이지에서든 버튼을 누르면 저장 모달이 열립니다.</p>
      <label>
        LinkVault 앱 주소
        <input
          type="url"
          value={appUrl}
          onChange={(event) => handleAppUrlChange(event.target.value)}
          placeholder="https://your-linkvault.vercel.app"
        />
      </label>
      <a className="lv-bookmarklet" href={bookmarklet}>
        Save to LinkVault
      </a>
      <div className="lv-install-note">
        북마크바가 안 보이면 Chrome에서 Ctrl+Shift+B를 누르세요. 배포 URL에서 만든 북마클릿을 쓰면 외부 페이지 저장이 가장 안정적입니다.
      </div>
    </div>
  );
}
