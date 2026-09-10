import { createSupabaseClient } from './supabase.js';
import { decryptToken } from './token-crypto.js';
import { ensureFreshUserAccessToken } from './twitter-oauth-refresh.js';

const TOKEN_POOL_CACHE_MS = 5 * 60 * 1000;

let tokenPoolCache = { items: [], ts: 0 };

export function invalidateOAuthTokenPoolCache() {
  tokenPoolCache = { items: [], ts: 0 };
}

function isPoolExcludedAccount(user) {
  const status = String(user?.x_account_status || '');
  return status === 'deleted' || status === 'suspended';
}

function isExpired(expiresAt) {
  const exp = expiresAt ? Date.parse(expiresAt) : NaN;
  return Number.isFinite(exp) && Date.now() >= exp;
}

function poolRank(item) {
  if (item.type === 'cookie') return 1;
  if (!item.token) return 4;
  if (item.tokenIsValid === false) return 3;
  if (isExpired(item.expiresAt)) return 2;
  return 0;
}

async function loadPoolUsers(supabase) {
  let usersRes = await supabase
    .from('users')
    .select('id, access_token, refresh_token, token_expires_at, token_is_valid, x_account_status')
    .or('access_token.not.is.null,refresh_token.not.is.null');
  if (usersRes.error) {
    usersRes = await supabase
      .from('users')
      .select('id, access_token, token_is_valid, x_account_status')
      .not('access_token', 'is', null);
  }
  if (usersRes.error) {
    usersRes = await supabase
      .from('users')
      .select('id, access_token, token_is_valid')
      .not('access_token', 'is', null)
      .or('token_is_valid.is.null,token_is_valid.eq.true');
  }
  return usersRes.data ?? [];
}

/** Credential: { type: 'bearer'|'cookie', token, userId?, authTokenId?, expiresAt?, tokenIsValid? } */
export async function getTokenPool() {
  const now = Date.now();
  if (tokenPoolCache.items.length > 0 && now - tokenPoolCache.ts < TOKEN_POOL_CACHE_MS) {
    return tokenPoolCache.items;
  }
  const items = [];
  const supabase = createSupabaseClient();
  if (supabase) {
    const users = await loadPoolUsers(supabase);
    for (const u of users) {
      if (!u?.id || isPoolExcludedAccount(u)) continue;
      const token = decryptToken(u.access_token)?.trim() || '';
      const hasRefresh = Boolean(decryptToken(u.refresh_token)?.trim());
      if (!token && !hasRefresh) continue;
      items.push({
        type: 'bearer',
        token: token || null,
        userId: u.id,
        expiresAt: u.token_expires_at || null,
        tokenIsValid: u.token_is_valid,
      });
    }
    const { data: authRows } = await supabase.from('auth_tokens').select('id, token').eq('is_active', true);
    if (authRows?.length) {
      authRows.forEach((r) => {
        const t = r.token?.trim();
        if (t) items.push({ type: 'cookie', token: t, authTokenId: r.id });
      });
    }
  }
  const raw = process.env.TWITTER_AUTH_TOKENS || '';
  raw.split(',').forEach((t) => {
    const s = t.trim();
    if (s) items.push({ type: 'cookie', token: s });
  });
  items.sort((a, b) => poolRank(a) - poolRank(b));
  tokenPoolCache = { items, ts: now };
  return items;
}

export async function refreshPoolBearer(cred) {
  if (cred?.type !== 'bearer' || !cred.userId) return null;
  const supabase = createSupabaseClient();
  if (!supabase) return null;
  let rowRes = await supabase
    .from('users')
    .select('id, access_token, refresh_token, token_expires_at, token_is_valid, x_account_status')
    .eq('id', cred.userId)
    .maybeSingle();
  if (rowRes.error) {
    rowRes = await supabase
      .from('users')
      .select('id, access_token, token_is_valid')
      .eq('id', cred.userId)
      .maybeSingle();
  }
  const user = rowRes.data;
  if (!user || isPoolExcludedAccount(user)) return null;
  const token = await ensureFreshUserAccessToken(supabase, user, { force: true });
  if (!token || token === cred.token) return null;
  invalidateOAuthTokenPoolCache();
  return { type: 'bearer', token, userId: cred.userId };
}

export async function markTokenInvalid(cred) {
  const supabase = createSupabaseClient();
  if (!supabase) return;
  if (cred?.userId) {
    await supabase.from('users').update({ token_is_valid: false, updated_at: new Date().toISOString() }).eq('id', cred.userId);
  }
  if (cred?.authTokenId) {
    await supabase.from('auth_tokens').update({ is_active: false }).eq('id', cred.authTokenId);
  }
  if (cred?.userId || cred?.authTokenId) {
    invalidateOAuthTokenPoolCache();
  }
}
