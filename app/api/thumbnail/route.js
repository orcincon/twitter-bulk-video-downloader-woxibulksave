import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TWITTER_URL_REGEX = /https?:\/\/(?:www\.|mobile\.)?(?:x\.com|twitter\.com)\/[^/]+\/status\/(\d+)/;

function extractTweetId(url) {
  const m = String(url).match(TWITTER_URL_REGEX);
  return m ? m[1] : null;
}

/** FixTweet'ten sadece thumbnail alır (auth gerektirmez) */
async function fetchThumbnailFromFixTweet(tweetUrl) {
  try {
    const url = `https://api.fxtwitter.com${new URL(tweetUrl).pathname}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WBS/1.0)' },
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data?.tweet?.media) return null;
    const media = data.tweet.media;
    const video = Array.isArray(media.videos) ? media.videos[0] : media.video;
    if (video?.thumbnail_url) return video.thumbnail_url;
    const photo = Array.isArray(media.photos) ? media.photos[0] : media.photos;
    if (photo?.url) return photo.url;
    return null;
  } catch (_) {
    return null;
  }
}

function buildTweetUrl(tweetId, urlHint) {
  if (urlHint && typeof urlHint === 'string') {
    const cleaned = urlHint.trim().split('?')[0];
    if (extractTweetId(cleaned)) return cleaned;
  }
  return `https://x.com/i/status/${tweetId}`;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    const idParam = searchParams.get('id');
    const tweetId = (idParam && /^\d+$/.test(idParam) ? idParam : null) || (url ? extractTweetId(url) : null);
    if (!tweetId) {
      return NextResponse.json({ id: null, thumbnail: null }, { status: 400 });
    }
    const thumbnail = await fetchThumbnailFromFixTweet(buildTweetUrl(tweetId, url));
    return NextResponse.json(
      { id: tweetId, thumbnail },
      {
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  } catch (_) {
    return NextResponse.json({ id: null, thumbnail: null }, { status: 500 });
  }
}
