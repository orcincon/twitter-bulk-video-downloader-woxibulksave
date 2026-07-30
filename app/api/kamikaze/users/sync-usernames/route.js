import { NextResponse } from 'next/server';
import { assertKamikazeAccess } from '@/lib/kamikaze-auth.js';
import { resolveMissingTwitterUsernames } from '@/lib/twitter-user-lookup.js';

function isMissingColumnError(error) {
  const message = String(error?.message || '');
  return error?.code === 'PGRST204' || /column .* does not exist/i.test(message) || /Could not find the '.*' column/.test(message);
}

export async function POST() {
  const auth = await assertKamikazeAccess();
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const usersRes = await supabase
    .from('users')
    .select('id, username, access_token')
    .order('created_at', { ascending: false });

  if (usersRes.error) {
    if (isMissingColumnError(usersRes.error)) {
      return NextResponse.json({ error: 'USERNAME_COLUMN_MISSING' }, { status: 400 });
    }
    console.warn('[kamikaze/users/sync-usernames]', usersRes.error.message);
    return NextResponse.json({ error: 'QUERY_FAILED' }, { status: 500 });
  }

  const users = usersRes.data ?? [];
  const { resolved, updated, failed, skipped } = await resolveMissingTwitterUsernames(users);

  let saved = 0;
  for (const [id, username] of resolved) {
    const { error } = await supabase
      .from('users')
      .update({ username, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.warn('[kamikaze/users/sync-usernames] update failed:', id, error.message);
      continue;
    }
    saved += 1;
  }

  return NextResponse.json({
    ok: true,
    total: users.length,
    missing: updated + failed,
    resolved: updated,
    saved,
    failed,
    skipped,
  });
}
