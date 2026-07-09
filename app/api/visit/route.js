import { NextResponse } from 'next/server';
import { getSessionSafe } from '@/lib/auth.js';
import { getClientIp, getUserAgent } from '@/lib/request-client.js';
import { buildVisitRow, recordSiteVisit, shouldSkipVisit } from '@/lib/record-site-visit.js';
import { isKamikazeSession } from '@/lib/kamikaze-session.js';

const NO_STORE = { headers: { 'Cache-Control': 'no-store' } };

export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const path = typeof body?.path === 'string' ? body.path.slice(0, 200) : '/';
  const referrer =
    (typeof body?.referrer === 'string' && body.referrer.trim()) ||
    request.headers.get('referer') ||
    null;
  const kamikazeSession = await isKamikazeSession(request.cookies.get('kamikaze')?.value);

  if (shouldSkipVisit({ path, referrer, kamikazeSession })) {
    return NextResponse.json({ ok: true, skipped: true }, NO_STORE);
  }

  const session = await getSessionSafe();
  const userId = session?.user?.id || null;
  const clientIp = getClientIp(request);
  const userAgent = getUserAgent(request);
  const clientVisitorId =
    typeof body?.clientVisitorId === 'string' && body.clientVisitorId.length >= 8
      ? body.clientVisitorId.slice(0, 64)
      : null;

  const row = buildVisitRow({
    path,
    referrer,
    clientIp,
    userAgent,
    userId,
    clientVisitorId,
  });

  const result = await recordSiteVisit(row);

  if (!result.ok) {
    if (result.error === 'TABLE_MISSING') {
      return NextResponse.json({ ok: false, error: 'TABLE_MISSING' }, { status: 503, ...NO_STORE });
    }
    if (result.error === 'NO_SERVICE_ROLE') {
      return NextResponse.json({ ok: false, error: 'NO_SERVICE_ROLE' }, { status: 503, ...NO_STORE });
    }
    if (result.error === 'RLS_DENIED') {
      console.warn('[visit] RLS engeli — SUPABASE_SERVICE_ROLE_KEY gerekli');
      return NextResponse.json({ ok: false, error: 'RLS_DENIED' }, { status: 500, ...NO_STORE });
    }
    console.warn('[visit]', result.error);
    return NextResponse.json({ ok: false, error: result.error }, { status: 500, ...NO_STORE });
  }

  return NextResponse.json({ ok: true }, NO_STORE);
}
