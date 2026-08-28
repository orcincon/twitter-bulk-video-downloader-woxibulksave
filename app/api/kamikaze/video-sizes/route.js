import { NextResponse } from 'next/server';
import { assertKamikazeAccess } from '@/lib/kamikaze-auth.js';
import { isAllowedVideoUrl, probeRemoteMediaBytesMany } from '@/lib/probe-media-bytes.js';

export const maxDuration = 60;

const MAX_URLS = 150;
const CONCURRENCY = 8;

export async function POST(request) {
  const auth = await assertKamikazeAccess();
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const raw = Array.isArray(body?.urls) ? body.urls : [];
  const urls = [...new Set(raw.filter((url) => typeof url === 'string' && isAllowedVideoUrl(url)))].slice(0, MAX_URLS);
  if (!urls.length) {
    return NextResponse.json({ bytesByUrl: {} });
  }

  const sizes = await probeRemoteMediaBytesMany(urls, { concurrency: CONCURRENCY });
  const bytesByUrl = {};
  urls.forEach((url, index) => {
    bytesByUrl[url] = Number(sizes[index]) || 0;
  });
  return NextResponse.json({ bytesByUrl });
}
