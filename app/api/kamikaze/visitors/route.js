import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createHash } from 'crypto';
import { createSupabaseClient } from '@/lib/supabase.js';
import { formatReferrerLabel, aggregateVisitorRows } from '@/lib/visitor-stats.js';

const PAGE_SIZE = 1000;
const MAX_ROWS = 50000;
const DAILY_DAYS = 15;

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
    /does not exist/i.test(message) ||
    /Could not find the table/i.test(message)
  );
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
    const { rows, error } = await fetchAllSiteVisits(supabase);

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({
          uniqueVisitors: 0,
          totalVisits: 0,
          pages: [],
          referrers: [],
          daily: [],
          tableReady: false,
          serviceRoleConfigured,
          truncated: false,
        });
      }
      console.warn('[kamikaze/visitors]', error.message);
      return NextResponse.json({ error: 'QUERY_FAILED' }, { status: 500 });
    }

    const aggregated = aggregateVisits(rows);

    return NextResponse.json({
      ...aggregated,
      tableReady: true,
      serviceRoleConfigured,
      truncated: rows.length >= MAX_ROWS,
    });
  } catch (err) {
    console.warn('[kamikaze/visitors]', err);
    return NextResponse.json({ error: 'QUERY_FAILED' }, { status: 500 });
  }
}
