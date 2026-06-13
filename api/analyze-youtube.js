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
    lines.push({ start: seconds, text });
  }
  return lines;
}

async function fetchTranscript(videoId) {
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const page = await fetch(watchUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 LinkVault/1.0' }
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
    headers: { 'User-Agent': 'Mozilla/5.0 LinkVault/1.0' }
  });
  if (!caption.ok) {
    return { status: 'caption_fetch_failed', transcript: '', lines: [] };
  }

  const data = await caption.json();
  const lines = parseTranscriptJson3(data);
  const transcript = lines.map(line => `[${toTimestamp(line.start)}] ${line.text}`).join('\n');
  return {
    status: transcript ? 'ok' : 'empty_caption',
    transcript,
    lines,
    language: track.languageCode || ''
  };
}

function toTimestamp(totalSeconds = 0) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

function yamlString(value = '') {
  return JSON.stringify(String(value).replace(/\r?\n/g, ' '));
}

function buildMarkdownSource({ title, url, videoId, language, lines }) {
  const body = (lines || [])
    .map(line => `- [${toTimestamp(line.start)}] ${line.text}`)
    .join('\n');

  return [
    '---',
    'type: youtube_transcript',
    `source_url: ${yamlString(url)}`,
    `title: ${yamlString(title || 'Untitled')}`,
    `video_id: ${yamlString(videoId)}`,
    `language: ${yamlString(language || '')}`,
    `generated_at: ${yamlString(new Date().toISOString())}`,
    '---',
    '',
    `# Transcript: ${title || 'Untitled'}`,
    '',
    body || '_No transcript lines were available._'
  ].join('\n');
}

function fallbackKeywords(text) {
  const stop = new Set([
    'the', 'and', 'for', 'with', 'from', 'this', 'that', 'you', 'your', 'how', 'what',
    '영상', '콘텐츠', '링크', '하는', '있는', '그리고', '하지만', '에서', '으로', '대한',
    'youtube', 'youtu', 'watch', 'https', 'http', 'www', 'com'
  ]);
  const counts = new Map();
  (text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map(word => word.trim())
    .filter(word => word.length > 1 && !stop.has(word) && !/^\d+$/.test(word))
    .forEach(word => counts.set(word, (counts.get(word) || 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([word]) => word);
}

function extractWikiLinks(markdown = '') {
  return [...markdown.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)]
    .map(match => match[1].trim())
    .filter(Boolean)
    .filter((term, index, arr) => arr.indexOf(term) === index)
    .slice(0, 16);
}

function normalizeList(value, limit) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => String(item).replace(/^\[\[|\]\]$/g, '').trim())
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .slice(0, limit);
}

function transcriptPreview(transcript, limit = 420) {
  return transcript
    .split('\n')
    .slice(0, 10)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function fallbackMarkdownSummary({ title, sourceUrl, transcript, keywords }) {
  const preview = transcriptPreview(transcript, 700);
  const links = keywords.slice(0, 6).map(keyword => `[[${keyword}]]`);
  return [
    '---',
    'type: transcript_preview',
    `title: ${yamlString(title || 'Untitled')}`,
    `source_url: ${yamlString(sourceUrl || '')}`,
    'status: missing_openai_key',
    '---',
    '',
    `# ${title || 'Untitled'}`,
    '',
    '## 자막 미리보기',
    preview || '자막을 불러왔지만 LLM 요약은 생성되지 않았습니다.',
    '',
    '## 임시 개념',
    ...links.map(link => `- ${link}`)
  ].join('\n');
}

async function summarizeWithOpenAI({ title, url, transcript, markdownSource }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const keywords = fallbackKeywords(`${title} ${transcript}`);
    const markdownSummary = fallbackMarkdownSummary({ title, sourceUrl: url, transcript, keywords });
    return {
      summary: '',
      keywords,
      topics: keywords.slice(0, 5),
      wikilinks: extractWikiLinks(markdownSummary),
      markdown_summary: markdownSummary,
      status: 'missing_openai_key'
    };
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const clippedSource = markdownSource.slice(0, 55000);
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content: [
            'You turn YouTube transcripts into a Korean personal knowledge wiki.',
            'Return valid JSON only. Do not use markdown fences.',
            'The summary must synthesize the full transcript, not copy opening captions.',
            'Wikilinks must be short reusable noun concepts, like [[Second Brain]] or [[지식 그래프]].',
            'Avoid long phrases, full sentences, generic words, and duplicate concepts.'
          ].join(' ')
        },
        {
          role: 'user',
          content: [
            'Create a wiki-style note from this transcript markdown.',
            'Return this exact JSON schema:',
            '{"summary":"한국어 3-5문장 핵심 요약","keywords":["단어 또는 짧은 명사구 6-10개"],"topics":["상위 주제 3-6개"],"wikilinks":["대괄호 없는 개념명 6-12개"],"markdown_summary":"YAML frontmatter와 [[wikilinks]]를 포함한 한국어 Markdown 노트"}',
            '',
            'summary requirements:',
            '- Explain the main argument, useful insight, and why this source matters.',
            '- Do not mention that this is a transcript.',
            '- Do not simply quote the first lines.',
            '',
            'markdown_summary sections:',
            '- 핵심 요약',
            '- 주요 개념',
            '- 기억할 문장',
            '- 연결 후보',
            '',
            clippedSource
          ].join('\n')
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
  const markdownSummary = String(parsed.markdown_summary || '').slice(0, 20000);
  const wikilinks = normalizeList(parsed.wikilinks, 14);
  const extractedLinks = extractWikiLinks(markdownSummary);
  const keywords = normalizeList(parsed.keywords, 10);
  const resolvedWikilinks = wikilinks.length ? wikilinks : extractedLinks;

  return {
    summary: String(parsed.summary || '').slice(0, 1200),
    keywords: keywords.length ? keywords : resolvedWikilinks.slice(0, 10),
    topics: normalizeList(parsed.topics, 8),
    wikilinks: resolvedWikilinks,
    markdown_summary: markdownSummary,
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
    const markdownSource = buildMarkdownSource({
      title,
      url,
      videoId,
      language: transcriptResult.language || '',
      lines: transcriptResult.lines || []
    });

    if (!transcriptResult.transcript) {
      return json(res, 200, {
        video_id: videoId,
        summary: '',
        keywords: fallbackKeywords(title),
        topics: [],
        wikilinks: [],
        markdown_source: markdownSource,
        markdown_summary: '',
        transcript_status: transcriptResult.status,
        transcript_language: transcriptResult.language || '',
        transcript_excerpt: ''
      });
    }

    const analysis = await summarizeWithOpenAI({
      title,
      url,
      transcript: transcriptResult.transcript,
      markdownSource
    });

    return json(res, 200, {
      video_id: videoId,
      summary: analysis.summary,
      keywords: analysis.keywords,
      topics: analysis.topics || [],
      wikilinks: analysis.wikilinks || [],
      markdown_source: markdownSource,
      markdown_summary: analysis.markdown_summary || '',
      transcript_status: analysis.status === 'ok' ? 'ok' : analysis.status,
      transcript_language: transcriptResult.language || '',
      transcript_excerpt: transcriptResult.transcript.slice(0, 4000)
    });
  } catch (err) {
    return json(res, 500, { error: err.message || 'Analysis failed' });
  }
};
