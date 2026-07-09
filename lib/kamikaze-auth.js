import { cookies } from 'next/headers';
import { createSupabaseClient } from '@/lib/supabase.js';
import { isKamikazeSession } from '@/lib/kamikaze-session.js';

/** @returns {{ supabase: import('@supabase/supabase-js').SupabaseClient } | { error: import('next/server').NextResponse }} */
export async function assertKamikazeAccess() {
  const allowedSecret = (process.env.KAMIKAZE_SECRET || '').trim();
  if (!allowedSecret) {
    const { NextResponse } = await import('next/server');
    return { error: NextResponse.json({ error: 'NOT_CONFIGURED' }, { status: 503 }) };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get('kamikaze')?.value;
  if (!(await isKamikazeSession(token))) {
    const { NextResponse } = await import('next/server');
    return { error: NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }) };
  }

  const supabase = createSupabaseClient();
  if (!supabase) {
    const { NextResponse } = await import('next/server');
    return { error: NextResponse.json({ error: 'SUPABASE_NOT_CONFIGURED' }, { status: 503 }) };
  }

  return { supabase };
}
