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
    const [logsRes, usersRes, tokenUsersRes, recentRes, allUsersRes] = await Promise.all([
      supabase.from('analysis_logs').select('id', { count: 'exact', head: true }),
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .not('access_token', 'is', null),
      supabase
        .from('analysis_logs')
        .select('id, user_id, urls, results_json, created_at, video_count, link_count')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('users').select('id, name, email'),
    ]);

    const totalLogs = logsRes?.count ?? 0;
    const totalUsers = usersRes?.count ?? 0;
    const usersWithOAuthToken = tokenUsersRes?.count ?? 0;
    const rawLogs = recentRes?.data ?? [];

    if (allUsersRes.error) {
      console.warn('[kamikaze/stats] users lookup:', allUsersRes.error.message);
    }

    const userById = new Map();
    const userByEmail = new Map();
    for (const user of allUsersRes.data ?? []) {
      const id = user.id != null ? String(user.id).trim() : '';
      const name = typeof user.name === 'string' ? user.name.trim() : '';
      const email = typeof user.email === 'string' ? user.email.trim() : '';
      const profile = { name, email };
      if (id) userById.set(id, profile);
      if (email) userByEmail.set(email.toLowerCase(), profile);
    }

    const resolveUserLabel = (userId) => {
      if (!userId || userId === 'guest') return 'Misafir';
      const key = String(userId).trim();
      const user = userById.get(key) || userByEmail.get(key.toLowerCase());
      if (!user) return '—';
      return user.name || user.email || '—';
    };

    const recentLogs = [];
    for (const log of rawLogs) {
      const urls = Array.isArray(log.urls) ? log.urls : [];
      const results = Array.isArray(log.results_json) ? log.results_json : [];
      const userName = resolveUserLabel(log.user_id);
      const rows =
        urls.length > 0
          ? urls.map((url, i) => ({ url: url || null, result: results[i] }))
          : [{ url: null, result: results[0] }];

      rows.forEach(({ url, result }, i) => {
        const thumb = result?.thumbnail && typeof result.thumbnail === 'string' && result.thumbnail.startsWith('http') ? result.thumbnail : null;
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
          created_at: log.created_at,
          url,
          thumbnail: thumb,
          video_count: videoCount,
        });
      });
    }

    return NextResponse.json({
      totalLogs,
      totalUsers,
      usersWithOAuthToken,
      recentLogs,
    });
  } catch (err) {
    console.warn('[kamikaze/stats]', err);
    return NextResponse.json({ error: 'QUERY_FAILED' }, { status: 500 });
  }
}
