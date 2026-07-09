/** Ziyaretçi anahtarı ve dönem bazlı istatistik toplama. */

import { sites } from '../wbs-config.js';

let ownSiteHostsCache = null;

function getOwnSiteHosts() {
  if (ownSiteHostsCache) return ownSiteHostsCache;
  const hosts = new Set(['localhost', '127.0.0.1']);
  for (const key of Object.keys(sites)) {
    const bare = key.toLowerCase().replace(/^www\./, '');
    hosts.add(bare);
    hosts.add(`www.${bare}`);
  }
  for (const envUrl of [process.env.NEXT_PUBLIC_SITE_URL, process.env.NEXTAUTH_URL]) {
    if (!envUrl) continue;
    try {
      const bare = new URL(envUrl).hostname.toLowerCase().replace(/^www\./, '');
      hosts.add(bare);
      hosts.add(`www.${bare}`);
    } catch {
      /* ignore */
    }
  }
  ownSiteHostsCache = hosts;
  return hosts;
}

/** Aynı site içi sayfa geçişi mi (kendi domainimiz referans olarak gelmiş). */
export function isInternalReferrer(referrer) {
  if (!referrer || typeof referrer !== 'string') return false;
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    const bare = host.replace(/^www\./, '');
    const own = getOwnSiteHosts();
    if (own.has(bare) || own.has(host)) return true;
    if (host.endsWith('.vercel.app')) return true;
    return false;
  } catch {
    return false;
  }
}

export function buildVisitorKey({ userId, clientIp, clientVisitorId }) {
  if (userId) return `user:${userId}`;
  if (clientIp) return `ip:${clientIp}`;
  if (clientVisitorId) return `cid:${clientVisitorId}`;
  return 'anon:unknown';
}

/** Referans URL'sini gösterim için kısaltır. Site içi geçişler dış kaynak sayılmaz. */
export function formatReferrerLabel(referrer) {
  if (!referrer || typeof referrer !== 'string') return 'Doğrudan / bilinmiyor';
  if (isInternalReferrer(referrer)) return 'Doğrudan / bilinmiyor';
  const trimmed = referrer.trim();
  if (!trimmed) return 'Doğrudan / bilinmiyor';
  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, '');
    const path = url.pathname === '/' ? '' : url.pathname;
    const label = `${host}${path}`;
    return label.length > 80 ? `${label.slice(0, 77)}…` : label;
  } catch {
    return trimmed.length > 80 ? `${trimmed.slice(0, 77)}…` : trimmed;
  }
}

const TZ = 'Europe/Istanbul';

function dayKeyInTz(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function startOfWeekKeyInTz(date) {
  const d = new Date(date.toLocaleString('en-US', { timeZone: TZ }));
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return dayKeyInTz(d);
}

export function bucketTimestamp(iso, granularity) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return granularity === 'week' ? startOfWeekKeyInTz(date) : dayKeyInTz(date);
}

export function formatBucketLabel(key, granularity, locale = 'tr-TR') {
  if (granularity === 'week') {
    const start = new Date(`${key}T12:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: TZ });
    return `${fmt.format(start)} – ${fmt.format(end)}`;
  }
  const date = new Date(`${key}T12:00:00`);
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }).format(date);
}

/**
 * @param {{ visitor_key: string, created_at: string }[]} rows
 * @param {'day' | 'week'} granularity
 * @param {number} bucketCount
 */
export function aggregateVisitorRows(rows, granularity, bucketCount) {
  const buckets = new Map();

  const today = new Date();
  for (let i = bucketCount - 1; i >= 0; i -= 1) {
    const ref = new Date(today);
    ref.setDate(ref.getDate() - (granularity === 'week' ? i * 7 : i));
    const key = granularity === 'week' ? startOfWeekKeyInTz(ref) : dayKeyInTz(ref);
    buckets.set(key, { period: key, uniqueVisitors: 0, totalVisits: 0, _unique: new Set() });
  }

  const allUnique = new Set();
  let totalVisits = 0;

  for (const row of rows) {
    const bucketKey = bucketTimestamp(row.created_at, granularity);
    if (!bucketKey) continue;
    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, { period: bucketKey, uniqueVisitors: 0, totalVisits: 0, _unique: new Set() });
    }
    const bucket = buckets.get(bucketKey);
    bucket.totalVisits += 1;
    bucket._unique.add(row.visitor_key);
    allUnique.add(row.visitor_key);
    totalVisits += 1;
  }

  const breakdown = [...buckets.values()]
    .sort((a, b) => b.period.localeCompare(a.period))
    .map(({ period, totalVisits: tv, _unique }) => ({
      period,
      uniqueVisitors: _unique.size,
      totalVisits: tv,
    }));

  return {
    uniqueVisitors: allUnique.size,
    totalVisits,
    breakdown,
  };
}

export function analysisLogToVisitorRow(log) {
  const created_at = log.created_at;
  if (!created_at) return null;
  if (log.user_id && log.user_id !== 'guest') {
    return { visitor_key: `user:${log.user_id}`, created_at };
  }
  if (log.client_ip) {
    return { visitor_key: `ip:${log.client_ip}`, created_at };
  }
  return null;
}
