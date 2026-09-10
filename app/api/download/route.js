import { NextResponse } from 'next/server';
import { getSessionSafe } from '@/lib/auth.js';
import { ensureUserInSupabase } from '@/lib/supabase.js';
import { getTokenPool, markTokenInvalid, refreshPoolBearer } from '@/lib/oauth-token-pool.js';
import { canonicalizeResultTweetUrl, fetchFixTweetRaw, parseFixTweetMetadata } from '@/lib/fixtweet.js';
import { collapseDistinctVideos } from '@/lib/tweet-media.js';
import { extractTweetId as extractTweetIdFromUrl } from '@/lib/tweet-url.js';

const TWITTER_URL_REGEX = /https?:\/\/(www\.|mobile\.)?(x\.com|twitter\.com)\/[^/]+\/status\/(\d+)/;
const ANALYZE_CONCURRENCY = 3;

function extractTweetId(url) {
  return extractTweetIdFromUrl(url);
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

async function mapWithConcurrency(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index], index);
    }
  }
  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: items.length ? workers : 0 }, () => worker()));
  return out;
}

function parseQualityScore(q) {
  if (typeof q === 'number' && Number.isFinite(q) && q > 0) {
    if (q >= 100000) return q;
    if (q >= 1080) return 2073600;
    if (q >= 720) return 921600;
    if (q >= 480) return 307200;
    if (q >= 360) return 129600;
    return q;
  }
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
  if (typeof q === 'number' && Number.isFinite(q) && q > 0) {
    if (q >= 100000) {
      if (q >= 1900000) return '1080p';
      if (q >= 800000) return '720p';
      if (q >= 300000) return '480p';
      if (q >= 100000) return '360p';
      return 'other';
    }
    if (q >= 1080) return '1080p';
    if (q >= 720) return '720p';
    if (q >= 480) return '480p';
    if (q >= 360) return '360p';
    return 'other';
  }
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

function isPlayableVideoUrl(url) {
  return typeof url === 'string' && url.startsWith('http') && !url.includes('t.co') && !url.includes('avatar') && !url.includes('.m3u8');
}

function pickBestVariant(variants) {
  let best = null;
  let bestScore = -1;
  for (const v of variants || []) {
    const u = v?.url || v?.src;
    if (!isPlayableVideoUrl(u)) continue;
    const quality = v?.bitrate || v?.quality || 'best';
    const score = parseQualityScore(quality);
    if (score >= bestScore) {
      bestScore = score;
      best = {
        url: u,
        quality,
        ...(v?.bitrate != null && Number(v.bitrate) > 0 ? { bitrate: Number(v.bitrate) } : {}),
      };
    }
  }
  return best;
}

/** Her medya öğesinden en iyi kaliteyi al; kalite varyantlarını tek videoda tut. */
function finalizeVideoList(videoList, max = 10) {
  const collapsed = collapseDistinctVideos(videoList);
  const seen = new Set();
  const out = [];
  for (const v of collapsed) {
    if (!v?.url || seen.has(v.url)) continue;
    seen.add(v.url);
    out.push({ ...v, label: formatQualityLabel(v.quality) });
    if (out.length >= max) break;
  }
  return out;
}

function parseSyndicationVideos(data) {
  if (!data || typeof data !== 'object') return { videos: [], thumbnail: null };
  const videoList = [];
  const photoList = [];
  let thumbnail = null;

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
        const best = pickBestVariant(variants);
        if (best) {
          const thumb = m.media_url_https || m.media_url;
          videoList.push({
            ...best,
            ...(typeof thumb === 'string' && thumb.startsWith('http') && !thumb.includes('avatar')
              ? { thumbnail: thumb }
              : {}),
          });
        }
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

  extractFromMedia(
    (Array.isArray(parsed?.mediaDetails) && parsed.mediaDetails.length && parsed.mediaDetails) ||
      (Array.isArray(parsed?.extended_entities?.media) && parsed.extended_entities.media.length && parsed.extended_entities.media) ||
      (Array.isArray(parsed?.legacy?.extended_entities?.media) &&
        parsed.legacy.extended_entities.media.length &&
        parsed.legacy.extended_entities.media) ||
      (Array.isArray(parsed?.entities?.media) && parsed.entities.media.length && parsed.entities.media) ||
      (Array.isArray(parsed?.legacy?.entities?.media) && parsed.legacy.entities.media.length && parsed.legacy.entities.media) ||
      null
  );
  if (videoList.length === 0 && parsed?.video?.variants) {
    const best = pickBestVariant(parsed.video.variants);
    if (best) videoList.push(best);
  }

  const videos = [...finalizeVideoList(videoList), ...photoList];
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
        ...(v?.thumbnail_url && typeof v.thumbnail_url === 'string' && v.thumbnail_url.startsWith('http')
          ? { thumbnail: v.thumbnail_url }
          : {}),
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
  if (Array.isArray(media.videos) && media.videos.length) media.videos.forEach(addVideo);
  else if (media.videos) addVideo(media.videos);
  else if (media.video) addVideo(media.video);
  if (Array.isArray(media.photos)) media.photos.forEach(addPhoto);
  else if (media.photos) addPhoto(media.photos);
  const videos = [...finalizeVideoList(videoList), ...photoList];
  return { videos, thumbnail };
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

function isAuthFailure(result) {
  return result?.httpStatus === 401 || result?.httpStatus === 403;
}

function successPayload(tweetUrl, videos, thumbnail, metadata) {
  return {
    tweetUrl: canonicalizeResultTweetUrl(tweetUrl, metadata),
    status: 'success',
    videos,
    thumbnail: thumbnail || null,
    metadata: metadata || null,
    error: null,
  };
}

function orderTokenAttempts(pool, sessionAccessToken) {
  const attempts = [];
  const seen = new Set();
  const push = (cred) => {
    if (!cred) return;
    const key = `${cred.type}:${cred.userId || cred.authTokenId || cred.token || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    attempts.push(cred);
  };
  if (sessionAccessToken) {
    push({ type: 'bearer', token: sessionAccessToken, userId: null });
  }
  const fresh = [];
  const stale = [];
  for (const item of pool) {
    const expired = item.expiresAt && Number.isFinite(Date.parse(item.expiresAt)) && Date.now() >= Date.parse(item.expiresAt);
    const looksLive = item.type === 'cookie' || (item.token && item.tokenIsValid !== false && !expired);
    if (looksLive) fresh.push(item);
    else stale.push(item);
  }
  if (fresh.length > 0) {
    const start = tokenPoolIndex % fresh.length;
    for (let i = 0; i < fresh.length; i++) push(fresh[(start + i) % fresh.length]);
  }
  stale.forEach(push);
  return attempts;
}

async function fetchVideoForUrl(tweetUrl, sessionAccessToken) {
  const tweetId = extractTweetId(tweetUrl);
  if (!tweetId) {
    return { tweetUrl, status: 'error', videos: [], error: 'Invalid tweet URL' };
  }

  let fixResult;
  const fixPromise = fetchViaFixTweet(tweetId, tweetUrl)
    .then((r) => {
      fixResult = r;
      return r;
    })
    .catch(() => {
      fixResult = { videos: [], thumbnail: null, metadata: null, noMedia: false };
      return fixResult;
    });

  const pool = await getTokenPool();
  if (fixResult?.videos?.length > 0) {
    return successPayload(tweetUrl, fixResult.videos, fixResult.thumbnail, fixResult.metadata);
  }

  const attempts =
    pool.length > 0 || sessionAccessToken ? orderTokenAttempts(pool, sessionAccessToken) : [];

  for (let i = 0; i < attempts.length; i++) {
    if (fixResult?.videos?.length > 0) {
      return successPayload(tweetUrl, fixResult.videos, fixResult.thumbnail, fixResult.metadata);
    }
    const cred = attempts[i];
    let authToken = cred?.type === 'cookie' ? cred.token : null;
    let accessToken = cred?.type === 'bearer' ? cred.token : null;
    if (cred?.type === 'bearer' && !accessToken && cred.userId) {
      const warmed = await refreshPoolBearer(cred);
      if (warmed?.token) accessToken = warmed.token;
    }
    if (!authToken && !accessToken) continue;
    try {
      const result = await fetchViaSyndication(tweetId, authToken, accessToken);
      if (result && result.videos?.length > 0) {
        tokenPoolIndex += 1;
        return successPayload(
          tweetUrl,
          result.videos,
          result.thumbnail || fixResult?.thumbnail,
          fixResult?.metadata || null
        );
      }
      if (isAuthFailure(result)) {
        const refreshed = await refreshPoolBearer(cred);
        if (refreshed?.token) {
          const retry = await fetchViaSyndication(tweetId, null, refreshed.token);
          if (retry && retry.videos?.length > 0) {
            tokenPoolIndex += 1;
            return successPayload(
              tweetUrl,
              retry.videos,
              retry.thumbnail || fixResult?.thumbnail,
              fixResult?.metadata || null
            );
          }
          if (!isAuthFailure(retry)) break;
        }
        await markTokenInvalid(cred);
        continue;
      }
      break;
    } catch (_) {
      break;
    }
  }

  const fixTweetResult = fixResult === undefined ? await fixPromise : fixResult;
  if (fixTweetResult?.videos?.length > 0) {
    return successPayload(tweetUrl, fixTweetResult.videos, fixTweetResult.thumbnail, fixTweetResult.metadata);
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

    const results = await mapWithConcurrency(unique, ANALYZE_CONCURRENCY, async (url) => {
      try {
        return await fetchVideoForUrl(url, accessToken);
      } catch (err) {
        return { tweetUrl: url, status: 'error', videos: [], error: err?.message || 'Analiz hatası' };
      }
    });

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
