import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createHash } from 'crypto';
import { createSupabaseClient } from '@/lib/supabase.js';
import { formatReferrerLabel, aggregateVisitorRows } from '@/lib/visitor-stats.js';

const PAGE_SIZE = 1000;
const MAX_ROWS = 50000;
const DAILY_DAYS = 15;
const TZ = 'Europe/Istanbul';

function makeToken(email, secret) {
  return createHash('sha256').update(`${email || ''}:${secret}`).digest('hex');
}

function normalizePath(path) {
  if (!path || typeof path !== 'string') return '/';
  const trimmed = path.trim() || '/';
  const base = trimmed.split('?')[0] || '/';
  if (base !== '/' && base.endsWith('/')) return base.slice(0, -1);
  return base;
}

function isMissingTableError(error) {
  const message = String(error?.message || '');
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    /site_visits/i.test(message) ||
    /site_visit_/i.test(message) ||
    /does not exist/i.test(message) ||
    /Could not find the table/i.test(message)
  );
}

function isMissingRpcError(error) {
  const message = String(error?.message || '');
  return (
    error?.code === 'PGRST202' ||
    error?.code === '42883' ||
    /kamikaze_visitor_stats/i.test(message) ||
    /could not find the function/i.test(message)
  );
}

function emptyPayload(serviceRoleConfigured, tableReady = true) {
  return {
    uniqueVisitors: 0,
    totalVisits: 0,
    pages: [],
    referrers: [],
    daily: [],
    tableReady,
    serviceRoleConfigured,
    truncated: false,
  };
}

function mapRpcPages(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((p) => ({
      path: normalizePath(p?.path),
      visits: Number(p?.visits) || 0,
      uniqueVisitors: Number(p?.uniqueVisitors) || 0,
    }))
    .sort((a, b) => b.visits - a.visits || a.path.localeCompare(b.path));
}

function mapRpcReferrers(rows) {
  const referrerMap = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const referrerRaw = typeof row?.referrer === 'string' ? row.referrer.trim() : '';
    const label = formatReferrerLabel(referrerRaw || null);
    const key = referrerRaw && label !== 'Doğrudan / bilinmiyor' ? referrerRaw : '__direct__';
    let ref = referrerMap.get(key);
    if (!ref) {
      ref = {
        label,
        referrer: key === '__direct__' ? null : referrerRaw,
        visits: 0,
        uniqueVisitors: 0,
      };
      referrerMap.set(key, ref);
    }
    ref.visits += Number(row?.visits) || 0;
    ref.uniqueVisitors += Number(row?.uniqueVisitors) || 0;
  }
  return [...referrerMap.values()].sort(
    (a, b) => b.visits - a.visits || a.label.localeCompare(b.label, 'tr')
  );
}

function dayKeyInTz(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function shiftDayKey(key, deltaDays) {
  const [y, m, d] = key.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
  return shifted.toISOString().slice(0, 10);
}

function fillDailyWindow(rows, days = DAILY_DAYS) {
  const map = new Map();
  for (const row of rows || []) {
    const period = String(row?.period || row?.day || '').slice(0, 10);
    if (!period) continue;
    map.set(period, {
      period,
      uniqueVisitors: Number(row?.uniqueVisitors ?? row?.unique_visitors) || 0,
      totalVisits: Number(row?.totalVisits ?? row?.visits) || 0,
    });
  }

  const todayKey = dayKeyInTz(new Date());
  const filled = [];
  for (let i = 0; i < days; i += 1) {
    const period = shiftDayKey(todayKey, -i);
    filled.push(map.get(period) || { period, uniqueVisitors: 0, totalVisits: 0 });
  }
  return filled;
}

function mapRpcDaily(rows) {
  return fillDailyWindow(
    (Array.isArray(rows) ? rows : []).map((d) => ({
      period: String(d?.period || ''),
      uniqueVisitors: Number(d?.uniqueVisitors) || 0,
      totalVisits: Number(d?.totalVisits) || 0,
    }))
  );
}

function payloadFromRpc(data, serviceRoleConfigured) {
  const raw = typeof data === 'string' ? JSON.parse(data) : data || {};
  return {
    uniqueVisitors: Number(raw.uniqueVisitors) || 0,
    totalVisits: Number(raw.totalVisits) || 0,
    pages: mapRpcPages(raw.pages),
    referrers: mapRpcReferrers(raw.referrers),
    daily: mapRpcDaily(raw.daily),
    tableReady: true,
    serviceRoleConfigured,
    truncated: false,
  };
}

async function fetchSummaryStats(supabase) {
  const { data: daily, error: dailyError } = await supabase
    .from('site_visit_daily')
    .select('day, visits, unique_visitors');

  if (dailyError) return { error: dailyError, payload: null };

  const [pagesRes, referrersRes, uniqueRes] = await Promise.all([
    supabase.from('site_visit_pages').select('path, visits, unique_visitors'),
    supabase.from('site_visit_referrers').select('referrer, visits, unique_visitors'),
    supabase.from('site_visit_visitors').select('*', { count: 'exact', head: true }),
  ]);

  const error = pagesRes.error || referrersRes.error || uniqueRes.error;
  if (error) return { error, payload: null };

  const totalVisits = (daily || []).reduce((sum, row) => sum + (Number(row.visits) || 0), 0);

  return {
    error: null,
    payload: {
      uniqueVisitors: uniqueRes.count ?? 0,
      totalVisits,
      pages: mapRpcPages(
        (pagesRes.data || []).map((p) => ({
          path: p.path,
          visits: p.visits,
          uniqueVisitors: p.unique_visitors,
        }))
      ),
      referrers: mapRpcReferrers(
        (referrersRes.data || []).map((r) => ({
          referrer: r.referrer,
          visits: r.visits,
          uniqueVisitors: r.unique_visitors,
        }))
      ),
      daily: fillDailyWindow(daily),
    },
  };
}

async function fetchExactTotal(supabase) {
  const { count, error } = await supabase
    .from('site_visits')
    .select('*', { count: 'exact', head: true });
  return { count: count ?? 0, error };
}

async function fetchAllSiteVisits(supabase) {
  const rows = [];
  let from = 0;

  while (from < MAX_ROWS) {
    const to = Math.min(from + PAGE_SIZE - 1, MAX_ROWS - 1);
    const { data, error } = await supabase
      .from('site_visits')
      .select('visitor_key, path, referrer, created_at')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) return { rows, error };
    if (!data?.length) break;

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { rows, error: null };
}

function aggregateVisits(rows) {
  const uniqueVisitors = new Set();
  const pageMap = new Map();
  const referrerMap = new Map();

  for (const row of rows) {
    const visitorKey = String(row.visitor_key || 'anon:unknown');
    uniqueVisitors.add(visitorKey);

    const path = normalizePath(row.path);
    let page = pageMap.get(path);
    if (!page) {
      page = { path, visits: 0, unique: new Set() };
      pageMap.set(path, page);
    }
    page.visits += 1;
    page.unique.add(visitorKey);

    const referrerRaw = typeof row.referrer === 'string' ? row.referrer.trim() : '';
    const label = formatReferrerLabel(referrerRaw || null);
    const key = referrerRaw && label !== 'Doğrudan / bilinmiyor' ? referrerRaw : '__direct__';
    let ref = referrerMap.get(key);
    if (!ref) {
      ref = {
        label,
        referrer: key === '__direct__' ? null : referrerRaw,
        visits: 0,
        unique: new Set(),
      };
      referrerMap.set(key, ref);
    }
    ref.visits += 1;
    ref.unique.add(visitorKey);
  }

  const pages = [...pageMap.values()]
    .map(({ path, visits, unique }) => ({
      path,
      visits,
      uniqueVisitors: unique.size,
    }))
    .sort((a, b) => b.visits - a.visits || a.path.localeCompare(b.path));

  const referrers = [...referrerMap.values()]
    .map(({ label, referrer, visits, unique }) => ({
      label,
      referrer,
      visits,
      uniqueVisitors: unique.size,
    }))
    .sort((a, b) => b.visits - a.visits || a.label.localeCompare(b.label, 'tr'));

  return {
    uniqueVisitors: uniqueVisitors.size,
    totalVisits: rows.length,
    pages,
    referrers,
    daily: aggregateVisitorRows(rows, 'day', DAILY_DAYS).breakdown,
  };
}

export async function GET() {
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

  const serviceRoleConfigured = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const supabase = createSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'SUPABASE_NOT_CONFIGURED' }, { status: 503 });
  }

  try {
    const summary = await fetchSummaryStats(supabase);
    if (
      !summary.error &&
      summary.payload &&
      (summary.payload.totalVisits > 0 || summary.payload.uniqueVisitors > 0)
    ) {
      return NextResponse.json({
        ...summary.payload,
        tableReady: true,
        serviceRoleConfigured,
        truncated: false,
      });
    }

    const { data: rpcData, error: rpcError } = await supabase.rpc('kamikaze_visitor_stats', {
      p_daily_days: DAILY_DAYS,
    });

    if (!rpcError && rpcData) {
      return NextResponse.json(payloadFromRpc(rpcData, serviceRoleConfigured));
    }

    if (rpcError && !isMissingRpcError(rpcError) && isMissingTableError(rpcError)) {
      return NextResponse.json(emptyPayload(serviceRoleConfigured, false));
    }

    if (rpcError && !isMissingRpcError(rpcError)) {
      console.warn('[kamikaze/visitors] rpc', rpcError.message);
    }

    const [{ count: exactTotal, error: countError }, { rows, error: rowsError }] = await Promise.all([
      fetchExactTotal(supabase),
      fetchAllSiteVisits(supabase),
    ]);

    const error = countError || rowsError;
    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json(emptyPayload(serviceRoleConfigured, false));
      }
      console.warn('[kamikaze/visitors]', error.message);
      return NextResponse.json({ error: 'QUERY_FAILED' }, { status: 500 });
    }

    const aggregated = aggregateVisits(rows);

    return NextResponse.json({
      ...aggregated,
      totalVisits: exactTotal,
      tableReady: true,
      serviceRoleConfigured,
      truncated: false,
    });
  } catch (err) {
    console.warn('[kamikaze/visitors]', err);
    return NextResponse.json({ error: 'QUERY_FAILED' }, { status: 500 });
  }
}
