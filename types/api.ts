export type YouTubeMetadataResponse = {
  video_id: string;
  title: string;
};

export type AnalyzeYouTubeResponse = {
  video_id: string;
  summary: string;
  keywords: string[];
  topics: string[];
  wikilinks: string[];
  markdown_source: string;
  markdown_summary: string;
  transcript_status: string;
  transcript_language: string;
  caption_kind: string;
  transcript_excerpt: string;
};

export type CaptionLine = {
  start: number;
  text: string;
};

export type CaptionTrack = {
  baseUrl: string;
  languageCode?: string;
  kind?: string;
  name?: string | { simpleText?: string };
};
