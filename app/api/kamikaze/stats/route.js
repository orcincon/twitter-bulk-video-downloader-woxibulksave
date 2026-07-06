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
    const [logsRes, usersRes, tokenUsersRes, recentRes] = await Promise.all([
      supabase.from('analysis_logs').select('id', { count: 'exact', head: true }),
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .not('access_token', 'is', null),
      supabase
        .from('analysis_logs')
        .select('id, user_id, urls, results_json, created_at')
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    const totalLogs = logsRes?.count ?? 0;
    const totalUsers = usersRes?.count ?? 0;
    const usersWithOAuthToken = tokenUsersRes?.count ?? 0;
    const rawLogs = recentRes?.data ?? [];
    const recentLogs = [];
    for (const log of rawLogs) {
      const urls = Array.isArray(log.urls) ? log.urls : [];
      const results = Array.isArray(log.results_json) ? log.results_json : [];
      urls.forEach((url, i) => {
        const res = results[i];
        const thumb = res?.thumbnail && typeof res.thumbnail === 'string' && res.thumbnail.startsWith('http') ? res.thumbnail : null;
        const videoCount = Array.isArray(res?.videos) ? res.videos.length : 0;
        recentLogs.push({
          id: `${log.id}-${i}`,
          log_id: log.id,
          user_id: log.user_id,
          created_at: log.created_at,
          url: url || null,
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
