import { createClient } from '@supabase/supabase-js';
import { encryptToken } from './token-crypto.js';

/**
 * WBS — Server-side Supabase client.
 * Sadece .env.local'daki değişkenleri kullanır (wbs-config anahtar tutmaz).
 * RLS bypass için SUPABASE_SERVICE_ROLE_KEY kullanın; yoksa anon key RLS'e takılabilir.
 */
export function createSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = serviceKey || anonKey;

  if (!url || !key) {
    console.error(
      '[supabase] Client null. Sebep: .env.local\'da NEXT_PUBLIC_SUPABASE_URL ve (SUPABASE_SERVICE_ROLE_KEY veya NEXT_PUBLIC_SUPABASE_ANON_KEY) tanımlı değil.'
    );
    return null;
  }

  if (!serviceKey && anonKey) {
    console.error(
      '[supabase] RLS uyarısı: Sadece anon key var. Insert reddedilirse SUPABASE_SERVICE_ROLE_KEY ekleyin veya analysis_logs için RLS kapatın (migration 010).'
    );
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Giriş yapmış kullanıcıyı users tablosuna yazar (lazy sync).
 * Oturumda access_token varsa ve DB'de yok/geçersizse şifreleyerek kaydeder.
 */
export async function ensureUserInSupabase(session) {
  const user = session?.user;
  if (!user?.id) return false;
  const supabase = createSupabaseClient();
  if (!supabase) return false;

  const payload = {
    id: user.id,
    email: user.email || null,
    name: user.name || null,
    image: user.image || null,
    updated_at: new Date().toISOString(),
  };

  const sessionToken = typeof session?.access_token === 'string' ? session.access_token.trim() : '';
  if (sessionToken) {
    const { data: row, error: readError } = await supabase
      .from('users')
      .select('access_token, token_is_valid')
      .eq('id', user.id)
      .maybeSingle();

    if (readError) {
      console.warn('[supabase] ensureUser token check:', readError.message);
    } else {
      const hasStored = Boolean(row?.access_token?.trim());
      const invalid = row?.token_is_valid === false;
      if (!hasStored || invalid) {
        payload.access_token = encryptToken(sessionToken);
        payload.token_is_valid = true;
      }
    }
  }

  try {
    const { error } = await supabase.from('users').upsert(payload, { onConflict: 'id' });
    if (error) {
      console.error('[supabase] ensureUser error:', error.message, error.code);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[supabase] ensureUser exception:', e?.message ?? e);
    return false;
  }
}
