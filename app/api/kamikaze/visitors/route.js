import { NextResponse } from 'next/server';
import { assertKamikazeAccess } from '@/lib/kamikaze-auth.js';
import { aggregateVisitorRows, analysisLogToVisitorRow, formatReferrerLabel, isInternalReferrer } from '@/lib/visitor-stats.js';
import { shouldSkipVisit } from '@/lib/record-site-visit.js';

const DAY_BUCKETS = 14;
const WEEK_BUCKETS = 8;

function aggregateReferrers(visitRows) {
  const byLabel = new Map();
  for (const row of visitRows) {
    const label = formatReferrerLabel(row.referrer);
    const href = row.referrer && !isInternalReferrer(row.referrer) ? row.referrer : null;
    const cur = byLabel.get(label) || { label, referrer: href, count: 0 };
    cur.count += 1;
    if (!cur.referrer && href) cur.referrer = href;
    byLabel.set(label, cur);
  }
  return [...byLabel.values()].sort((a, b) => b.count - a.count).slice(0, 25);
}

export async function GET(request) {
  const auth = await assertKamikazeAccess();
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const granularity = new URL(request.url).searchParams.get('granularity') === 'week' ? 'week' : 'day';
  const bucketCount = granularity === 'week' ? WEEK_BUCKETS : DAY_BUCKETS;
  const sinceDays = granularity === 'week' ? WEEK_BUCKETS * 7 + 7 : DAY_BUCKETS + 1;
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - sinceDays);
  const sinceIso = since.toISOString();

  try {
    const rows = [];
    let visitRows = [];
    let visitError = null;

    const visitRes = await supabase
      .from('site_visits')
      .select('visitor_key, created_at, referrer, path, client_ip, user_id')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(100000);

    visitRows = (visitRes.data ?? []).filter(
      (row) => !shouldSkipVisit({ path: row.path, referrer: row.referrer })
    );
    visitError = visitRes.error;

    if (!visitError) {
      rows.push(...visitRows.map(({ visitor_key, created_at }) => ({ visitor_key, created_at })));
    } else if (visitError.code !== '42P01') {
      console.warn('[kamikaze/visitors] site_visits:', visitError.message);
    }

    const usingAnalysisFallback = rows.length === 0 && !visitError;

    if (usingAnalysisFallback) {
      const { data: logRows, error: logError } = await supabase
        .from('analysis_logs')
        .select('user_id, client_ip, created_at')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(100000);

      if (!logError) {
        for (const log of logRows ?? []) {
          const mapped = analysisLogToVisitorRow(log);
          if (mapped) rows.push(mapped);
        }
      } else {
        console.warn('[kamikaze/visitors] analysis_logs:', logError.message);
      }
    }

    const stats = aggregateVisitorRows(rows, granularity, bucketCount);
    const referrers = !visitError ? aggregateReferrers(visitRows) : [];
    const recentVisits = !visitError
      ? visitRows.slice(0, 40).map((v) => ({
          created_at: v.created_at,
          path: v.path || '/',
          referrer: v.referrer && !isInternalReferrer(v.referrer) ? v.referrer : null,
          referrerLabel: formatReferrerLabel(v.referrer),
          client_ip: v.client_ip || null,
          user_id: v.user_id || null,
        }))
      : [];

    const serviceRoleConfigured = Boolean((process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim());

    return NextResponse.json({
      granularity,
      uniqueVisitors: stats.uniqueVisitors,
      totalVisits: stats.totalVisits,
      breakdown: stats.breakdown,
      usingAnalysisFallback,
      tableReady: !visitError,
      serviceRoleConfigured,
      referrers,
      recentVisits,
    });
  } catch (err) {
    console.warn('[kamikaze/visitors]', err);
    return NextResponse.json({ error: 'QUERY_FAILED' }, { status: 500 });
  }
}
