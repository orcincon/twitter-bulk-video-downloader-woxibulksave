import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createHash } from 'crypto';
import { createSupabaseClient } from '@/lib/supabase.js';

function makeToken(email, secret) {
  return createHash('sha256').update(`${email || ''}:${secret}`).digest('hex');
}

async function assertKamikazeAuth() {
  const allowedSecret = (process.env.KAMIKAZE_SECRET || '').trim();
  if (!allowedSecret) {
    return { error: NextResponse.json({ error: 'NOT_CONFIGURED' }, { status: 503 }) };
  }

  const allowedEmail = (process.env.KAMIKAZE_EMAIL || '').trim().toLowerCase();
  const expectedToken = makeToken(allowedEmail, allowedSecret);
  const cookieStore = await cookies();
  const token = cookieStore.get('kamikaze')?.value;
  if (token !== expectedToken) {
    return { error: NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }) };
  }

  const supabase = createSupabaseClient();
  if (!supabase) {
    return { error: NextResponse.json({ error: 'SUPABASE_NOT_CONFIGURED' }, { status: 503 }) };
  }

  return { supabase };
}

export async function POST(request) {
  const auth = await assertKamikazeAuth();
  if (auth.error) return auth.error;
  const { supabase } = auth;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const clientIps = Array.isArray(body.client_ips)
    ? body.client_ips.filter((ip) => typeof ip === 'string' && ip.length > 0)
    : [];
  if (clientIps.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0 });
  }

  const { error, count } = await supabase
    .from('analysis_logs')
    .delete({ count: 'exact' })
    .eq('user_id', 'guest')
    .in('client_ip', clientIps);

  if (error) {
    console.warn('[kamikaze/guests/delete]', error);
    return NextResponse.json({ error: 'DELETE_FAILED' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: count ?? clientIps.length });
}
