import { encryptToken, decryptToken } from './token-crypto.js';

const TOKEN_URL = 'https://api.x.com/2/oauth2/token';
const REFRESH_SKEW_MS = 5 * 60 * 1000;
const inflightByUserId = new Map();

export function getTwitterOAuthClientCredentials() {
  const clientId = (process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID || process.env.TWITTER_CLIENT_ID || '').trim();
  const clientSecret = (process.env.TWITTER_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

function isMissingColumnError(error) {
  const message = String(error?.message || '');
  return error?.code === 'PGRST204' || /column .* does not exist/i.test(message) || /Could not find the '.*' column/.test(message);
}

function isInvalidGrant(status, body) {
  const err = String(body?.error || '').toLowerCase();
  return (status === 400 || status === 401) && err === 'invalid_grant';
}

async function postTokenRequest(body, useBasic) {
  const creds = getTwitterOAuthClientCredentials();
  if (!creds) return { ok: false, status: 0, data: {} };
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (useBasic) {
    headers.Authorization = `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')}`;
  }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers,
    body,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/**
 * X OAuth 2.0 refresh. Refresh token döner (rotation); eskisi geçersiz olur.
 * @returns {{ accessToken: string, refreshToken: string|null, expiresAt: number } | { error: string, invalidGrant?: boolean }}
 */
export async function refreshTwitterOAuthToken(refreshToken) {
  const raw = typeof refreshToken === 'string' ? refreshToken.trim() : '';
  const creds = getTwitterOAuthClientCredentials();
  if (!raw) return { error: 'NO_REFRESH_TOKEN' };
  if (!creds) return { error: 'NO_CLIENT' };

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: raw,
    client_id: creds.clientId,
  }).toString();

  let result = await postTokenRequest(body, true);
  if (!result.ok && (result.status === 401 || result.status === 403)) {
    result = await postTokenRequest(body, false);
  }

  if (!result.ok) {
    const invalidGrant = isInvalidGrant(result.status, result.data);
    if (!invalidGrant) {
      console.warn('[oauth-refresh] failed:', result.status, result.data?.error || result.data?.error_description || '');
    }
    return { error: String(result.data?.error || result.status || 'REFRESH_FAILED'), invalidGrant };
  }

  const accessToken = typeof result.data.access_token === 'string' ? result.data.access_token.trim() : '';
  if (!accessToken) return { error: 'NO_ACCESS_TOKEN' };
  const nextRefresh = typeof result.data.refresh_token === 'string' ? result.data.refresh_token.trim() : '';
  const expiresIn = Number(result.data.expires_in);
  const expiresAt = Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 7200) * 1000;
  return { accessToken, refreshToken: nextRefresh || null, expiresAt };
}

export async function persistRefreshedUserTokens(supabase, userId, tokens) {
  if (!supabase || !userId || !tokens?.accessToken) return false;
  const payload = {
    access_token: encryptToken(tokens.accessToken),
    token_expires_at: new Date(tokens.expiresAt).toISOString(),
    token_is_valid: true,
    updated_at: new Date().toISOString(),
  };
  if (tokens.refreshToken) payload.refresh_token = encryptToken(tokens.refreshToken);

  let { error } = await supabase.from('users').update(payload).eq('id', userId);
  if (error && isMissingColumnError(error)) {
    const fallback = { access_token: payload.access_token, token_is_valid: true, updated_at: payload.updated_at };
    ({ error } = await supabase.from('users').update(fallback).eq('id', userId));
  }
  if (error) {
    console.warn('[oauth-refresh] persist failed:', userId, error.message);
    return false;
  }
  return true;
}

export async function markRefreshTokenUnusable(supabase, userId) {
  if (!supabase || !userId) return;
  const payload = {
    token_is_valid: false,
    refresh_token: null,
    updated_at: new Date().toISOString(),
  };
  let { error } = await supabase.from('users').update(payload).eq('id', userId);
  if (error && isMissingColumnError(error)) {
    ({ error } = await supabase
      .from('users')
      .update({ token_is_valid: false, updated_at: payload.updated_at })
      .eq('id', userId));
  }
  if (error) console.warn('[oauth-refresh] invalidate refresh failed:', userId, error.message);
}

export function accessTokenNeedsRefresh(user, { force = false } = {}) {
  if (force) return true;
  if (user?.token_is_valid === false) return true;
  const exp = user?.token_expires_at ? Date.parse(user.token_expires_at) : NaN;
  if (!Number.isFinite(exp)) return false;
  return Date.now() >= exp - REFRESH_SKEW_MS;
}

async function refreshAndPersistUser(supabase, user) {
  const userId = user?.id;
  const refreshToken = decryptToken(user?.refresh_token)?.trim();
  if (!userId || !refreshToken) return null;

  const result = await refreshTwitterOAuthToken(refreshToken);
  if (result.accessToken) {
    const saved =
      (await persistRefreshedUserTokens(supabase, userId, result)) ||
      (await persistRefreshedUserTokens(supabase, userId, result));
    if (!saved) console.warn('[oauth-refresh] persist failed after refresh:', userId);
    return result.accessToken;
  }
  if (result.invalidGrant) {
    await markRefreshTokenUnusable(supabase, userId);
  }
  return null;
}

/**
 * Gerekirse access token'ı yeniler. Aynı kullanıcı için eşzamanlı yenilemeleri tek isteğe indirir.
 * @returns {Promise<string|null>} düz access token
 */
export async function ensureFreshUserAccessToken(supabase, user, { force = false } = {}) {
  const userId = user?.id != null ? String(user.id) : '';
  const storedAccess = decryptToken(user?.access_token)?.trim() || '';
  const hasRefresh = Boolean(decryptToken(user?.refresh_token)?.trim());

  if (!force && storedAccess && user?.token_is_valid !== false && !accessTokenNeedsRefresh(user)) {
    return storedAccess;
  }
  if (!hasRefresh) {
    return user?.token_is_valid === false ? null : storedAccess || null;
  }

  const existing = inflightByUserId.get(userId);
  if (existing) return existing;

  const pending = refreshAndPersistUser(supabase, user)
    .then((token) => token || (user?.token_is_valid === false ? null : storedAccess || null))
    .finally(() => inflightByUserId.delete(userId));
  inflightByUserId.set(userId, pending);
  return pending;
}
