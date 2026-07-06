/**
 * WBS — analysis_logs tablosuna tek kayıt yazar.
 * Şema: id, user_id (text), urls (jsonb), results_json (jsonb), link_count (int), video_count (int),
 *       total_size (bigint), total_size_display (text), language (text), created_at
 */

const ANALYSIS_LOGS_TABLE = 'analysis_logs';

/**
 * Supabase analysis_logs tablosuna yazar. Kolon isimleri panel ile birebir.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} payload — user_id, urls, results_json, link_count, video_count, total_size_display, language?
 * @returns {{ ok: boolean, id?: string, error?: { message: string, code?: string } }}
 */
export async function insertAnalysisLog(supabase, payload) {
  if (!supabase) {
    console.error('[analysis-log] Insert iptal: Supabase client null');
    return { ok: false, error: { message: 'Supabase client null', code: 'NO_CLIENT' } };
  }

  const row = {
    user_id: payload.user_id ?? 'guest',
    urls: payload.urls ?? [],
    results_json: payload.results_json ?? null,
    link_count: payload.link_count ?? 0,
    video_count: payload.video_count ?? 0,
    total_size_display: payload.total_size_display ?? null,
    language: payload.language ?? null,
  };

  try {
    const { data, error } = await supabase
      .from(ANALYSIS_LOGS_TABLE)
      .insert(row)
      .select('id')
      .single();

    if (error) {
      const reason =
        error.code === '42501'
          ? 'RLS izni (service_role kullanın veya migration 010)'
          : error.code === 'PGRST301' || error.message?.includes('JWT')
            ? 'Bağlantı/auth hatası (URL ve key kontrolü)'
            : error.message;
      console.error('[analysis-log] Insert hatası:', reason, 'code:', error.code);
      return { ok: false, error: { message: error.message, code: error.code } };
    }

    if (data?.id) {
      console.log('[analysis-log] New record added:', data.id);
      return { ok: true, id: data.id };
    }

    console.error('[analysis-log] Insert sonrası id dönmedi.');
    return { ok: false, error: { message: 'No id returned' } };
  } catch (e) {
    const msg = e?.message ?? String(e);
    console.error('[analysis-log] Insert exception (bağlantı/network?):', msg);
    return { ok: false, error: { message: msg } };
  }
}
