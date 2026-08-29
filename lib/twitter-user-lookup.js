import { decryptToken } from './token-crypto.js';
import { checkXAccountStatusByUsername } from '@/lib/tweet-live-status.js';

const BATCH_SIZE = 100;

function getTwitterClientCredentials() {
  const clientId = (process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID || process.env.TWITTER_CLIENT_ID || '').trim();
  const clientSecret = (process.env.TWITTER_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

let appBearerCache = { token: null, expiresAt: 0 };

export async function getTwitterAppBearerToken() {
  const now = Date.now();
  if (appBearerCache.token && appBearerCache.expiresAt > now + 60_000) {
    return appBearerCache.token;
  }

  const creds = getTwitterClientCredentials();
  if (!creds) return null;

  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
  const res = await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    console.warn('[twitter-user-lookup] app bearer failed:', res.status, await res.text().catch(() => ''));
    return null;
  }

  const data = await res.json().catch(() => ({}));
  const token = typeof data.access_token === 'string' ? data.access_token.trim() : '';
  if (!token) return null;

  const expiresIn = Number(data.expires_in) || 7200;
  appBearerCache = { token, expiresAt: now + expiresIn * 1000 };
  return token;
}

function classifyUserLookupError(error) {
  const detail = String(error?.detail || error?.title || '').toLowerCase();
  const type = String(error?.type || '').toLowerCase();
  if (detail.includes('suspend')) return 'suspended';
  if (
    detail.includes('not found') ||
    detail.includes('could not find') ||
    detail.includes('does not exist') ||
    type.includes('resource-not-found')
  ) {
    return 'deleted';
  }
  return 'missing';
}

function lookupErrorUserId(error) {
  const id = error?.resource_id || error?.value;
  return id != null ? String(id).trim() : '';
}

export async function lookupTwitterUsersStatusByIds(ids, bearerToken) {
  const found = new Map();
  const gone = new Map();
  const unique = [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
  if (!unique.length || !bearerToken) return { found, gone };

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const chunk = unique.slice(i, i + BATCH_SIZE);
    const url = new URL('https://api.x.com/2/users');
    url.searchParams.set('ids', chunk.join(','));
    url.searchParams.set('user.fields', 'username');

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });

    if (!res.ok) {
      console.warn('[twitter-user-lookup] batch lookup failed:', res.status, await res.text().catch(() => ''));
      continue;
    }

    const data = await res.json().catch(() => ({}));
    for (const user of data.data ?? []) {
      if (user?.id && user?.username) found.set(String(user.id), user.username);
    }
    for (const error of data.errors ?? []) {
      const id = lookupErrorUserId(error);
      if (!id || found.has(id)) continue;
      const status = classifyUserLookupError(error);
      if (status === 'deleted' || status === 'suspended') gone.set(id, status);
    }
  }

  return { found, gone };
}

export async function lookupTwitterUsersByIds(ids, bearerToken) {
  const { found } = await lookupTwitterUsersStatusByIds(ids, bearerToken);
  return found;
}

export async function lookupTwitterUserByIdWithToken(userId, accessToken) {
  const id = String(userId || '').trim();
  const token = typeof accessToken === 'string' ? accessToken.trim() : '';
  if (!id || !token) return null;

  const url = new URL(`https://api.x.com/2/users/${encodeURIComponent(id)}`);
  url.searchParams.set('user.fields', 'username');

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    console.warn('[twitter-user-lookup] user lookup failed:', id, res.status);
    return null;
  }

  const data = await res.json().catch(() => ({}));
  return typeof data.data?.username === 'string' ? data.data.username : null;
}

export async function resolveMissingTwitterUsernames(users) {
  const missing = (users ?? []).filter((u) => u?.id && !String(u.username || '').trim());
  if (!missing.length) {
    return { updated: 0, failed: 0, skipped: users?.length ?? 0, resolved: new Map() };
  }

  const resolved = new Map();
  const bearer = await getTwitterAppBearerToken();
  if (bearer) {
    const { found } = await lookupTwitterUsersStatusByIds(
      missing.map((u) => u.id),
      bearer
    );
    for (const [id, username] of found) resolved.set(id, username);
  }

  for (const user of missing) {
    if (resolved.has(String(user.id))) continue;
    const token = decryptToken(user.access_token)?.trim();
    if (!token) continue;
    const username = await lookupTwitterUserByIdWithToken(user.id, token);
    if (username) resolved.set(String(user.id), username);
  }

  return {
    updated: resolved.size,
    failed: missing.length - resolved.size,
    skipped: (users?.length ?? 0) - missing.length,
    resolved,
  };
}

export async function syncMissingUsernames(supabase, users) {
  const { resolved } = await resolveMissingTwitterUsernames(users);
  const saved = new Map();
  for (const [id, username] of resolved) {
    const { error } = await supabase
      .from('users')
      .update({ username, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (!error) saved.set(String(id), username);
  }
  return saved;
}

export async function inspectTwitterAccountStatuses(users) {
  const list = (users ?? []).filter((u) => u?.id);
  const resolved = new Map();
  const gone = new Map();
  const active = new Map();
  if (!list.length) {
    return { resolved, gone, active, checked: 0, failed: 0 };
  }

  const { resolved: filled } = await resolveMissingTwitterUsernames(list);
  for (const [id, username] of filled) resolved.set(id, username);

  const named = list
    .map((user) => ({
      ...user,
      username: resolved.get(String(user.id)) || user.username,
    }))
    .filter((user) => String(user.username || '').trim());

  let next = 0;
  async function worker() {
    while (next < named.length) {
      const index = next;
      next += 1;
      const user = named[index];
      const id = String(user.id);
      const username = String(user.username).trim().replace(/^@+/, '');
      const { status } = await checkXAccountStatusByUsername(username);
      if (status === 'deleted' || status === 'suspended') gone.set(id, status);
      else if (status === 'ok') active.set(id, username);
      if (index < named.length - 1) await new Promise((r) => setTimeout(r, 150));
    }
  }
  const pool = Math.max(1, Math.min(4, named.length));
  await Promise.all(Array.from({ length: named.length ? pool : 0 }, () => worker()));

  return {
    resolved,
    gone,
    active,
    checked: named.length,
    failed: list.filter((user) => !active.has(String(user.id)) && !gone.has(String(user.id))).length,
  };
}
