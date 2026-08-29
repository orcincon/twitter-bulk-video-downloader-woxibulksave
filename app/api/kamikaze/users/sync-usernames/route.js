import { NextResponse } from 'next/server';
import { assertKamikazeAccess } from '@/lib/kamikaze-auth.js';
import { inspectTwitterAccountStatuses } from '@/lib/twitter-user-lookup.js';

function isMissingColumnError(error) {
  const message = String(error?.message || '');
  return error?.code === 'PGRST204' || /column .* does not exist/i.test(message) || /Could not find the '.*' column/.test(message);
}

async function updateUser(supabase, id, payload) {
  let { error } = await supabase.from('users').update(payload).eq('id', id);
  if (error && isMissingColumnError(error) && 'x_account_status' in payload) {
    const fallback = { ...payload };
    delete fallback.x_account_status;
    ({ error } = await supabase.from('users').update(fallback).eq('id', id));
  }
  return error;
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
  const { resolved, gone, active, checked, failed } = await inspectTwitterAccountStatuses(users);
  const now = new Date().toISOString();

  let saved = 0;
  const okIds = new Set([...resolved.keys(), ...active.keys()]);
  for (const id of okIds) {
    if (gone.has(String(id))) continue;
    const username = resolved.get(String(id)) || active.get(String(id));
    if (!username) continue;
    const current = users.find((user) => String(user.id) === String(id));
    const sameName = String(current?.username || '').trim() === username;
    const error = await updateUser(supabase, id, {
      username,
      x_account_status: 'ok',
      updated_at: now,
    });
    if (error) {
      console.warn('[kamikaze/users/sync-usernames] update failed:', id, error.message);
      continue;
    }
    if (!sameName) saved += 1;
  }

  let deleted = 0;
  let suspended = 0;
  let invalidated = 0;
  for (const [id, status] of gone) {
    const error = await updateUser(supabase, id, {
      token_is_valid: false,
      x_account_status: status,
      updated_at: now,
    });
    if (error) {
      console.warn('[kamikaze/users/sync-usernames] gone update failed:', id, error.message);
      continue;
    }
    invalidated += 1;
    if (status === 'suspended') suspended += 1;
    else deleted += 1;
  }

  return NextResponse.json({
    ok: true,
    total: users.length,
    checked,
    saved,
    deleted,
    suspended,
    invalidated,
    failed,
    gone: [...gone.entries()].map(([id, status]) => ({ id, status })),
  });
}
