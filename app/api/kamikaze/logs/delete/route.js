import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createHash } from 'crypto';
import { createSupabaseClient } from '@/lib/supabase.js';
import { extractTweetId } from '@/lib/tweet-url.js';
import { countDistinctVideos } from '@/lib/tweet-media.js';

function makeToken(email, secret) {
  return createHash('sha256').update(`${email || ''}:${secret}`).digest('hex');
}

function isMissingColumnError(error) {
  const message = String(error?.message || '');
  return error?.code === 'PGRST204' || /column .* does not exist/i.test(message) || /Could not find the '.*' column/.test(message);
}

async function fetchAllAnalysisLogs(supabase, { hiddenOnly = false } = {}) {
  const pageSize = 1000;
  let from = 0;
  const all = [];
  let filterAdminHidden = true;

  while (true) {
    let query = supabase
      .from('analysis_logs')
      .select('id, user_id, urls, results_json, video_count')
      .range(from, from + pageSize - 1);
    if (filterAdminHidden) query = query.eq('admin_hidden', hiddenOnly);

    const { data, error } = await query;
    if (error) {
      if (filterAdminHidden && isMissingColumnError(error)) {
        if (hiddenOnly) return { logs: [], columnMissing: true };
        filterAdminHidden = false;
        from = 0;
        all.length = 0;
        continue;
      }
      throw error;
    }
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return { logs: all, columnMissing: false };
}

async function deleteByIds(supabase, ids, mode) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return { ok: true, deleted: 0 };
  const chunkSize = 200;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    if (mode === 'soft' || mode === 'restore') {
      const { error } = await supabase
        .from('analysis_logs')
        .update({ admin_hidden: mode === 'restore' ? false : true })
        .in('id', chunk);
      if (error) {
        if (isMissingColumnError(error)) {
          return { error: 'ADMIN_HIDDEN_COLUMN_MISSING' };
        }
        console.warn('[kamikaze/logs/delete] soft', error);
        return { error: 'DELETE_FAILED' };
      }
    } else {
      const { error } = await supabase.from('analysis_logs').delete().in('id', chunk);
      if (error) {
        console.warn('[kamikaze/logs/delete]', error);
        return { error: 'DELETE_FAILED' };
      }
    }
  }
  return { ok: true, deleted: unique.length };
}

function tweetIdsInLog(log) {
  const ids = new Set();
  for (const url of Array.isArray(log.urls) ? log.urls : []) {
    const id = extractTweetId(url);
    if (id) ids.add(id);
  }
  for (const result of Array.isArray(log.results_json) ? log.results_json : []) {
    const id = extractTweetId(result?.tweetUrl);
    if (id) ids.add(id);
  }
  return ids;
}

function stripTweetsFromLog(log, tweetIdSet) {
  const urls = (Array.isArray(log.urls) ? log.urls : []).filter((url) => {
    const id = extractTweetId(url);
    return !id || !tweetIdSet.has(id);
  });
  const results = (Array.isArray(log.results_json) ? log.results_json : []).filter((result, index) => {
    const id = extractTweetId(result?.tweetUrl) || extractTweetId(log.urls?.[index]);
    return !id || !tweetIdSet.has(id);
  });
  const videoCount = results.reduce(
    (sum, result) => sum + (Array.isArray(result?.videos) ? countDistinctVideos(result.videos) : 0),
    0
  );
  return { urls, results, videoCount };
}

async function stripTweetIds(supabase, tweetIds, mode, hiddenOnly) {
  const tweetIdSet = new Set(tweetIds);
  const { logs, columnMissing } = await fetchAllAnalysisLogs(supabase, { hiddenOnly });
  if (columnMissing && (mode === 'soft' || mode === 'restore')) {
    return { error: 'ADMIN_HIDDEN_COLUMN_MISSING' };
  }

  const emptyIds = [];
  const updates = [];
  for (const log of logs) {
    const found = [...tweetIdsInLog(log)].some((id) => tweetIdSet.has(id));
    if (!found) continue;
    const stripped = stripTweetsFromLog(log, tweetIdSet);
    if (stripped.urls.length === 0) emptyIds.push(log.id);
    else updates.push({ id: log.id, ...stripped });
  }

  const emptied = await deleteByIds(supabase, emptyIds, mode);
  if (emptied.error) return emptied;

  for (const row of updates) {
    const { error } = await supabase
      .from('analysis_logs')
      .update({
        urls: row.urls,
        results_json: row.results,
        link_count: row.urls.length,
        video_count: row.videoCount,
      })
      .eq('id', row.id);
    if (error) {
      console.warn('[kamikaze/logs/delete] strip', error);
      return { error: 'DELETE_FAILED' };
    }
  }

  return { ok: true, deleted: emptyIds.length + updates.length };
}

async function userIdsForUsernameFilter(supabase, username, usernameMode) {
  const filterNorm = String(username || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
  if (!filterNorm) return null;
  const { data, error } = await supabase.from('users').select('id, username, name');
  if (error) {
    console.warn('[kamikaze/logs/delete] users', error);
    return [];
  }
  const matched = [];
  let guestMatches = filterNorm === 'misafir' || filterNorm === 'guest';
  for (const user of data ?? []) {
    const un = String(user.username || '')
      .toLowerCase()
      .replace(/^@+/, '');
    const name = String(user.name || '')
      .toLowerCase()
      .replace(/^@+/, '');
    if (un === filterNorm || name === filterNorm) matched.push(String(user.id));
  }
  if (usernameMode === 'exclude') {
    const matchedSet = new Set(matched);
    const ids = (data ?? []).map((user) => String(user.id)).filter((id) => !matchedSet.has(id));
    if (!guestMatches) ids.push('guest');
    return ids;
  }
  if (guestMatches) matched.push('guest');
  return matched;
}

export async function POST(request) {
  const allowedSecret = (process.env.KAMIKAZE_SECRET || '').trim();
  if (!allowedSecret) {
    return NextResponse.json({ error: 'NOT_CONFIGURED' }, { status: 503 });
  }

  const allowedEmail = (process.env.KAMIKAZE_EMAIL || '').trim().toLowerCase();
  const expectedToken = makeToken(allowedEmail, allowedSecret);
  const cookieStore = await cookies();
  const token = cookieStore.get('kamikaze')?.value;
  if (token !== expectedToken) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const logIds = Array.isArray(body.log_ids) ? body.log_ids.filter((id) => typeof id === 'string' && id.length > 0) : [];
  const tweetIds = Array.isArray(body.tweet_ids)
    ? [...new Set(body.tweet_ids.map((id) => String(id || '').trim()).filter(Boolean))]
    : [];
  const mode = body.mode === 'soft' || body.mode === 'restore' ? body.mode : 'hard';
  const hiddenOnly = body.hidden === true || body.hidden === 1 || body.hidden === '1';
  const deleteAll = body.all === true;

  const supabase = createSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'SUPABASE_NOT_CONFIGURED' }, { status: 503 });
  }

  try {
    if (deleteAll) {
      const username = typeof body.username === 'string' ? body.username : '';
      const usernameMode = body.usernameMode === 'exclude' ? 'exclude' : 'include';
      const userIds = await userIdsForUsernameFilter(supabase, username, usernameMode);
      if (userIds && userIds.length === 0) {
        return NextResponse.json({ ok: true, deleted: 0, mode });
      }

      const applyUserFilter = (query) => (userIds ? query.in('user_id', userIds) : query);

      if (mode === 'soft' || mode === 'restore') {
        let query = applyUserFilter(
          supabase
            .from('analysis_logs')
            .update({ admin_hidden: mode === 'restore' ? false : true })
            .eq('admin_hidden', mode === 'restore')
        );
        const { error } = await query;
        if (error) {
          if (isMissingColumnError(error)) {
            return NextResponse.json({ error: 'ADMIN_HIDDEN_COLUMN_MISSING' }, { status: 400 });
          }
          console.warn('[kamikaze/logs/delete] all soft', error);
          return NextResponse.json({ error: 'DELETE_FAILED' }, { status: 500 });
        }
        return NextResponse.json({ ok: true, deleted: 1, mode });
      }

      let query = applyUserFilter(supabase.from('analysis_logs').delete().eq('admin_hidden', hiddenOnly));
      let { error } = await query;
      if (error && isMissingColumnError(error)) {
        query = applyUserFilter(supabase.from('analysis_logs').delete());
        ({ error } = await query);
      }
      if (error) {
        console.warn('[kamikaze/logs/delete] all', error);
        return NextResponse.json({ error: 'DELETE_FAILED' }, { status: 500 });
      }
      return NextResponse.json({ ok: true, deleted: 1, mode: 'hard' });
    }

    if (tweetIds.length > 0) {
      const result = await stripTweetIds(supabase, tweetIds, mode, hiddenOnly);
      if (result.error === 'ADMIN_HIDDEN_COLUMN_MISSING') {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }
      return NextResponse.json({ ok: true, deleted: result.deleted, mode });
    }

    const result = await deleteByIds(supabase, logIds, mode);
    if (result.error === 'ADMIN_HIDDEN_COLUMN_MISSING') {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, deleted: result.deleted, mode });
  } catch (err) {
    console.warn('[kamikaze/logs/delete]', err);
    return NextResponse.json({ error: 'DELETE_FAILED' }, { status: 500 });
  }
}
