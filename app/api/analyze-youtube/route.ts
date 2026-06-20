import { NextResponse } from "next/server";
import { fallbackKeywords, summarizeWithGemini } from "@/lib/gemini/summarize";
import { buildMarkdownSource } from "@/lib/markdown/wiki";
import { getVideoId } from "@/lib/youtube/ids";
import { fetchTranscript } from "@/lib/youtube/transcript";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      url?: string;
      title?: string;
    };
    const url = body.url || "";
    const title = body.title || "";
    const videoId = getVideoId(url);
    if (!videoId) {
      return NextResponse.json({ error: "Not a supported YouTube URL" }, { status: 400 });
    }

    const transcriptResult = await fetchTranscript(videoId);
    const markdownSource = buildMarkdownSource({
      title,
      url,
      videoId,
      language: transcriptResult.language || "",
      lines: transcriptResult.lines || []
    });

    if (!transcriptResult.transcript) {
      return NextResponse.json({
        video_id: videoId,
        summary: "",
        keywords: fallbackKeywords(title),
        topics: [],
        wikilinks: [],
        markdown_source: markdownSource,
        markdown_summary: "",
        transcript_status: transcriptResult.status,
        transcript_language: transcriptResult.language || "",
        caption_kind: transcriptResult.caption_kind || "",
        transcript_excerpt: ""
      });
    }

    const analysis = await summarizeWithGemini({
      title,
      url,
      transcript: transcriptResult.transcript,
      markdownSource
    });

    return NextResponse.json({
      video_id: videoId,
      summary: analysis.summary,
      keywords: analysis.keywords,
      topics: analysis.topics || [],
      wikilinks: analysis.wikilinks || [],
      markdown_source: markdownSource,
      markdown_summary: analysis.markdown_summary || "",
      transcript_status: analysis.status === "ok" ? "ok" : analysis.status,
      transcript_language: transcriptResult.language || "",
      caption_kind: transcriptResult.caption_kind || "",
      transcript_excerpt: transcriptResult.transcript.slice(0, 4000)
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
