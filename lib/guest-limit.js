export const GUEST_LINK_LIMIT = 3;

const GUEST_COUNT_KEY = 'wbs_guest_download_count';
const GUEST_LEGACY_KEY = 'wbs_guest_analyzed';

function readCount() {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = localStorage.getItem(GUEST_COUNT_KEY);
    if (raw != null) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n >= 0) return Math.min(n, GUEST_LINK_LIMIT);
    }
    if (localStorage.getItem(GUEST_LEGACY_KEY) === '1') {
      localStorage.setItem(GUEST_COUNT_KEY, '1');
      localStorage.removeItem(GUEST_LEGACY_KEY);
      return 1;
    }
    return 0;
  } catch {
    return 0;
  }
}

export function getGuestDownloadCount() {
  return readCount();
}

export function getGuestDownloadsRemaining() {
  return Math.max(0, GUEST_LINK_LIMIT - readCount());
}

export function isGuestLimitReached() {
  return readCount() >= GUEST_LINK_LIMIT;
}

export function recordGuestDownloads(count) {
  if (typeof window === 'undefined' || !count || count <= 0) return;
  try {
    const next = Math.min(GUEST_LINK_LIMIT, readCount() + count);
    localStorage.setItem(GUEST_COUNT_KEY, String(next));
    localStorage.removeItem(GUEST_LEGACY_KEY);
  } catch (_) {}
}

export function clearGuestDownloadCount() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(GUEST_COUNT_KEY);
    localStorage.removeItem(GUEST_LEGACY_KEY);
  } catch (_) {}
}
