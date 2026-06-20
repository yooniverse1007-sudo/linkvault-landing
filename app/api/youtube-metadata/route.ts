import { NextResponse } from "next/server";
import { getVideoId } from "@/lib/youtube/ids";
import { fetchYouTubeTitle } from "@/lib/youtube/metadata";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { url?: string };
    const url = body.url || "";
    const videoId = getVideoId(url);
    if (!videoId) {
      return NextResponse.json({ error: "Not a supported YouTube URL" }, { status: 400 });
    }

    const title = await fetchYouTubeTitle(url, videoId);
    return NextResponse.json({
      video_id: videoId,
      title: title || ""
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Metadata lookup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
