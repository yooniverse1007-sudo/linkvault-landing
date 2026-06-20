export function detectPlatform(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
    if (host.includes("linkedin.com")) return "linkedin";
    if (host.includes("instagram.com")) return "instagram";
    return host || "web";
  } catch {
    return "web";
  }
}

export function getYouTubeVideoId(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      return parsed.pathname.split("/").filter(Boolean)[0] || "";
    }
    if (host.includes("youtube.com")) {
      if (parsed.searchParams.get("v")) return parsed.searchParams.get("v") || "";
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts[0] === "shorts" || parts[0] === "embed") return parts[1] || "";
    }
    return "";
  } catch {
    return "";
  }
}

export function canonicalizeSourceUrl(url: string) {
  try {
    if (detectPlatform(url) === "youtube") {
      const videoId = getYouTubeVideoId(url);
      if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
    }

    const parsed = new URL(url);
    parsed.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"].forEach((param) =>
      parsed.searchParams.delete(param)
    );
    parsed.hostname = parsed.hostname.replace(/^www\./, "");
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return String(url || "").trim();
  }
}
