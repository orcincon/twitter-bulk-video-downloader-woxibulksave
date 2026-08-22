import { NextResponse } from 'next/server';
import { getSessionSafe } from '@/lib/auth.js';
import { createSupabaseClient, ensureUserInSupabase } from '@/lib/supabase.js';
import { extractTweetId, extractTweetScreenName } from '@/lib/tweet-url.js';
import { checkTweetLiveStatusBatch } from '@/lib/tweet-live-status.js';

const TABLE_NAME = 'analysis_logs';
const MAX_LOGS = 12;
const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } };
const STATUS_RANK = {
  account_deleted: 5,
  suspended: 5,
  tweet_deleted: 3,
  missing: 2,
  private: 1,
  ok: 0,
  unknown: 0,
  invalid: 0,
};

function authorFromLog(log, url) {
  const fromUrl = extractTweetScreenName(url);
  if (fromUrl) return fromUrl;
  const statusId = extractTweetId(url);
  const results = Array.isArray(log?.results_json) ? log.results_json : [];
  const row = statusId
    ? results.find((item) => extractTweetId(item?.tweetUrl) === statusId)
    : results[0];
  const name = row?.metadata?.author_screen_name;
  return typeof name === 'string' ? name.replace(/^@+/, '').trim() : '';
}

export async function POST(request) {
  try {
    const session = await getSessionSafe();
    if (session?.user?.id) await ensureUserInSupabase(session);
    const userId = session?.user?.id || session?.user?.email || null;
    if (!userId) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401, ...NO_STORE });
    }

    const supabase = createSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'SUPABASE_NOT_CONFIGURED' }, { status: 503, ...NO_STORE });
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const logIds = Array.isArray(body.logIds)
      ? [...new Set(body.logIds.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim()))].slice(
          0,
          MAX_LOGS
        )
      : [];

    if (logIds.length === 0) {
      return NextResponse.json({ ok: true, byLogId: {} }, NO_STORE);
    }

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('id, urls, results_json')
      .eq('user_id', userId)
      .eq('is_hidden', false)
      .in('id', logIds);

    if (error) {
      console.warn('[analysis-history/live-status]', error.message);
      return NextResponse.json({ error: 'QUERY_FAILED' }, { status: 500, ...NO_STORE });
    }

    const seenTweets = new Set();
    const items = [];
    const logToTweetIds = new Map();

    for (const log of data || []) {
      const tweetIds = [];
      const urls = Array.isArray(log.urls) ? log.urls : [];
      for (const url of urls) {
        const tweetId = extractTweetId(url);
        if (!tweetId) continue;
        tweetIds.push(tweetId);
        if (seenTweets.has(tweetId)) continue;
        seenTweets.add(tweetId);
        items.push({
          url: String(url).trim(),
          username: authorFromLog(log, url),
        });
      }
      logToTweetIds.set(log.id, tweetIds);
    }

    const results = items.length > 0 ? await checkTweetLiveStatusBatch(items, { concurrency: 4 }) : {};
    const byLogId = {};

    for (const [logId, tweetIds] of logToTweetIds) {
      let best = null;
      for (const tweetId of tweetIds) {
        const st = results[tweetId];
        if (!st) continue;
        if (!best || (STATUS_RANK[st.status] || 0) > (STATUS_RANK[best.status] || 0)) {
          best = st;
        }
      }
      if (best) {
        byLogId[logId] = { status: best.status, label: best.label };
      }
    }

    return NextResponse.json({ ok: true, byLogId }, NO_STORE);
  } catch (err) {
    console.warn('[analysis-history/live-status]', err);
    return NextResponse.json({ error: 'CHECK_FAILED' }, { status: 500, ...NO_STORE });
  }
}
