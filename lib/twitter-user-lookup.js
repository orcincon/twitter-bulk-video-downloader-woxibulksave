import { decryptToken } from './token-crypto.js';

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
  const res = await fetch('https://api.twitter.com/2/oauth2/token', {
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

export async function lookupTwitterUsersByIds(ids, bearerToken) {
  const out = new Map();
  const unique = [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
  if (!unique.length || !bearerToken) return out;

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const chunk = unique.slice(i, i + BATCH_SIZE);
    const url = new URL('https://api.twitter.com/2/users');
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
      if (user?.id && user?.username) out.set(String(user.id), user.username);
    }
  }

  return out;
}

export async function lookupTwitterUserByIdWithToken(userId, accessToken) {
  const id = String(userId || '').trim();
  const token = typeof accessToken === 'string' ? accessToken.trim() : '';
  if (!id || !token) return null;

  const url = new URL(`https://api.twitter.com/2/users/${encodeURIComponent(id)}`);
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
    const batch = await lookupTwitterUsersByIds(
      missing.map((u) => u.id),
      bearer
    );
    for (const [id, username] of batch) resolved.set(id, username);
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
