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

  const userIds = Array.isArray(body.user_ids)
    ? body.user_ids.filter((id) => typeof id === 'string' && id.length > 0)
    : [];
  if (userIds.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0 });
  }

  const { error: logsError } = await supabase.from('analysis_logs').delete().in('user_id', userIds);
  if (logsError) {
    console.warn('[kamikaze/users/delete] logs', logsError);
    return NextResponse.json({ error: 'DELETE_FAILED' }, { status: 500 });
  }

  const { error: usersError } = await supabase.from('users').delete().in('id', userIds);
  if (usersError) {
    console.warn('[kamikaze/users/delete] users', usersError);
    return NextResponse.json({ error: 'DELETE_FAILED' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: userIds.length });
}
