const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);

export function getVideoId(input: string) {
  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./, "");
    if (!YOUTUBE_HOSTS.has(url.hostname) && !YOUTUBE_HOSTS.has(host)) return "";
    if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || "";
    if (url.searchParams.get("v")) return url.searchParams.get("v") || "";
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "shorts" || parts[0] === "embed") return parts[1] || "";
    return "";
  } catch {
    return "";
  }
}
