import { NextResponse } from 'next/server';

const TWITTER_URL_REGEX = /https?:\/\/(?:www\.|mobile\.)?(?:x\.com|twitter\.com)\/[^/]+\/status\/(\d+)/;

async function fetchFixTweetRaw(tweetUrl) {
  try {
    const url = `https://api.fxtwitter.com${new URL(tweetUrl).pathname}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WBS/1.0)' },
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch (_) {
    return null;
  }
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

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ metadata: null }, { status: 400 });
    }
    const m = String(url).match(TWITTER_URL_REGEX);
    if (!m) return NextResponse.json({ metadata: null }, { status: 400 });
    const clean = url.trim().split('?')[0];
    const data = await fetchFixTweetRaw(clean);
    const metadata = parseFixTweetMetadata(data);
    return NextResponse.json(
      { metadata },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
    );
  } catch (_) {
    return NextResponse.json({ metadata: null }, { status: 500 });
  }
}
