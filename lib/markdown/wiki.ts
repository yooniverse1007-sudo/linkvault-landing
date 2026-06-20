import type { CaptionLine } from "@/types/api";
import { toTimestamp, yamlString } from "@/lib/youtube/shared";

export function buildMarkdownSource({
  title,
  url,
  videoId,
  language,
  lines
}: {
  title: string;
  url: string;
  videoId: string;
  language?: string;
  lines: CaptionLine[];
}) {
  const body = lines.map((line) => `- [${toTimestamp(line.start)}] ${line.text}`).join("\n");

  return [
    "---",
    "type: youtube_transcript",
    `source_url: ${yamlString(url)}`,
    `title: ${yamlString(title || "Untitled")}`,
    `video_id: ${yamlString(videoId)}`,
    `language: ${yamlString(language || "")}`,
    `generated_at: ${yamlString(new Date().toISOString())}`,
    "---",
    "",
    `# Transcript: ${title || "Untitled"}`,
    "",
    body || "_No transcript lines were available._"
  ].join("\n");
}

export function extractWikiLinks(markdown = "") {
  return [...markdown.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)]
    .map((match) => match[1].trim())
    .filter(Boolean)
    .filter((term, index, arr) => arr.indexOf(term) === index)
    .slice(0, 16);
}
