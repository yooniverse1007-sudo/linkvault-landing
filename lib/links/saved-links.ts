import { supabase } from "@/lib/supabase/client";
import { canonicalizeSourceUrl } from "@/lib/url/source";
import type { SavedLink } from "@/types/linkvault";

export type SaveLinkPayload = {
  owner_email: string;
  source_url: string;
  canonical_source_url?: string | null;
  title: string;
  source_platform: string;
  selected_text?: string | null;
  summary?: string | null;
  keywords?: string[] | null;
  topics?: string[] | null;
  wikilinks?: string[] | null;
  markdown_source?: string | null;
  markdown_summary?: string | null;
  transcript_status?: string | null;
  transcript_excerpt?: string | null;
  analyzed_at?: string | null;
};

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
  return supabase;
}

function throwSupabaseError(error: {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}): never {
  if (
    error.code === "PGRST204" ||
    /canonical_source_url|summary|keywords|topics|wikilinks|markdown|transcript|analyzed_at|schema cache/i.test(
      error.message || ""
    )
  ) {
    throw new Error(
      "Supabase saved_links 스키마가 최신이 아닙니다. SQL Editor에서 supabase_mvp_setup.sql을 실행해 주세요."
    );
  }

  if (error.code === "42501") {
    throw new Error("Supabase RLS 정책이 저장 작업을 허용하지 않습니다. 최신 SQL 정책을 적용해 주세요.");
  }

  throw new Error(error.message || "Supabase 요청에 실패했습니다.");
}

export async function loadSavedLinks(email: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("saved_links")
    .select("*")
    .eq("owner_email", email)
    .order("created_at", { ascending: false });

  if (error) throwSupabaseError(error);
  return (data || []) as SavedLink[];
}

export async function assertSavedLinksSchema() {
  const client = requireSupabase();
  const { error } = await client
    .from("saved_links")
    .select(
      "canonical_source_url,summary,keywords,topics,wikilinks,markdown_source,markdown_summary,transcript_status,transcript_excerpt,analyzed_at"
    )
    .limit(1);

  if (error) throwSupabaseError(error);
}

export async function findExistingSavedLink(email: string, url: string) {
  const client = requireSupabase();
  const canonical = canonicalizeSourceUrl(url);
  const { data, error } = await client
    .from("saved_links")
    .select("*")
    .eq("owner_email", email)
    .limit(500);

  if (error) throwSupabaseError(error);
  return (
    ((data || []) as SavedLink[]).find((item) => {
      const rowCanonical = item.canonical_source_url || canonicalizeSourceUrl(item.source_url);
      return rowCanonical === canonical || item.source_url === url;
    }) || null
  );
}

export async function saveLink(payload: SaveLinkPayload) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("saved_links")
    .insert(payload)
    .select("*")
    .single();

  if (error) throwSupabaseError(error);
  return data as SavedLink;
}

export async function deleteSavedLink(id: string, ownerEmail: string) {
  const client = requireSupabase();
  const { error } = await client
    .from("saved_links")
    .delete()
    .eq("id", id)
    .eq("owner_email", ownerEmail);

  if (error) throwSupabaseError(error);
}

export async function updateSavedLinkAnalysis(
  id: string,
  ownerEmail: string,
  payload: Partial<Pick<
    SavedLink,
    | "summary"
    | "keywords"
    | "topics"
    | "wikilinks"
    | "markdown_source"
    | "markdown_summary"
    | "transcript_status"
    | "transcript_excerpt"
    | "analyzed_at"
  >>
) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("saved_links")
    .update(payload)
    .eq("id", id)
    .eq("owner_email", ownerEmail)
    .select("*")
    .single();

  if (error) throwSupabaseError(error);
  return data as SavedLink;
}
