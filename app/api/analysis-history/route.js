import { NextResponse } from 'next/server';
import { getSessionSafe } from '@/lib/auth.js';
import { createSupabaseClient, ensureUserInSupabase } from '@/lib/supabase.js';
import { insertAnalysisLog } from '@/lib/analysis-log.js';

/** WBS: Sadece analysis_logs tablosu (UNRESTRICTED). analysis_history tablosu kullanılmaz. */
const TABLE_NAME = 'analysis_logs';

async function getSessionAndEnsureUser() {
  try {
    const session = await getSessionSafe();
    if (session?.user?.id) await ensureUserInSupabase(session);
    return session;
  } catch (e) {
    console.error('[analysis-history] getSessionAndEnsureUser:', e?.message ?? e);
    return null;
  }
}

function getHistoryUserId(session) {
  if (!session?.user) return null;
  return session.user.id || session.user.email || null;
}

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } };

/** GET: Liste veya tek kayıt (logId). Sadece giriş yapmış kullanıcının kendi kayıtları. */
export async function GET(request) {
  try {
    const session = await getSessionAndEnsureUser();
    const userId = getHistoryUserId(session);
    if (!userId) {
      const logId = new URL(request.url).searchParams.get('logId');
      if (logId) return NextResponse.json({ log: null }, NO_STORE);
      return NextResponse.json({ logs: [] }, NO_STORE);
    }
    const supabase = createSupabaseClient();

    if (!supabase) {
      console.error('[analysis-history] GET: Supabase client null — veri dönmüyor.');
      return NextResponse.json({ logs: [] }, NO_STORE);
    }

    const logId = new URL(request.url).searchParams.get('logId');

    if (logId) {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('id, urls, link_count, video_count, total_size_display, results_json, language, created_at')
        .eq('id', logId)
        .eq('user_id', userId)
        .eq('is_hidden', false)
        .single();

      if (error) {
        console.error('[analysis-history] GET single error:', error.message, error.code);
        return NextResponse.json({ log: null }, NO_STORE);
      }
      return NextResponse.json({ log: data }, NO_STORE);
    }

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('id, urls, link_count, video_count, total_size_display, results_json, created_at')
      .eq('user_id', userId)
      .eq('is_hidden', false)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[analysis-history] GET list error:', error.message, error.code);
      return NextResponse.json({ logs: [] }, NO_STORE);
    }
    return NextResponse.json({ logs: data ?? [] }, NO_STORE);
  } catch (err) {
    console.error('[analysis-history] GET exception:', err?.message ?? err);
    return NextResponse.json({ logs: [] }, NO_STORE);
  }
}

/** POST: Analiz kaydı yazar (video_url, title, thumbnail, timestamp vb. results_json içinde). Tablo: analysis_logs. */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    console.error('[analysis-history] POST body parse:', e?.message ?? e);
    return NextResponse.json({ ok: false, error: 'Invalid JSON body', code: 'BODY_PARSE' }, { status: 400 });
  }

  try {
    const session = await getSessionAndEnsureUser();
    const userId = getHistoryUserId(session);
    if (!userId) {
      return NextResponse.json({ ok: false, error: 'Unauthorized', code: 'AUTH_REQUIRED' }, { status: 401 });
    }
    const supabase = createSupabaseClient();

    if (!supabase) {
      console.error('[analysis-history] POST: Supabase client null — 503.');
      return NextResponse.json({ ok: false, error: 'SUPABASE_NOT_CONFIGURED', code: 'NO_CLIENT' }, { status: 503 });
    }

    const urls = Array.isArray(body?.urls) ? body.urls : [];
    const results = Array.isArray(body?.results) ? body.results : [];
    const language = typeof body?.language === 'string' ? body.language.toUpperCase().slice(0, 2) : null;
    if (urls.length === 0) {
      return NextResponse.json({ ok: true });
    }
    let videoCount = 0;
    results.forEach((r) => {
      if (r?.status === 'success' && Array.isArray(r.videos)) videoCount += r.videos.length;
    });
    const out = await insertAnalysisLog(supabase, {
      user_id: userId,
      urls,
      results_json: results,
      link_count: urls.length,
      video_count: videoCount,
      language,
    });

    if (!out.ok) {
      const err = out.error;
      console.error('[analysis-history] POST insert failed:', err?.message, 'code:', err?.code);
      return NextResponse.json(
        { ok: false, error: err?.message ?? 'Insert failed', code: err?.code ?? 'INSERT_FAILED' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err?.message ?? String(err);
    console.error('[analysis-history] POST exception:', msg);
    return NextResponse.json({ ok: false, error: msg, code: 'SERVER_ERROR' }, { status: 500 });
  }
}

/** PATCH: Soft-delete (is_hidden = true). Sadece kendi user_id kayıtları. Satır silinmez. */
export async function PATCH(request) {
  try {
    const session = await getSessionAndEnsureUser();
    const userId = getHistoryUserId(session);
    if (!userId) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    const supabase = createSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ ok: false, error: 'SUPABASE_NOT_CONFIGURED' }, { status: 503 });
    }
    const logId = new URL(request.url).searchParams.get('logId');
    let query = supabase.from(TABLE_NAME).update({ is_hidden: true }).eq('user_id', userId);
    if (logId) query = query.eq('id', logId);
    const { error } = await query;
    if (error) {
      console.error('[analysis-history] PATCH soft-delete error:', error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[analysis-history] PATCH exception:', err?.message ?? err);
    return NextResponse.json({ ok: false, error: err?.message ?? 'Update failed' }, { status: 500 });
  }
}
