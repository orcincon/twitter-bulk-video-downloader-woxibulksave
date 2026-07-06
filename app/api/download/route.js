import { NextResponse } from 'next/server';
import { getSessionSafe } from '@/lib/auth.js';
import { createSupabaseClient, ensureUserInSupabase } from '@/lib/supabase.js';
import { decryptToken } from '@/lib/token-crypto.js';

const TWITTER_URL_REGEX = /https?:\/\/(www\.|mobile\.)?(x\.com|twitter\.com)\/[^/]+\/status\/(\d+)/;
const REQUEST_DELAY_MS = 1500;

function extractTweetId(url) {
  const m = String(url).match(TWITTER_URL_REGEX);
  return m ? m[3] : null;
}

function isValidTwitterUrl(url) {
  return typeof url === 'string' && TWITTER_URL_REGEX.test(url);
}

function sanitizeTweetUrl(url) {
  if (typeof url !== 'string') return '';
  const u = url.trim().replace(/\/$/, '');
  return u.split('?')[0] || u;
}

function normalizeUrl(url) {
  return sanitizeTweetUrl(url);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseQualityScore(q) {
  if (!q || typeof q !== 'string') return 0;
  const s = String(q).toLowerCase();
  const match = s.match(/(\d+)\s*[pPx×]?\s*(\d+)?/);
  if (match) {
    const w = parseInt(match[1], 10) || 0;
    const h = parseInt(match[2], 10) || w;
    return w * h || w;
  }
  if (s.includes('1080') || s.includes('fullhd')) return 2073600;
  if (s.includes('720') || s.includes('hd')) return 921600;
  if (s.includes('480')) return 307200;
  if (s.includes('360')) return 129600;
  if (s === 'best') return 9999999;
  return 1;
}

function getQualityBand(q) {
  if (!q || typeof q !== 'string') return 'other';
  const s = String(q).toLowerCase();
  if (s.includes('1080') || s.includes('fullhd')) return '1080p';
  if (s.includes('720') || s.includes('hd')) return '720p';
  if (s.includes('480')) return '480p';
  if (s.includes('360')) return '360p';
  if (s === 'best') return 'best';
  const m = s.match(/(\d+)/);
  return m ? m[1] + 'p' : 'other';
}

function formatQualityLabel(q) {
  const band = getQualityBand(q);
  if (band === '1080p') return 'HD (1080p)';
  if (band === '720p') return 'HD (720p)';
  if (band === '480p') return 'SD (480p)';
  if (band === '360p') return 'Mobile (360p)';
  if (band === 'best') return 'Best Quality';
  return band !== 'other' ? band : 'Standard';
}

function dedupeLimitAndLabel(videos, max = 3) {
  const seen = new Set();
  const out = [];
  const sorted = [...videos].sort((a, b) => parseQualityScore(b.quality) - parseQualityScore(a.quality));
  for (const v of sorted) {
    const band = getQualityBand(v.quality);
    if (seen.has(band)) continue;
    seen.add(band);
    out.push({ ...v, label: formatQualityLabel(v.quality) });
    if (out.length >= max) break;
  }
  return out;
}

/** Credential: { type: 'bearer'|'cookie', token, userId? } */
const TOKEN_POOL_CACHE_MS = 5 * 60 * 1000;
let tokenPoolCache = { items: [], ts: 0 };

async function getTokenPool() {
  const now = Date.now();
  if (tokenPoolCache.items.length > 0 && now - tokenPoolCache.ts < TOKEN_POOL_CACHE_MS) {
    return tokenPoolCache.items;
  }
  const items = [];
  const supabase = createSupabaseClient();
  if (supabase) {
    const { data: users } = await supabase
      .from('users')
      .select('id, access_token')
      .not('access_token', 'is', null)
      .or('token_is_valid.is.null,token_is_valid.eq.true');
    if (users?.length) {
      users.forEach((u) => {
        const t = decryptToken(u.access_token)?.trim();
        if (t) items.push({ type: 'bearer', token: t, userId: u.id });
      });
    }
    const { data: authRows } = await supabase.from('auth_tokens').select('id, token').eq('is_active', true);
    if (authRows?.length) {
      authRows.forEach((r) => {
        const t = r.token?.trim();
        if (t) items.push({ type: 'cookie', token: t, authTokenId: r.id });
      });
    }
  }
  const raw = process.env.TWITTER_AUTH_TOKENS || '';
  raw.split(',').forEach((t) => {
    const s = t.trim();
    if (s) items.push({ type: 'cookie', token: s });
  });
  tokenPoolCache = { items, ts: now };
  return items;
}

function parseSyndicationVideos(data) {
  if (!data || typeof data !== 'object') return { videos: [], thumbnail: null };
  const videoList = [];
  const photoList = [];
  let thumbnail = null;
  const addUrl = (u, q = 'best', bitrate = null) => {
    if (!u || typeof u !== 'string' || !u.startsWith('http') || u.includes('t.co') || u.includes('avatar')) return;
    if (u.includes('.m3u8')) return;
    const entry = { url: u, quality: q };
    if (bitrate != null && Number(bitrate) > 0) entry.bitrate = Number(bitrate);
    videoList.push(entry);
  };

  const extractFromMedia = (media) => {
    if (!media) return;
    const arr = Array.isArray(media) ? media : [media];
    arr.forEach((m) => {
      if (m?.type === 'video' || m?.type === 'animated_gif') {
        if (!thumbnail && (m?.media_url_https || m?.media_url)) {
          const thumb = m.media_url_https || m.media_url;
          if (typeof thumb === 'string' && thumb.startsWith('http') && !thumb.includes('avatar')) {
            thumbnail = thumb;
          }
        }
        const variants = m?.video_info?.variants || m?.variants || [];
        variants.forEach((v) => {
          if (v?.url) addUrl(v.url, v?.bitrate || 'best', v?.bitrate);
        });
      } else if (m?.type === 'photo') {
        const u = m?.media_url_https || m?.media_url;
        if (u && typeof u === 'string' && u.startsWith('http') && !u.includes('avatar')) {
          if (!thumbnail) thumbnail = u;
          photoList.push({ url: u, quality: 'photo', label: 'Görsel', mediaType: 'photo', ext: 'jpg' });
        }
      }
    });
  };

  let parsed = data;
  if (data?.__module?.__metadata?.__html) {
    try {
      parsed = JSON.parse(data.__module.__metadata.__html);
    } catch (_) {}
  }
  if (parsed?.result) parsed = parsed.result;
  if (parsed?.legacy) parsed = { ...parsed, ...parsed.legacy };

  extractFromMedia(parsed?.mediaDetails);
  extractFromMedia(parsed?.legacy?.entities?.media);
  extractFromMedia(parsed?.legacy?.extended_entities?.media);
  extractFromMedia(parsed?.entities?.media);
  extractFromMedia(parsed?.extended_entities?.media);
  if (parsed?.video?.variants) {
    parsed.video.variants.forEach((v) => {
      const u = v?.src || v?.url;
      if (u && !u.includes('.m3u8')) addUrl(u, v?.bitrate || 'best');
    });
  }
  const media = parsed?.mediaDetails || parsed?.video?.variants || parsed?.media || [];
  if (Array.isArray(media)) {
    media.forEach((v) => {
      if (v?.type === 'photo') {
        const u = v?.media_url_https || v?.url || v?.src;
        if (u && typeof u === 'string' && u.startsWith('http')) {
          if (!thumbnail) thumbnail = u;
          photoList.push({ url: u, quality: 'photo', label: 'Görsel', mediaType: 'photo', ext: 'jpg' });
        }
      } else {
        const u = v?.url || v?.src;
        if (u && !u.includes('.m3u8')) addUrl(u, v?.bitrate || v?.quality || 'best');
      }
    });
  }

  const videos = [...dedupeLimitAndLabel(videoList), ...photoList];
  return { videos, thumbnail };
}

let tokenPoolIndex = 0;

function parseFixTweetVideos(data) {
  if (!data?.tweet?.media) return { videos: [], thumbnail: null };
  const media = data.tweet.media;
  const videoList = [];
  const photoList = [];
  let thumbnail = null;
  const addVideo = (v) => {
    const u = v?.url || v?.source;
    if (u && typeof u === 'string' && u.startsWith('http') && !u.includes('.m3u8')) {
      if (!thumbnail && v?.thumbnail_url && typeof v.thumbnail_url === 'string' && v.thumbnail_url.startsWith('http')) {
        thumbnail = v.thumbnail_url;
      }
      videoList.push({
        url: u,
        quality: v?.bitrate || v?.width || 'best',
        ...(v?.duration != null ? { duration: Math.round(Number(v.duration)) } : {}),
      });
    }
  };
  const addPhoto = (p) => {
    const u = p?.url;
    if (u && typeof u === 'string' && u.startsWith('http')) {
      if (!thumbnail) thumbnail = u;
      const ext = /\.(jpe?g|png|webp|gif)(?:\?|$)/i.exec(u)?.[1] || 'jpg';
      photoList.push({ url: u, quality: 'photo', label: 'Görsel', mediaType: 'photo', ext });
    }
  };
  if (Array.isArray(media.videos)) media.videos.forEach(addVideo);
  else if (media.videos) addVideo(media.videos);
  if (media.video) addVideo(media.video);
  if (Array.isArray(media.photos)) media.photos.forEach(addPhoto);
  else if (media.photos) addPhoto(media.photos);
  const videos = [...dedupeLimitAndLabel(videoList), ...photoList];
  return { videos, thumbnail };
}

function parseFixTweetMetadata(data) {
  const t = data?.tweet;
  if (!t) return null;
  let duration = null;
  const media = t?.media;
  if (media) {
    const vid = Array.isArray(media?.videos) ? media.videos[0] : media?.video || media?.videos;
    const ext = media?.external;
    if (vid?.duration != null) duration = Math.round(Number(vid.duration));
    else if (ext?.duration != null) duration = Math.round(Number(ext.duration));
  }
  return {
    likes: typeof t.likes === 'number' ? t.likes : null,
    retweets: typeof t.retweets === 'number' ? t.retweets : null,
    views: typeof t.views === 'number' ? t.views : null,
    created_at: typeof t.created_at === 'string' ? t.created_at : null,
    created_timestamp: typeof t.created_timestamp === 'number' ? t.created_timestamp : null,
    duration,
  };
}

async function fetchFixTweetRaw(tweetUrl) {
  try {
    const url = `https://api.fxtwitter.com${new URL(tweetUrl).pathname}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WBS/1.0)' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch (_) {
    return null;
  }
}

async function fetchViaFixTweet(tweetId, tweetUrl) {
  const data = await fetchFixTweetRaw(tweetUrl);
  if (!data?.code) return { videos: [], thumbnail: null, metadata: null, noMedia: false };
  const parsed = parseFixTweetVideos(data);
  const noMedia = !!data?.tweet && parsed.videos.length === 0;
  return { ...parsed, metadata: parseFixTweetMetadata(data), noMedia };
}

/** Döner: videos[] | null (404) | { videos: [], httpStatus } (hata) */
async function fetchViaSyndication(tweetId, authToken, accessToken) {
  const url = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Accept: 'application/json',
    Referer: 'https://x.com/',
    Origin: 'https://x.com',
    'Cache-Control': 'no-cache',
  };
  if (authToken) {
    headers.Cookie = `auth_token=${authToken}`;
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(url, {
    method: 'GET',
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });

  if (res.status === 404) return null;
  if (!res.ok) return { videos: [], thumbnail: null, httpStatus: res.status };

  const data = await res.json().catch(() => null);
  if (data === null || data === undefined) return null;

  return parseSyndicationVideos(data);
}

async function markTokenInvalid(cred) {
  const supabase = createSupabaseClient();
  if (!supabase) return;
  if (cred?.userId) {
    await supabase.from('users').update({ token_is_valid: false, updated_at: new Date().toISOString() }).eq('id', cred.userId);
  }
  if (cred?.authTokenId) {
    await supabase.from('auth_tokens').update({ is_active: false }).eq('id', cred.authTokenId);
  }
  if (cred?.userId || cred?.authTokenId) {
    tokenPoolCache = { items: [], ts: 0 };
  }
}

async function fetchVideoForUrl(tweetUrl, sessionAccessToken) {
  const tweetId = extractTweetId(tweetUrl);
  if (!tweetId) {
    return { tweetUrl, status: 'error', videos: [], error: 'Invalid tweet URL' };
  }

  const pool = await getTokenPool();
  const attempts = pool.length > 0 ? pool : [{ type: 'bearer', token: sessionAccessToken, userId: null }];

  for (let i = 0; i < attempts.length; i++) {
    const cred = attempts[(tokenPoolIndex + i) % attempts.length];
    const authToken = cred?.type === 'cookie' ? cred.token : null;
    const accessToken = cred?.type === 'bearer' ? cred.token : sessionAccessToken;
    if (!authToken && !accessToken) continue;
    try {
      const result = await fetchViaSyndication(tweetId, authToken, accessToken);
      if (result && result.videos?.length > 0) {
        tokenPoolIndex += i + 1;
        const fixRaw = await fetchFixTweetRaw(tweetUrl);
        const meta = fixRaw ? parseFixTweetMetadata(fixRaw) : null;
        const fixThumb = fixRaw ? parseFixTweetVideos(fixRaw).thumbnail : null;
        const thumbnail = result.thumbnail || fixThumb || null;
        return { tweetUrl, status: 'success', videos: result.videos, thumbnail, metadata: meta || null, error: null };
      }
      if (result === null) continue;
      if (result?.httpStatus === 401 || result?.httpStatus === 403) {
        await markTokenInvalid(cred);
        continue;
      }
    } catch (_) {
      continue;
    }
  }

  const fixTweetResult = await fetchViaFixTweet(tweetId, tweetUrl);
  if (fixTweetResult?.videos?.length > 0) {
    return { tweetUrl, status: 'success', videos: fixTweetResult.videos, thumbnail: fixTweetResult.thumbnail || null, metadata: fixTweetResult.metadata || null, error: null };
  }

  const noMediaMsg = 'Bu gönderi medya içermiyor';
  if (fixTweetResult?.noMedia) {
    return { tweetUrl, status: 'error', videos: [], error: noMediaMsg };
  }

  return {
    tweetUrl,
    status: 'error',
    videos: [],
    error: pool.length > 0
      ? 'Video bulunamadı'
      : 'Çoklu video analizi ve profil kaydı için X kullanıcı girişi yapın veya TWITTER_AUTH_TOKENS ekleyin.',
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const urls = Array.isArray(body?.urls) ? body.urls : [];

    if (urls.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No URLs provided', results: [] },
        { status: 400 }
      );
    }

    const normalized = urls.map(normalizeUrl).filter(isValidTwitterUrl);
    const unique = [...new Set(normalized)];

    if (unique.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid Twitter/X URLs', results: [] },
        { status: 400 }
      );
    }

    if (unique.length > 50) {
      return NextResponse.json(
        { success: false, error: 'Maximum 50 URLs per request', results: [] },
        { status: 400 }
      );
    }

    const session = await getSessionSafe();
    if (session?.user?.id) await ensureUserInSupabase(session);
    const accessToken = session?.access_token || null;

    const results = [];
    for (let i = 0; i < unique.length; i++) {
      if (i > 0) await delay(REQUEST_DELAY_MS);
      try {
        results.push(await fetchVideoForUrl(unique[i], accessToken));
      } catch (err) {
        results.push({ tweetUrl: unique[i], status: 'error', videos: [], error: err?.message || 'Analiz hatası' });
      }
    }

    return NextResponse.json(
      { success: true, results },
      {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      }
    );
  } catch (err) {
    return NextResponse.json(
      { success: false, error: 'Invalid request body', results: [] },
      { status: 400 }
    );
  }
}
