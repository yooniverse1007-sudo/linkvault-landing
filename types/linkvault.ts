export type SavedLink = {
  id: string;
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
  created_at: string;
};

export type WaitlistEntry = {
  id: string;
  email: string;
  created_at: string;
};
