import { NextResponse } from 'next/server';
import { getSessionSafe } from '@/lib/auth.js';
import { createSupabaseClient, ensureUserInSupabase } from '@/lib/supabase.js';

/** GET: Kullanıcının dil tercihini al */
export async function GET() {
  const session = await getSessionSafe();
  if (session?.user?.id) await ensureUserInSupabase(session);
  const userId = session?.user?.id || session?.user?.email || null;
  if (!userId) {
    return NextResponse.json({ language: null });
  }

  const supabase = createSupabaseClient();
  if (!supabase) return NextResponse.json({ language: null });

  try {
    const { data, error } = await supabase
      .from('users')
      .select('preferred_language')
      .eq('id', userId)
      .single();

    if (error || !data) return NextResponse.json({ language: null });
    return NextResponse.json({ language: data.preferred_language || 'en' });
  } catch (_) {
    return NextResponse.json({ language: null });
  }
}

/** POST: Dil tercihini kaydet (EN, TR, DE, ES) */
export async function POST(request) {
  const session = await getSessionSafe();
  if (session?.user?.id) await ensureUserInSupabase(session);
  const userId = session?.user?.id || session?.user?.email || null;
  if (!userId) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const supabase = createSupabaseClient();
  if (!supabase) return NextResponse.json({ ok: true });

  try {
    const body = await request.json();
    const lang = typeof body?.language === 'string' ? body.language.toUpperCase().slice(0, 2) : null;
    if (!lang || !['EN', 'TR', 'DE', 'ES'].includes(lang)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    await supabase.from('users').upsert(
      { id: userId, preferred_language: lang.toLowerCase(), updated_at: new Date().toISOString() },
      { onConflict: 'id' }
    );
    return NextResponse.json({ ok: true });
  } catch (_) {
    return NextResponse.json({ ok: true });
  }
}
