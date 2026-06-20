import type { CaptionLine, CaptionTrack } from "@/types/api";
import { decodeHtml, toTimestamp, YOUTUBE_HEADERS } from "./shared";

const ANDROID_CLIENT_VERSION = "20.10.38";
const ANDROID_HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": `com.google.android.youtube/${ANDROID_CLIENT_VERSION} (Linux; U; Android 14)`,
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7"
};

export type TranscriptResult = {
  status: string;
  transcript: string;
  lines: CaptionLine[];
  language?: string;
  caption_kind?: string;
};

function extractInitialPlayerResponse(html: string) {
  const markerIndex = html.indexOf("ytInitialPlayerResponse");
  if (markerIndex === -1) return null;
  const start = html.indexOf("{", markerIndex);
  if (start === -1) return null;
  return extractJsonValue(html, start, "{", "}");
}

function extractJsonArrayAfterMarker(html = "", marker: string) {
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) return null;
  const start = html.indexOf("[", markerIndex);
  if (start === -1) return null;
  return extractJsonValue(html, start, "[", "]");
}

function extractJsonValue(html: string, start: number, open: string, close: string) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const char = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    if (char === open) depth++;
    if (char === close) depth--;
    if (depth === 0) {
      try {
        return JSON.parse(html.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function extractInnertubeConfig(html = "") {
  const apiKey =
    html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1] ||
    html.match(/INNERTUBE_API_KEY['"]?\s*:\s*['"]([^'"]+)/)?.[1] ||
    "";
  const clientVersion =
    html.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/)?.[1] ||
    html.match(/clientVersion['"]?\s*:\s*['"]([^'"]+)/)?.[1] ||
    "";
  const visitorData =
    html.match(/"VISITOR_DATA":"([^"]+)"/)?.[1] ||
    html.match(/visitorData['"]?\s*:\s*['"]([^'"]+)/)?.[1] ||
    "";
  return { apiKey, clientVersion, visitorData };
}

async function fetchInnertubeTracks(videoId: string, html: string): Promise<CaptionTrack[]> {
  const { apiKey, clientVersion, visitorData } = extractInnertubeConfig(html);
  const clients = [
    {
      endpoint: "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
      headers: ANDROID_HEADERS,
      client: {
        clientName: "ANDROID",
        clientVersion: ANDROID_CLIENT_VERSION,
        androidSdkVersion: 30,
        hl: "ko",
        gl: "KR"
      }
    },
    {
      endpoint: apiKey ? `https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(apiKey)}` : "",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://www.youtube.com",
        Referer: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
        ...YOUTUBE_HEADERS
      },
      client: {
        clientName: "WEB",
        clientVersion: clientVersion || "2.20240601.00.00",
        hl: "ko",
        gl: "KR"
      }
    },
    {
      endpoint: apiKey ? `https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(apiKey)}` : "",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://www.youtube.com",
        Referer: `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`,
        ...YOUTUBE_HEADERS
      },
      client: {
        clientName: "WEB_EMBEDDED_PLAYER",
        clientVersion: clientVersion || "1.20240612.01.00",
        hl: "ko",
        gl: "KR"
      }
    }
  ];

  for (const attempt of clients.filter((item) => item.endpoint)) {
    const response = await fetch(attempt.endpoint, {
      method: "POST",
      headers: attempt.headers,
      body: JSON.stringify({
        context: {
          client: {
            ...attempt.client,
            visitorData: visitorData || undefined
          }
        },
        videoId,
        contentCheckOk: true,
        racyCheckOk: true,
        playbackContext: {
          contentPlaybackContext: {
            html5Preference: "HTML5_PREF_WANTS"
          }
        }
      })
    });
    if (!response.ok) continue;
    const data = await response.json();
    const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    if (tracks.length) return tracks;
  }

  return [];
}

function mergeCaptionTracks(...trackGroups: CaptionTrack[][]) {
  const seen = new Set<string>();
  const merged: CaptionTrack[] = [];
  trackGroups.flat().filter(Boolean).forEach((track) => {
    const key = [
      track.baseUrl || "",
      track.languageCode || "",
      track.kind || "",
      typeof track.name === "string" ? track.name : track.name?.simpleText || ""
    ].join("|");
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(track);
  });
  return merged;
}

function chooseCaptionTrack(tracks: CaptionTrack[]) {
  if (!tracks.length) return null;
  for (const lang of ["ko", "en"]) {
    const exact = tracks.find((track) => track.languageCode === lang);
    if (exact) return exact;
    const prefix = tracks.find((track) => (track.languageCode || "").startsWith(lang));
    if (prefix) return prefix;
  }
  return tracks[0];
}

function parseTimedTextTrackList(xml = "", videoId: string): CaptionTrack[] {
  const tracks: CaptionTrack[] = [];
  for (const match of xml.matchAll(/<track\b([^>]*)\/?>/g)) {
    const attrs: Record<string, string> = {};
    for (const attr of match[1].matchAll(/([\w-]+)="([^"]*)"/g)) {
      attrs[attr[1]] = decodeHtml(attr[2]);
    }
    const languageCode = attrs.lang_code || attrs.lang_original || "";
    if (!languageCode) continue;
    const params = new URLSearchParams({
      v: videoId,
      lang: languageCode,
      fmt: "json3"
    });
    if (attrs.kind) params.set("kind", attrs.kind);
    if (attrs.name) params.set("name", attrs.name);
    tracks.push({
      baseUrl: `https://www.youtube.com/api/timedtext?${params.toString()}`,
      languageCode,
      kind: attrs.kind || "",
      name: attrs.name || ""
    });
  }
  return tracks;
}

async function fetchTimedTextTracks(videoId: string) {
  const urls = [
    `https://www.youtube.com/api/timedtext?type=list&v=${encodeURIComponent(videoId)}&hl=ko&gl=KR`,
    `https://video.google.com/timedtext?type=list&v=${encodeURIComponent(videoId)}&hl=ko&gl=KR`
  ];
  for (const listUrl of urls) {
    const response = await fetch(listUrl, { headers: YOUTUBE_HEADERS });
    if (!response.ok) continue;
    const tracks = parseTimedTextTrackList(await response.text(), videoId);
    if (tracks.length) return tracks;
  }
  return [];
}

function parseTranscriptJson3(data: { events?: Array<{ tStartMs?: number; segs?: Array<{ utf8?: string }> }> }) {
  const lines: CaptionLine[] = [];
  for (const event of data.events || []) {
    const text = (event.segs || [])
      .map((seg) => seg.utf8 || "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    lines.push({ start: Math.floor((event.tStartMs || 0) / 1000), text });
  }
  return lines;
}

function parseTranscriptXml(xml = "") {
  const lines: CaptionLine[] = [];
  for (const match of xml.matchAll(/<(?:text|p)\b([^>]*)>([\s\S]*?)<\/(?:text|p)>/g)) {
    const attrs: Record<string, string> = {};
    for (const attr of match[1].matchAll(/([\w-]+)="([^"]*)"/g)) {
      attrs[attr[1]] = decodeHtml(attr[2]);
    }
    const text = decodeHtml(match[2])
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    lines.push({
      start: Math.floor(Number(attrs.start || attrs.t || 0) / (attrs.t ? 1000 : 1)),
      text
    });
  }
  return lines;
}

function captionUrls(baseUrl: string) {
  try {
    const original = new URL(baseUrl).toString();
    const json = new URL(baseUrl);
    json.searchParams.set("fmt", "json3");
    const srv3 = new URL(baseUrl);
    srv3.searchParams.set("fmt", "srv3");
    return [...new Set([json.toString(), original, srv3.toString()])];
  } catch {
    return [
      `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}fmt=json3`,
      baseUrl,
      `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}fmt=srv3`
    ];
  }
}

export async function fetchTranscript(videoId: string): Promise<TranscriptResult> {
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const page = await fetch(watchUrl, { headers: YOUTUBE_HEADERS });
  if (!page.ok) return { status: "youtube_page_failed", transcript: "", lines: [] };

  const html = await page.text();
  const player = extractInitialPlayerResponse(html);
  const playerTracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  const htmlTracks = extractJsonArrayAfterMarker(html, '"captionTracks":') || [];
  const innertubeTracks = await fetchInnertubeTracks(videoId, html);
  const timedTextTracks = await fetchTimedTextTracks(videoId);
  const tracks = mergeCaptionTracks(playerTracks, htmlTracks, innertubeTracks, timedTextTracks);
  const preferredTrack = chooseCaptionTrack(tracks);
  const orderedTracks = [preferredTrack, ...tracks.filter((track) => track !== preferredTrack)].filter(Boolean) as CaptionTrack[];

  if (!orderedTracks.length) return { status: "no_caption_track", transcript: "", lines: [] };

  for (const track of orderedTracks) {
    for (const transcriptUrl of captionUrls(track.baseUrl)) {
      const caption = await fetch(transcriptUrl, { headers: YOUTUBE_HEADERS });
      if (!caption.ok) continue;
      const body = await caption.text();
      let lines: CaptionLine[] = [];
      try {
        lines = parseTranscriptJson3(JSON.parse(body));
      } catch {
        lines = parseTranscriptXml(body);
      }
      const transcript = lines.map((line) => `[${toTimestamp(line.start)}] ${line.text}`).join("\n");
      if (transcript) {
        return {
          status: "ok",
          transcript,
          lines,
          language: track.languageCode || "",
          caption_kind: track.kind || ""
        };
      }
    }
  }

  return { status: "caption_fetch_failed", transcript: "", lines: [] };
}
