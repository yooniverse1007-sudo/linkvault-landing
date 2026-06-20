import { decodeHtml, YOUTUBE_HEADERS } from "./shared";

export async function fetchOEmbedTitle(url: string) {
  const oembed = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`;
  const response = await fetch(oembed, { headers: YOUTUBE_HEADERS });
  if (!response.ok) return "";
  const data = (await response.json()) as { title?: string };
  return data.title ? String(data.title).trim() : "";
}

export async function fetchPageTitle(videoId: string) {
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const response = await fetch(watchUrl, { headers: YOUTUBE_HEADERS });
  if (!response.ok) return "";
  const html = await response.text();
  const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)?.[1];
  if (ogTitle) return decodeHtml(ogTitle);
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
  return decodeHtml(title || "").replace(/\s*-\s*YouTube\s*$/i, "");
}

export async function fetchYouTubeTitle(url: string, videoId: string) {
  return (await fetchOEmbedTitle(url)) || (await fetchPageTitle(videoId));
}
