export async function fetchVideoBytesByUrl(urls, { signal } = {}) {
  const unique = [...new Set((urls || []).filter((url) => typeof url === 'string' && url.startsWith('http')))];
  const bytesByUrl = {};
  const chunkSize = 16;
  for (let i = 0; i < unique.length; i += chunkSize) {
    if (signal?.aborted) break;
    const chunk = unique.slice(i, i + chunkSize);
    try {
      const res = await fetch('/api/download/sizes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ urls: chunk }),
        signal,
      });
      const data = await res.json().catch(() => ({}));
      const map = data.bytesByUrl && typeof data.bytesByUrl === 'object' ? data.bytesByUrl : {};
      for (const url of chunk) {
        const size = map[url];
        bytesByUrl[url] = typeof size === 'number' && size > 0 ? size : 0;
      }
    } catch {
      if (signal?.aborted) break;
      for (const url of chunk) bytesByUrl[url] = 0;
    }
  }
  return bytesByUrl;
}
