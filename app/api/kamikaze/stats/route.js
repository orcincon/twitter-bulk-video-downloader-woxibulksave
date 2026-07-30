import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createHash } from 'crypto';
import { createSupabaseClient } from '@/lib/supabase.js';
import { syncMissingUsernames } from '@/lib/twitter-user-lookup.js';
import { resolveAuthorScreenName } from '@/lib/fixtweet.js';
import {
  canonicalizeTweetUrl,
  extractTweetId,
  isAnonymousTweetPath,
  resolveTweetDisplayUrl,
} from '@/lib/tweet-url.js';

function makeToken(email, secret) {
  return createHash('sha256').update(`${email || ''}:${secret}`).digest('hex');
}

function linkCountFromLog(log) {
  if (Array.isArray(log?.urls) && log.urls.length > 0) return log.urls.length;
  if (typeof log?.link_count === 'number' && log.link_count > 0) return log.link_count;
  return 1;
}

async function sumAnalysisLinkCount(supabase) {
  const pageSize = 1000;
  let from = 0;
  let total = 0;

  while (true) {
    const { data, error } = await supabase
      .from('analysis_logs')
      .select('link_count, urls')
      .range(from, from + pageSize - 1);

    if (error) return { total: null, error };
    if (!data?.length) break;

    for (const row of data) total += linkCountFromLog(row);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return { total, error: null };
}

async function fetchAllAnalysisLogs(supabase) {
  const pageSize = 1000;
  let from = 0;
  const all = [];

  while (true) {
    const { data, error } = await supabase
      .from('analysis_logs')
      .select('id, user_id, urls, results_json, created_at, video_count, link_count')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data?.length) break;

    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

function expandRecentLogs(rawLogs, resolveUserLabel) {
  const recentLogs = [];
  for (const log of rawLogs) {
    const urls = Array.isArray(log.urls) ? log.urls : [];
    const results = Array.isArray(log.results_json) ? log.results_json : [];
    const { label: userName, username: userUsername } = resolveUserLabel(log.user_id);
    const rows =
      urls.length > 0
        ? urls.map((url, i) => ({ url: url || null, result: results[i] }))
        : [{ url: null, result: results[0] }];

    rows.forEach(({ url, result }, i) => {
      const thumb =
        result?.thumbnail && typeof result.thumbnail === 'string' && result.thumbnail.startsWith('http')
          ? result.thumbnail
          : null;
      const videoCount = Array.isArray(result?.videos)
        ? result.videos.length
        : i === 0 && typeof log.video_count === 'number'
          ? log.video_count
          : 0;
      recentLogs.push({
        id: `${log.id}-${i}`,
        log_id: log.id,
        user_id: log.user_id,
        user_name: userName,
        user_username: userUsername,
        created_at: log.created_at,
        url: resolveTweetDisplayUrl(url, { tweetUrl: result?.tweetUrl, metadata: result?.metadata }),
        thumbnail: thumb,
        video_count: videoCount,
      });
    });
  }
  return recentLogs;
}

async function resolveLegacyAnonymousUrls(recentLogs) {
  const pending = new Map();
  for (const row of recentLogs) {
    if (!row?.url || !isAnonymousTweetPath(row.url)) continue;
    const statusId = extractTweetId(row.url);
    if (!statusId || pending.has(statusId)) continue;
    pending.set(statusId, row.url);
  }
  if (pending.size === 0) return recentLogs;

  const authorByStatusId = new Map();
  await Promise.all(
    [...pending.entries()].map(async ([statusId, url]) => {
      const author = await resolveAuthorScreenName(url);
      if (author) authorByStatusId.set(statusId, author);
    })
  );

  if (authorByStatusId.size === 0) return recentLogs;

  return recentLogs.map((row) => {
    if (!row?.url || !isAnonymousTweetPath(row.url)) return row;
    const statusId = extractTweetId(row.url);
    const author = statusId ? authorByStatusId.get(statusId) : null;
    if (!author) return row;
    return { ...row, url: canonicalizeTweetUrl(row.url, author) };
  });
}

function buildUsernameOptions(recentLogs) {
  const seen = new Map();
  for (const row of recentLogs) {
    const username = String(row.user_username || '').trim();
    if (username) {
      const key = username.toLowerCase();
      if (!seen.has(key)) seen.set(key, { value: username, label: `@${username}` });
      continue;
    }
    const label = String(row.user_name || '').trim();
    if (!label || label === '—') continue;
    const key = `label:${label.toLowerCase()}`;
    if (!seen.has(key)) seen.set(key, { value: label, label });
  }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label, 'tr'));
}

function matchesUsernameFilter(row, filterNorm, mode = 'include') {
  if (!filterNorm) return true;
  const username = String(row.user_username || '').toLowerCase();
  const label = String(row.user_name || '').toLowerCase().replace(/^@+/, '');
  const matches = username === filterNorm || label === filterNorm;
  return mode === 'exclude' ? !matches : matches;
}

function compareSortValues(a, b, dir) {
  const mul = dir === 'asc' ? 1 : -1;
  if (a == null && b == null) return 0;
  if (a == null) return 1 * mul;
  if (b == null) return -1 * mul;
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * mul;
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    if (a === b) return 0;
    return (a ? 1 : -1) * mul;
  }
  const ad = Date.parse(a);
  const bd = Date.parse(b);
  if (!Number.isNaN(ad) && !Number.isNaN(bd)) return (ad - bd) * mul;
  return String(a).localeCompare(String(b), 'tr', { sensitivity: 'base' }) * mul;
}

const LOG_SORT_GETTERS = {
  user: (row) => row.user_username || row.user_name || '',
  created_at: (row) => row.created_at || '',
  url: (row) => row.url || '',
  video_count: (row) => row.video_count ?? 0,
};

function sortRecentLogs(logs, sortBy, sortDir) {
  const getter = LOG_SORT_GETTERS[sortBy] || LOG_SORT_GETTERS.created_at;
  const dir = sortDir === 'asc' ? 'asc' : 'desc';
  return [...logs].sort((a, b) => compareSortValues(getter(a), getter(b), dir));
}

export async function GET(request) {
  const allowedEmail = (process.env.KAMIKAZE_EMAIL || '').trim().toLowerCase();
  const allowedSecret = (process.env.KAMIKAZE_SECRET || '').trim();
  if (!allowedSecret) {
    return NextResponse.json({ error: 'NOT_CONFIGURED' }, { status: 503 });
  }

  const expectedToken = makeToken(allowedEmail, allowedSecret);
  const cookieStore = await cookies();
  const token = cookieStore.get('kamikaze')?.value;
  if (token !== expectedToken) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const supabase = createSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'SUPABASE_NOT_CONFIGURED' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '100', 10) || 100));
  const usernameFilter = (searchParams.get('username') || '').trim().replace(/^@+/, '').toLowerCase();
  const usernameMode = searchParams.get('usernameMode') === 'exclude' ? 'exclude' : 'include';
  const sortBy = ['user', 'created_at', 'url', 'video_count'].includes(searchParams.get('sortBy'))
    ? searchParams.get('sortBy')
    : 'created_at';
  const sortDir = searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc';

  try {
    const [linkSumRes, usersRes, tokenUsersRes, allUsersRes, rawLogs] = await Promise.all([
      sumAnalysisLinkCount(supabase),
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .not('access_token', 'is', null),
      supabase.from('users').select('id, name, email, username'),
      fetchAllAnalysisLogs(supabase),
    ]);

    let usersForLookup = allUsersRes;
    if (allUsersRes.error) {
      const msg = String(allUsersRes.error.message || '');
      const missingCol =
        allUsersRes.error.code === 'PGRST204' ||
        /column .* does not exist/i.test(msg) ||
        /Could not find the '.*' column/.test(msg);
      if (missingCol) {
        console.warn('[kamikaze/stats] users lookup fallback:', allUsersRes.error.message);
        usersForLookup = await supabase.from('users').select('id, name, email');
      } else {
        console.warn('[kamikaze/stats] users lookup:', allUsersRes.error.message);
      }
    }

    if (linkSumRes.error) {
      console.warn('[kamikaze/stats] link sum:', linkSumRes.error.message);
    }

    const totalUsers = usersRes?.count ?? 0;
    const usersWithOAuthToken = tokenUsersRes?.count ?? 0;
    const totalLogs =
      linkSumRes.total ?? rawLogs.reduce((sum, log) => sum + linkCountFromLog(log), 0);

    const userById = new Map();
    const userByEmail = new Map();
    for (const user of usersForLookup.data ?? []) {
      const id = user.id != null ? String(user.id).trim() : '';
      const name = typeof user.name === 'string' ? user.name.trim() : '';
      const email = typeof user.email === 'string' ? user.email.trim() : '';
      const username = typeof user.username === 'string' ? user.username.trim() : '';
      const profile = { id, name, email, username };
      if (id) userById.set(id, profile);
      if (email) userByEmail.set(email.toLowerCase(), profile);
    }

    const userIdsToSync = new Set();
    for (const log of rawLogs) {
      if (!log.user_id || log.user_id === 'guest') continue;
      const key = String(log.user_id).trim();
      const profile = userById.get(key) || userByEmail.get(key.toLowerCase());
      if (profile?.id && !profile.username) userIdsToSync.add(profile.id);
    }

    if (userIdsToSync.size > 0) {
      const { data: syncRows } = await supabase
        .from('users')
        .select('id, username, access_token')
        .in('id', [...userIdsToSync]);

      const synced = await syncMissingUsernames(
        supabase,
        (syncRows ?? []).filter((row) => row?.id && !String(row.username || '').trim())
      );

      for (const [id, username] of synced) {
        const profile = userById.get(id);
        if (profile) profile.username = username;
        for (const entry of userByEmail.values()) {
          if (entry.id === id) entry.username = username;
        }
      }
    }

    const resolveUserLabel = (userId) => {
      if (!userId || userId === 'guest') return { label: 'Misafir', username: null };
      const key = String(userId).trim();
      const user = userById.get(key) || userByEmail.get(key.toLowerCase());
      if (!user) return { label: '—', username: null };
      if (user.username) return { label: `@${user.username}`, username: user.username };
      return { label: '—', username: null };
    };

    const allRecentLogs = await resolveLegacyAnonymousUrls(expandRecentLogs(rawLogs, resolveUserLabel));
    const usernameOptions = buildUsernameOptions(allRecentLogs);
    const filteredLogs = usernameFilter
      ? allRecentLogs.filter((row) => matchesUsernameFilter(row, usernameFilter, usernameMode))
      : allRecentLogs;

    const sortedLogs = sortRecentLogs(filteredLogs, sortBy, sortDir);
    const totalRecentRows = sortedLogs.length;
    const totalPages = Math.max(1, Math.ceil(totalRecentRows / pageSize));
    const safePage = Math.min(page, totalPages);
    const recentLogs = sortedLogs.slice((safePage - 1) * pageSize, safePage * pageSize);

    return NextResponse.json({
      totalLogs,
      totalUsers,
      usersWithOAuthToken,
      recentLogs,
      totalRecentRows,
      page: safePage,
      pageSize,
      totalPages,
      usernameOptions,
    });
  } catch (err) {
    console.warn('[kamikaze/stats]', err);
    return NextResponse.json({ error: 'QUERY_FAILED' }, { status: 500 });
  }
}
