import { canonicalizeTweetUrl } from '@/lib/tweet-url.js';

export async function fetchFixTweetRaw(tweetUrl) {
  const { ok, data } = await fetchFxEmbed(tweetUrl);
  if (!ok) return null;
  return data;
}

async function fetchFxEmbed(pathOrUrl) {
  try {
    const path =
      typeof pathOrUrl === 'string' && pathOrUrl.startsWith('http')
        ? new URL(pathOrUrl).pathname
        : `/${String(pathOrUrl || '').replace(/^\/+/, '')}`;
    const res = await fetch(`https://api.fxtwitter.com${path}`, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WBS/1.0)' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, httpStatus: res.status, data };
  } catch (_) {
    return { ok: false, httpStatus: 0, data: null };
  }
}

export async function fetchFixTweetResponse(tweetUrl) {
  return fetchFxEmbed(tweetUrl);
}

export async function fetchFixTweetUser(screenName) {
  const user = String(screenName || '').trim().replace(/^@+/, '');
  if (!user) return { ok: false, httpStatus: 0, data: null };
  return fetchFxEmbed(encodeURIComponent(user));
}

export function parseFixTweetMetadata(data) {
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
  const authorScreenName =
    typeof t?.author?.screen_name === 'string' ? t.author.screen_name.trim().replace(/^@+/, '') : null;
  return {
    likes: typeof t.likes === 'number' ? t.likes : null,
    retweets: typeof t.retweets === 'number' ? t.retweets : null,
    views: typeof t.views === 'number' ? t.views : null,
    created_at: typeof t.created_at === 'string' ? t.created_at : null,
    created_timestamp: typeof t.created_timestamp === 'number' ? t.created_timestamp : null,
    duration,
    ...(authorScreenName ? { author_screen_name: authorScreenName } : {}),
  };
}

export async function resolveAuthorScreenName(tweetUrl) {
  const data = await fetchFixTweetRaw(tweetUrl);
  const name = data?.tweet?.author?.screen_name;
  return typeof name === 'string' ? name.trim().replace(/^@+/, '') : null;
}

export function canonicalizeResultTweetUrl(tweetUrl, metadata) {
  return canonicalizeTweetUrl(tweetUrl, metadata?.author_screen_name);
}
