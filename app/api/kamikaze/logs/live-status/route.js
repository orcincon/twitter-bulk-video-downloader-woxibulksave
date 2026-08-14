import { NextResponse } from 'next/server';
import { assertKamikazeAccess } from '@/lib/kamikaze-auth.js';
import { extractTweetId } from '@/lib/tweet-url.js';
import { checkTweetLiveStatusBatch } from '@/lib/tweet-live-status.js';

const MAX_ITEMS = 20;

export async function POST(request) {
  const auth = await assertKamikazeAccess();
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  const seen = new Set();
  const items = [];
  for (const item of rawItems) {
    const url = typeof item === 'string' ? item : item?.url;
    if (typeof url !== 'string' || !url.trim()) continue;
    const tweetId = extractTweetId(url);
    if (!tweetId || seen.has(tweetId)) continue;
    seen.add(tweetId);
    items.push({
      url: url.trim(),
      username: typeof item?.username === 'string' ? item.username : '',
    });
    if (items.length >= MAX_ITEMS) break;
  }

  if (items.length === 0) {
    return NextResponse.json({ ok: true, results: {} });
  }

  try {
    const results = await checkTweetLiveStatusBatch(items, { concurrency: 4 });
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    console.warn('[kamikaze/logs/live-status]', err);
    return NextResponse.json({ error: 'CHECK_FAILED' }, { status: 500 });
  }
}
