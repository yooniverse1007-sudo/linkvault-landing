const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);

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

function extractInitialPlayerResponse(html) {
  const marker = 'ytInitialPlayerResponse';
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) return null;
  const start = html.indexOf('{', markerIndex);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const char = html[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') inString = true;
    if (char === '{') depth++;
    if (char === '}') depth--;
    if (depth === 0) {
      try {
        return JSON.parse(html.slice(start, i + 1));
      } catch (_err) {
        return null;
      }
    }
  }
  return null;
}

function chooseCaptionTrack(tracks = []) {
  if (!tracks.length) return null;
  const priorities = ['ko', 'en'];
  for (const lang of priorities) {
    const exact = tracks.find(track => track.languageCode === lang);
    if (exact) return exact;
    const prefix = tracks.find(track => (track.languageCode || '').startsWith(lang));
    if (prefix) return prefix;
  }
  return tracks[0];
}

function parseTranscriptJson3(data) {
  const lines = [];
  for (const event of data.events || []) {
    const text = (event.segs || [])
      .map(seg => seg.utf8 || '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    const seconds = Math.floor((event.tStartMs || 0) / 1000);
    lines.push({
      start: seconds,
      text
    });
  }
  return lines;
}

async function fetchTranscript(videoId) {
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const page = await fetch(watchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 LinkVault/1.0'
    }
  });
  if (!page.ok) {
    return { status: 'youtube_page_failed', transcript: '', lines: [] };
  }

  const html = await page.text();
  const player = extractInitialPlayerResponse(html);
  const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  const track = chooseCaptionTrack(tracks);
  if (!track?.baseUrl) {
    return { status: 'no_caption_track', transcript: '', lines: [] };
  }

  const transcriptUrl = `${track.baseUrl}${track.baseUrl.includes('?') ? '&' : '?'}fmt=json3`;
  const caption = await fetch(transcriptUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 LinkVault/1.0'
    }
  });
  if (!caption.ok) {
    return { status: 'caption_fetch_failed', transcript: '', lines: [] };
  }

  const data = await caption.json();
  const lines = parseTranscriptJson3(data);
  const transcript = lines.map(line => `[${line.start}s] ${line.text}`).join('\n');
  return {
    status: transcript ? 'ok' : 'empty_caption',
    transcript,
    lines,
    language: track.languageCode || ''
  };
}

function fallbackKeywords(text) {
  const stop = new Set([
    'the', 'and', 'for', 'with', 'from', 'this', 'that', 'you', 'your', 'how', 'what',
    '영상', '콘텐츠', '링크', '하는', '있는', '그리고', '하지만', '대한', '에서'
  ]);
  const counts = new Map();
  (text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map(word => word.trim())
    .filter(word => word.length > 1 && !stop.has(word))
    .forEach(word => counts.set(word, (counts.get(word) || 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
}

async function summarizeWithOpenAI({ title, transcript }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const firstLines = transcript.split('\n').slice(0, 8).join(' ');
    return {
      summary: firstLines ? `${firstLines.slice(0, 240)}...` : '',
      keywords: fallbackKeywords(`${title} ${transcript}`),
      status: 'missing_openai_key'
    };
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const clippedTranscript = transcript.slice(0, 45000);
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content: 'You analyze YouTube transcripts for a personal knowledge base. Return compact Korean JSON only.'
        },
        {
          role: 'user',
          content: [
            '다음 YouTube 자막을 분석해 JSON만 반환하세요.',
            'schema: {"summary":"한국어 2-3문장 요약","keywords":["단어 단위 핵심 키워드 6-10개"],"topics":["관련 주제 3-5개"]}',
            `title: ${title || ''}`,
            `transcript:\n${clippedTranscript}`
          ].join('\n\n')
        }
      ]
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${detail.slice(0, 300)}`);
  }

  const data = await response.json();
  const output = data.output_text || data.output?.flatMap(item => item.content || []).map(part => part.text || '').join('') || '{}';
  const jsonMatch = output.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : output);
  return {
    summary: String(parsed.summary || '').slice(0, 1200),
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map(String).slice(0, 10) : fallbackKeywords(output),
    topics: Array.isArray(parsed.topics) ? parsed.topics.map(String).slice(0, 8) : [],
    status: 'ok'
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const url = body.url || '';
    const title = body.title || '';
    const videoId = getVideoId(url);
    if (!videoId) {
      return json(res, 400, { error: 'Not a supported YouTube URL' });
    }

    const transcriptResult = await fetchTranscript(videoId);
    if (!transcriptResult.transcript) {
      return json(res, 200, {
        video_id: videoId,
        summary: '',
        keywords: fallbackKeywords(title),
        topics: [],
        transcript_status: transcriptResult.status
      });
    }

    const analysis = await summarizeWithOpenAI({
      title,
      transcript: transcriptResult.transcript
    });

    return json(res, 200, {
      video_id: videoId,
      summary: analysis.summary,
      keywords: analysis.keywords,
      topics: analysis.topics || [],
      transcript_status: analysis.status === 'ok' ? 'ok' : analysis.status,
      transcript_language: transcriptResult.language || '',
      transcript_excerpt: transcriptResult.transcript.slice(0, 4000)
    });
  } catch (err) {
    return json(res, 500, {
      error: err.message || 'Analysis failed'
    });
  }
};
