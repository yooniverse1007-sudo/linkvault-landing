const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);
const PAGE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36 LinkVault/1.0',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cookie': 'CONSENT=YES+cb.20210328-17-p0.ko+FX+111; SOCS=CAI'
};

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function getVideoId(input) {
  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./, '');
    if (!YOUTUBE_HOSTS.has(url.hostname) && !YOUTUBE_HOSTS.has(host)) return '';
    if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || '';
    if (url.searchParams.get('v')) return url.searchParams.get('v') || '';
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'shorts' || parts[0] === 'embed') return parts[1] || '';
    return '';
  } catch (_err) {
    return '';
  }
}

function decodeHtml(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchOEmbedTitle(url) {
  const oembed = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`;
  const response = await fetch(oembed, { headers: PAGE_HEADERS });
  if (!response.ok) return '';
  const data = await response.json();
  return data?.title ? String(data.title).trim() : '';
}

async function fetchPageTitle(videoId) {
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const response = await fetch(watchUrl, { headers: PAGE_HEADERS });
  if (!response.ok) return '';
  const html = await response.text();
  const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)?.[1];
  if (ogTitle) return decodeHtml(ogTitle);
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
  return decodeHtml(title || '').replace(/\s*-\s*YouTube\s*$/i, '');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const url = body.url || '';
    const videoId = getVideoId(url);
    if (!videoId) {
      return json(res, 400, { error: 'Not a supported YouTube URL' });
    }

    const title = await fetchOEmbedTitle(url) || await fetchPageTitle(videoId);
    return json(res, 200, {
      video_id: videoId,
      title: title || ''
    });
  } catch (err) {
    return json(res, 500, { error: err.message || 'Metadata lookup failed' });
  }
};
