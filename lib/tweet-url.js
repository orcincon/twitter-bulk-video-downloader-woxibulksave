const TWEET_ID_REGEX = /\/status\/(\d+)/;

export function extractTweetId(url) {
  if (typeof url !== 'string') return null;
  const m = url.match(TWEET_ID_REGEX);
  return m ? m[1] : null;
}

/** X anonim paylaşım yolu: /i/status/ veya /i/web/status/ — "i" kullanıcı adı değildir. */
export function isAnonymousTweetPath(url) {
  if (typeof url !== 'string') return false;
  return /\/i(?:\/web)?\/status\/\d+/i.test(url);
}

export function buildCanonicalTweetUrl(statusId, screenName) {
  const id = String(statusId || '').trim();
  const user = String(screenName || '').trim().replace(/^@+/, '');
  if (!id || !user || user.toLowerCase() === 'i') return null;
  return `https://x.com/${encodeURIComponent(user)}/status/${id}`;
}

export function canonicalizeTweetUrl(url, screenName) {
  if (typeof url !== 'string' || !url.trim()) return url;
  const clean = url.trim().split('?')[0].replace(/\/$/, '');
  if (!isAnonymousTweetPath(clean)) return clean;
  const statusId = extractTweetId(clean);
  const canonical = buildCanonicalTweetUrl(statusId, screenName);
  return canonical || clean;
}

export function resolveTweetDisplayUrl(url, { tweetUrl, metadata } = {}) {
  const author = metadata?.author_screen_name;
  const statusId = extractTweetId(url) || extractTweetId(tweetUrl);
  if (author && statusId) {
    const canonical = buildCanonicalTweetUrl(statusId, author);
    if (canonical) return canonical;
  }
  const fromResult = typeof tweetUrl === 'string' ? tweetUrl.trim().split('?')[0] : '';
  if (fromResult && !isAnonymousTweetPath(fromResult)) return fromResult;
  return typeof url === 'string' ? url.trim().split('?')[0] : url;
}
