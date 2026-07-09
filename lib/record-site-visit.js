import { buildVisitorKey, isInternalReferrer } from './visitor-stats.js';

export function sanitizeReferrer(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, 500);
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString().slice(0, 500);
  } catch {
    return null;
  }
}

/** Dış kaynak referrer'ı saklar; site içi geçişleri null yapar. */
export function normalizeReferrer(value) {
  const sanitized = sanitizeReferrer(value);
  if (!sanitized || isInternalReferrer(sanitized)) return null;
  return sanitized;
}

export function isKamikazePath(path) {
  if (!path || typeof path !== 'string') return false;
  const base = path.split('?')[0].toLowerCase();
  return base === '/kamikaze' || base.startsWith('/kamikaze/');
}

export function isKamikazeReferrer(referrer) {
  if (!referrer || typeof referrer !== 'string') return false;
  try {
    const pathname = new URL(referrer).pathname.toLowerCase();
    return pathname === '/kamikaze' || pathname.startsWith('/kamikaze/');
  } catch {
    return false;
  }
}

export function shouldSkipVisit({ path, referrer = null, kamikazeSession = false } = {}) {
  if (kamikazeSession) return true;
  if (isKamikazePath(path)) return true;
  if (typeof path === 'string' && path.startsWith('/api')) return true;
  if (isKamikazeReferrer(referrer)) return true;
  return false;
}

export function shouldSkipVisitPath(path) {
  return isKamikazePath(path) || (typeof path === 'string' && path.startsWith('/api'));
}

export function buildVisitRow({
  path = '/',
  referrer = null,
  clientIp = null,
  userAgent = null,
  userId = null,
  clientVisitorId = null,
}) {
  const safePath = typeof path === 'string' ? path.slice(0, 200) : '/';
  const visitorKey = buildVisitorKey({ userId, clientIp, clientVisitorId });
  return {
    visitor_key: visitorKey,
    client_ip: clientIp,
    user_id: userId,
    path: safePath,
    referrer: normalizeReferrer(referrer),
    user_agent: userAgent,
  };
}

/** RLS açık site_visits için yalnızca service role ile yazar (Edge middleware uyumlu). */
export async function recordSiteVisit(row) {
  const baseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!baseUrl || !serviceKey) {
    return { ok: false, error: 'NO_SERVICE_ROLE' };
  }

  try {
    const res = await fetch(`${baseUrl}/rest/v1/site_visits`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    });

    if (res.ok) {
      return { ok: true };
    }

    const body = await res.text().catch(() => '');
    if (res.status === 404 || body.includes('42P01') || body.includes('site_visits')) {
      return { ok: false, error: 'TABLE_MISSING' };
    }
    if (res.status === 401 || res.status === 403 || body.includes('42501')) {
      return { ok: false, error: 'RLS_DENIED' };
    }
    return { ok: false, error: body.slice(0, 200) || `HTTP_${res.status}` };
  } catch (err) {
    return { ok: false, error: err?.message || 'NETWORK' };
  }
}
