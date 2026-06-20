import { extractWikiLinks } from "@/lib/markdown/wiki";

function normalizeList(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item).replace(/^\[\[|\]\]$/g, "").trim())
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .slice(0, limit);
}

function transcriptPreview(transcript: string, limit = 420) {
  return transcript
    .split("\n")
    .slice(0, 10)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

export function fallbackKeywords(text: string) {
  const stop = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "this",
    "that",
    "you",
    "your",
    "how",
    "what",
    "youtube",
    "youtu",
    "watch",
    "https",
    "http",
    "www",
    "com"
  ]);
  const counts = new Map<string, number>();
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 1 && !stop.has(word) && !/^\d+$/.test(word))
    .forEach((word) => counts.set(word, (counts.get(word) || 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([word]) => word);
}

function fallbackMarkdownSummary({
  title,
  sourceUrl,
  transcript,
  keywords
}: {
  title: string;
  sourceUrl: string;
  transcript: string;
  keywords: string[];
}) {
  const preview = transcriptPreview(transcript, 700);
  const links = keywords.slice(0, 6).map((keyword) => `[[${keyword}]]`);
  return [
    "---",
    "type: transcript_preview",
    `title: ${JSON.stringify(title || "Untitled")}`,
    `source_url: ${JSON.stringify(sourceUrl || "")}`,
    "status: missing_gemini_key",
    "---",
    "",
    `# ${title || "Untitled"}`,
    "",
    "## 자막 미리보기",
    preview || "자막은 불러왔지만 LLM 요약은 생성하지 못했습니다.",
    "",
    "## 임시 개념",
    ...links.map((link) => `- ${link}`)
  ].join("\n");
}

export async function summarizeWithGemini({
  title,
  url,
  transcript,
  markdownSource
}: {
  title: string;
  url: string;
  transcript: string;
  markdownSource: string;
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const keywords = fallbackKeywords(`${title} ${transcript}`);
    const markdownSummary = fallbackMarkdownSummary({ title, sourceUrl: url, transcript, keywords });
    return {
      summary: "",
      keywords,
      topics: keywords.slice(0, 5),
      wikilinks: extractWikiLinks(markdownSummary),
      markdown_summary: markdownSummary,
      status: "missing_gemini_key"
    };
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const clippedSource = markdownSource.slice(0, 55000);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [
          {
            text: [
              "You turn YouTube transcripts into a Korean personal knowledge wiki.",
              "Return content that follows the provided JSON schema.",
              "The summary must synthesize the full transcript, not copy opening captions.",
              "Wikilinks must be short reusable noun concepts.",
              "Avoid long phrases, full sentences, generic words, and duplicate concepts."
            ].join(" ")
          }
        ]
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: [
                "Create a wiki-style note from this transcript markdown.",
                "",
                "summary requirements:",
                "- Write a Korean summary in 3-5 sentences.",
                "- Explain the main argument, useful insight, and why this source matters.",
                "- Do not mention that this is a transcript.",
                "- Do not simply quote the first lines.",
                "",
                "markdown_summary sections:",
                "- 핵심 요약",
                "- 주요 개념",
                "- 기억할 문장",
                "- 연결 후보",
                "",
                clippedSource
              ].join("\n")
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          required: ["summary", "keywords", "topics", "wikilinks", "markdown_summary"],
          properties: {
            summary: { type: "STRING" },
            keywords: {
              type: "ARRAY",
              items: { type: "STRING" }
            },
            topics: {
              type: "ARRAY",
              items: { type: "STRING" }
            },
            wikilinks: {
              type: "ARRAY",
              items: { type: "STRING" }
            },
            markdown_summary: { type: "STRING" }
          }
        }
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini request failed: ${response.status} ${detail.slice(0, 300)}`);
  }

  const data = await response.json();
  const output =
    data.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text || "")
      .join("") || "{}";
  const jsonMatch = output.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : output);
  const markdownSummary = String(parsed.markdown_summary || "").slice(0, 20000);
  const wikilinks = normalizeList(parsed.wikilinks, 14);
  const extractedLinks = extractWikiLinks(markdownSummary);
  const keywords = normalizeList(parsed.keywords, 10);
  const resolvedWikilinks = wikilinks.length ? wikilinks : extractedLinks;

  return {
    summary: String(parsed.summary || "").slice(0, 1200),
    keywords: keywords.length ? keywords : resolvedWikilinks.slice(0, 10),
    topics: normalizeList(parsed.topics, 8),
    wikilinks: resolvedWikilinks,
    markdown_summary: markdownSummary,
    status: "ok"
  };
}
