import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createHash } from 'crypto';
import { createSupabaseClient } from '@/lib/supabase.js';

function makeToken(email, secret) {
  return createHash('sha256').update(`${email || ''}:${secret}`).digest('hex');
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

  const logIds = Array.isArray(body.log_ids) ? body.log_ids : [];
  const ids = logIds.filter((id) => typeof id === 'string' && id.length > 0);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0 });
  }

  const supabase = createSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'SUPABASE_NOT_CONFIGURED' }, { status: 503 });
  }

  const { error } = await supabase.from('analysis_logs').delete().in('id', ids);
  if (error) {
    console.warn('[kamikaze/logs/delete]', error);
    return NextResponse.json({ error: 'DELETE_FAILED' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: ids.length });
}
