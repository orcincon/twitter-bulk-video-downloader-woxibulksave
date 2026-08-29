import { createSupabaseClient } from './supabase.js';
import { ensureFreshUserAccessToken } from './twitter-oauth-refresh.js';

const TOKEN_POOL_CACHE_MS = 5 * 60 * 1000;
const REFRESH_CONCURRENCY = 4;

let tokenPoolCache = { items: [], ts: 0 };

export function invalidateOAuthTokenPoolCache() {
  tokenPoolCache = { items: [], ts: 0 };
}

async function mapWithConcurrency(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index]);
    }
  }
  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: items.length ? workers : 0 }, () => worker()));
  return out;
}

function isPoolExcludedAccount(user) {
  const status = String(user?.x_account_status || '');
  return status === 'deleted' || status === 'suspended';
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

/** Credential: { type: 'bearer'|'cookie', token, userId?, authTokenId? } */
export async function getTokenPool() {
  const now = Date.now();
  if (tokenPoolCache.items.length > 0 && now - tokenPoolCache.ts < TOKEN_POOL_CACHE_MS) {
    return tokenPoolCache.items;
  }
  const items = [];
  const supabase = createSupabaseClient();
  if (supabase) {
    const users = await loadPoolUsers(supabase);
    const eligible = users.filter((u) => u?.id && !isPoolExcludedAccount(u));
    const tokens = await mapWithConcurrency(eligible, REFRESH_CONCURRENCY, async (u) => {
      const token = await ensureFreshUserAccessToken(supabase, u);
      return token ? { type: 'bearer', token, userId: u.id } : null;
    });
    for (const item of tokens) {
      if (item) items.push(item);
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
