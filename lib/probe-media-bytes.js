const ALLOWED_HOSTS = [
  'video.twimg.com',
  'pbs.twimg.com',
  'abs.twimg.com',
  'twimg.com',
  'cdn.video.pscp.tv',
  'v.redd.it',
  'i.redd.it',
];

export function isAllowedVideoUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const host = u.hostname.toLowerCase();
    if (host.includes('twimg.com')) return true;
    return ALLOWED_HOSTS.some((h) => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

function parseBytesFromHeaders(res) {
  const range = res.headers.get('content-range');
  const fromRange = range && /\/(\d+)\s*$/.exec(range);
  if (fromRange) {
    const n = Number(fromRange[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const length = Number(res.headers.get('content-length'));
  if (Number.isFinite(length) && length > 1) return length;
  return 0;
}

async function cancelBody(res) {
  try {
    await res.body?.cancel?.();
  } catch {
    /* ignore */
  }
}

const PROBE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: '*/*',
  Referer: 'https://x.com/',
};

export async function probeRemoteMediaBytes(videoUrl) {
  if (!isAllowedVideoUrl(videoUrl)) return 0;
  try {
    const head = await fetch(videoUrl, {
      method: 'HEAD',
      headers: PROBE_HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    const fromHead = parseBytesFromHeaders(head);
    await cancelBody(head);
    if (fromHead > 0) return fromHead;
  } catch {
    /* Range GET */
  }
  try {
    const res = await fetch(videoUrl, {
      method: 'GET',
      headers: { ...PROBE_HEADERS, Range: 'bytes=0-0' },
      signal: AbortSignal.timeout(8000),
    });
    await cancelBody(res);
    return parseBytesFromHeaders(res);
  } catch {
    return 0;
  }
}

export async function probeRemoteMediaBytesMany(urls, { concurrency = 8 } = {}) {
  const list = Array.isArray(urls) ? urls : [];
  if (list.length === 0) return [];
  const out = new Array(list.length);
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const index = next;
      next += 1;
      out[index] = await probeRemoteMediaBytes(list[index]);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, list.length) }, () => worker());
  await Promise.all(workers);
  return out;
}
