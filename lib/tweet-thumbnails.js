/** Tweet status ID ve link başına thumbnail yönetimi (toplu analiz dahil). */

export const TWEET_STATUS_ID_REGEX = /\/status\/(\d+)/i;

export function getTweetStatusId(url) {
  const m = String(url || '').match(TWEET_STATUS_ID_REGEX);
  return m ? m[1] : null;
}

export function isHttpThumbnail(value) {
  return typeof value === 'string' && value.startsWith('http');
}

export function buildResultsByStatusId(results) {
  const map = new Map();
  if (!Array.isArray(results)) return map;
  for (const result of results) {
    const statusId = getTweetStatusId(result?.tweetUrl);
    if (statusId) map.set(statusId, result);
  }
  return map;
}

export function findResultForUrl(url, results) {
  const statusId = getTweetStatusId(url);
  if (!statusId || !Array.isArray(results)) return null;
  return results.find((r) => getTweetStatusId(r?.tweetUrl) === statusId) ?? null;
}

/**
 * Bir link için thumbnail: önce analiz sonucu, sonra statusId cache.
 * Her link kendi statusId anahtarıyla eşleşir; karışma olmaz.
 */
export function dedupeLinksByStatusId(urls) {
  const byId = new Map();
  for (const url of urls || []) {
    const statusId = getTweetStatusId(url);
    if (statusId && !byId.has(statusId)) byId.set(statusId, url);
  }
  return [...byId.values()];
}

export function resolveLinkThumbnail(url, results, thumbByStatusId = {}) {
  const statusId = getTweetStatusId(url);
  if (!statusId) return null;

  const fromResult = findResultForUrl(url, results);
  if (isHttpThumbnail(fromResult?.thumbnail)) return fromResult.thumbnail;

  const cached = thumbByStatusId[statusId];
  if (isHttpThumbnail(cached)) return cached;

  return null;
}

export function setThumbnailForStatusId(prev, statusId, thumbnail) {
  if (!statusId || !isHttpThumbnail(thumbnail)) return prev;
  if (prev[statusId] === thumbnail) return prev;
  return { ...prev, [statusId]: thumbnail };
}

export function mergeResultThumbnailsIntoCache(prev, results) {
  let next = prev;
  if (!Array.isArray(results)) return next;
  for (const result of results) {
    const statusId = getTweetStatusId(result?.tweetUrl);
    if (statusId && isHttpThumbnail(result?.thumbnail)) {
      next = setThumbnailForStatusId(next, statusId, result.thumbnail);
    }
  }
  return next;
}

export function pruneThumbnailCacheForLinks(prev, links) {
  const activeIds = new Set((links || []).map(getTweetStatusId).filter(Boolean));
  const next = {};
  for (const [id, thumb] of Object.entries(prev || {})) {
    if (activeIds.has(id)) next[id] = thumb;
  }
  if (Object.keys(next).length === Object.keys(prev || {}).length) {
    let same = true;
    for (const id of Object.keys(prev || {})) {
      if (next[id] !== prev[id]) {
        same = false;
        break;
      }
    }
    if (same) return prev;
  }
  return next;
}

export function pruneResultsForLinks(results, links) {
  if (!Array.isArray(results) || results.length === 0) return [];
  const activeIds = new Set((links || []).map(getTweetStatusId).filter(Boolean));
  return results.filter((r) => {
    const id = getTweetStatusId(r?.tweetUrl);
    return id && activeIds.has(id);
  });
}

export function getLinksNeedingAnalysis(links, results, { retryErrors = false } = {}) {
  const byId = buildResultsByStatusId(results);
  return (links || []).filter((url) => {
    const id = getTweetStatusId(url);
    if (!id) return true;
    const existing = byId.get(id);
    if (!existing) return true;
    if (retryErrors && existing.status === 'error') return true;
    return false;
  });
}

export function mergeAnalysisResults(existingResults, newResults, links) {
  const byId = buildResultsByStatusId(existingResults);
  for (const r of newResults || []) {
    const id = getTweetStatusId(r?.tweetUrl);
    if (id) byId.set(id, r);
  }
  const ordered = [];
  const seen = new Set();
  for (const url of links || []) {
    const id = getTweetStatusId(url);
    if (id && byId.has(id) && !seen.has(id)) {
      ordered.push(byId.get(id));
      seen.add(id);
    }
  }
  return ordered;
}

export const THUMBNAIL_FETCH_DELAY_MS = 150;

export async function fetchThumbnailFromApi(url, statusId) {
  if (!url || !statusId) return null;
  try {
    const params = new URLSearchParams({
      url: String(url),
      id: String(statusId),
    });
    const res = await fetch(`/api/thumbnail?${params}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    const data = await res.json().catch(() => null);
    return isHttpThumbnail(data?.thumbnail) ? data.thumbnail : null;
  } catch {
    return null;
  }
}

/**
 * Her link için ayrı thumbnail isteği (tek link ile aynı mantık).
 * @param {string[]} links
 * @param {{ results?: object[], onThumbnail: (statusId: string, thumbnail: string) => void, shouldCancel?: () => boolean }} options
 */
export async function fetchThumbnailsForLinks(links, { results = [], onThumbnail, shouldCancel } = {}) {
  if (!Array.isArray(links) || links.length === 0 || typeof onThumbnail !== 'function') return;

  const seenIds = new Set();
  for (let i = 0; i < links.length; i++) {
    if (shouldCancel?.()) return;

    const url = links[i];
    const statusId = getTweetStatusId(url);
    if (!statusId || seenIds.has(statusId)) continue;
    seenIds.add(statusId);

    const fromResult = findResultForUrl(url, results);
    if (isHttpThumbnail(fromResult?.thumbnail)) {
      onThumbnail(statusId, fromResult.thumbnail);
      continue;
    }

    const thumbnail = await fetchThumbnailFromApi(url, statusId);
    if (shouldCancel?.()) return;
    if (thumbnail) onThumbnail(statusId, thumbnail);

    if (i < links.length - 1) {
      await new Promise((r) => setTimeout(r, THUMBNAIL_FETCH_DELAY_MS));
    }
  }
}
