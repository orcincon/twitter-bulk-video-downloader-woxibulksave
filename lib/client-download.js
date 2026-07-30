/**
 * Tarayıcıda medya indirme: önce doğrudan CDN, gerekirse Vercel proxy.
 */

export function buildProxyDownloadUrl(mediaUrl, filename, origin) {
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/api/download/file?url=${encodeURIComponent(mediaUrl)}&filename=${encodeURIComponent(filename)}`;
}

function clickAnchor(href, filename, { target } = {}) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.rel = 'noopener noreferrer';
  a.referrerPolicy = 'no-referrer';
  if (target) a.target = target;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function downloadBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  clickAnchor(objectUrl, filename);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

async function isDirectMediaAccessible(mediaUrl) {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5000);
    const res = await fetch(mediaUrl, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      referrerPolicy: 'no-referrer',
      mode: 'cors',
      signal: controller.signal,
    });
    window.clearTimeout(timer);
    return res.ok || res.status === 206;
  } catch {
    return false;
  }
}

/** Tek dosya: önce doğrudan CDN; CORS engellerse yine CDN linki, ZIP için proxy. */
export async function downloadMediaInBrowser(mediaUrl, filename, origin) {
  if (typeof window === 'undefined') return;

  if (await isDirectMediaAccessible(mediaUrl)) {
    const res = await fetch(mediaUrl, { referrerPolicy: 'no-referrer', mode: 'cors' });
    if (res.ok) {
      downloadBlob(await res.blob(), filename);
      return;
    }
  }

  clickAnchor(mediaUrl, filename, { target: '_blank' });
}

/** ZIP vb. için blob: önce doğrudan, olmazsa proxy. */
export async function fetchMediaBlob(mediaUrl, filename, origin) {
  if (await isDirectMediaAccessible(mediaUrl)) {
    const res = await fetch(mediaUrl, { referrerPolicy: 'no-referrer', mode: 'cors' });
    if (res.ok) return res.blob();
  }

  const proxyUrl = buildProxyDownloadUrl(mediaUrl, filename, origin);
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error('Download failed');
  return res.blob();
}

export async function handleMediaDownloadClick(e, { url, filename, origin, onBefore }) {
  e.preventDefault();
  onBefore?.(e);
  await downloadMediaInBrowser(url, filename, origin);
}
