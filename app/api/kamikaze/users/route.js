import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createHash } from 'crypto';
import { createSupabaseClient } from '@/lib/supabase.js';

function makeToken(email, secret) {
  return createHash('sha256').update(`${email || ''}:${secret}`).digest('hex');
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

  const supabase = createSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'SUPABASE_NOT_CONFIGURED' }, { status: 503 });
  }

  try {
    const [usersRes, guestsRes] = await Promise.all([
      supabase
        .from('users')
        .select('id, email, name, image, preferred_language, created_at, updated_at, access_token')
        .order('created_at', { ascending: false }),
      supabase
        .from('analysis_logs')
        .select('client_ip, user_agent, created_at')
        .eq('user_id', 'guest')
        .not('client_ip', 'is', null)
        .order('created_at', { ascending: false })
        .limit(2000),
    ]);

    if (usersRes.error) {
      console.warn('[kamikaze/users]', usersRes.error.message);
      return NextResponse.json({ error: 'QUERY_FAILED' }, { status: 500 });
    }

    const guests = [];
    const byIp = new Map();
    for (const row of guestsRes.data ?? []) {
      const ip = row.client_ip || '—';
      if (!byIp.has(ip)) {
        byIp.set(ip, { client_ip: ip, user_agent: row.user_agent || null, count: 0, last_seen: row.created_at });
      }
      const g = byIp.get(ip);
      g.count += 1;
      if (row.created_at && (!g.last_seen || row.created_at > g.last_seen)) g.last_seen = row.created_at;
      if (row.user_agent && !g.user_agent) g.user_agent = row.user_agent;
    }
    guests.push(...byIp.values());
    guests.sort((a, b) => (b.last_seen || '').localeCompare(a.last_seen || ''));

    const users = (usersRes.data ?? []).map(({ access_token, ...rest }) => ({
      ...rest,
      has_oauth_token: Boolean(access_token?.trim()),
    }));

    return NextResponse.json({ users, guests });
  } catch (err) {
    console.warn('[kamikaze/users]', err);
    return NextResponse.json({ error: 'QUERY_FAILED' }, { status: 500 });
  }
}
