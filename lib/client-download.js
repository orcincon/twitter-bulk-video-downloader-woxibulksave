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

function reportProgress(onProgress, { received = 0, total = 0, percent } = {}) {
  if (typeof onProgress !== 'function') return;
  const safeReceived = Math.max(0, received || 0);
  const safeTotal = Math.max(0, total || 0);
  const computed =
    typeof percent === 'number'
      ? percent
      : safeTotal > 0
        ? (safeReceived / safeTotal) * 100
        : 0;
  onProgress({
    received: safeReceived,
    total: safeTotal,
    percent: Math.max(0, Math.min(100, Math.round(computed))),
  });
}

export async function probeMediaBytes(mediaUrl) {
  if (typeof window === 'undefined' || !mediaUrl) return 0;
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
    const range = res.headers.get('Content-Range');
    const fromRange = range && /\/(\d+)\s*$/.exec(range);
    if (fromRange) {
      const n = Number(fromRange[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch {
    /* CORS veya ağ */
  }
  return 0;
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  const err = new Error('DOWNLOAD_ABORTED');
  err.name = 'DownloadAbortedError';
  throw err;
}

export function isDownloadAborted(err) {
  return !!err && (err.name === 'DownloadAbortedError' || err.message === 'DOWNLOAD_ABORTED');
}

async function fetchBlobWithProgress(url, { onProgress, signal, ...init } = {}) {
  throwIfAborted(signal);

  const timeoutController = new AbortController();
  const combined = new AbortController();
  const forwardUserAbort = () => combined.abort();
  const forwardTimeoutAbort = () => combined.abort();

  if (signal) {
    if (signal.aborted) combined.abort();
    else signal.addEventListener('abort', forwardUserAbort);
  }

  const timer =
    typeof window !== 'undefined'
      ? window.setTimeout(() => timeoutController.abort(), 12_000)
      : null;
  timeoutController.signal.addEventListener('abort', forwardTimeoutAbort);

  let res;
  try {
    res = await fetch(url, { ...init, signal: combined.signal });
  } catch (err) {
    throwIfAborted(signal);
    if (timeoutController.signal.aborted) return null;
    throw err;
  } finally {
    if (timer) window.clearTimeout(timer);
    timeoutController.signal.removeEventListener('abort', forwardTimeoutAbort);
    signal?.removeEventListener('abort', forwardUserAbort);
  }
  if (!res.ok) return null;

  const total = Number(res.headers.get('Content-Length')) || 0;

  if (!onProgress || !res.body) {
    throwIfAborted(signal);
    try {
      const blob = await res.blob();
      throwIfAborted(signal);
      reportProgress(onProgress, { received: blob.size, total: total || blob.size, percent: 100 });
      return blob;
    } catch (err) {
      throwIfAborted(signal);
      throw err;
    }
  }

  const reader = res.body.getReader();
  const abortReader = () => {
    reader.cancel().catch(() => {});
  };
  if (signal) {
    if (signal.aborted) abortReader();
    else signal.addEventListener('abort', abortReader);
  }

  const chunks = [];
  let received = 0;
  let lastPct = -1;
  let lastEmit = 0;

  const emit = (done = false) => {
    const now = Date.now();
    const pct =
      total > 0
        ? (received / total) * 100
        : 90 * (1 - Math.exp(-received / 2_000_000));
    const rounded = done ? 100 : Math.min(99, Math.round(pct));
    if (!done && rounded === lastPct && now - lastEmit < 80) return;
    lastPct = rounded;
    lastEmit = now;
    reportProgress(onProgress, {
      received,
      total,
      percent: rounded,
    });
  };

  try {
    throwIfAborted(signal);
    emit();

    while (true) {
      throwIfAborted(signal);
      let chunk;
      try {
        chunk = await reader.read();
      } catch (err) {
        throwIfAborted(signal);
        throw err;
      }
      if (chunk.done) break;
      chunks.push(chunk.value);
      received += chunk.value.byteLength;
      emit();
    }

    throwIfAborted(signal);
    reportProgress(onProgress, { received, total: total || received, percent: 100 });
    return new Blob(chunks, { type: res.headers.get('Content-Type') || undefined });
  } finally {
    signal?.removeEventListener('abort', abortReader);
  }
}

/** Tek dosya: önce doğrudan CDN; CORS engellerse yine CDN linki, ZIP için proxy. */
export async function downloadMediaInBrowser(mediaUrl, filename, origin, { onProgress, signal } = {}) {
  if (typeof window === 'undefined') return;
  throwIfAborted(signal);

  try {
    const blob = await fetchBlobWithProgress(mediaUrl, {
      referrerPolicy: 'no-referrer',
      mode: 'cors',
      onProgress,
      signal,
    });
    throwIfAborted(signal);
    if (blob) {
      downloadBlob(blob, filename);
      reportProgress(onProgress, { received: blob.size, total: blob.size, percent: 100 });
      return blob.size;
    }
  } catch (err) {
    throwIfAborted(signal);
    if (isDownloadAborted(err)) throw err;
    /* CORS veya ağ hatası: doğrudan bağlantıya düş */
  }

  throwIfAborted(signal);
  reportProgress(onProgress, { received: 0, total: 0, percent: 100 });
  clickAnchor(mediaUrl, filename, { target: '_blank' });
  return 0;
}

/** ZIP vb. için blob: önce doğrudan, olmazsa proxy. */
export async function fetchMediaBlob(mediaUrl, filename, origin, { onProgress, signal } = {}) {
  throwIfAborted(signal);
  try {
    const blob = await fetchBlobWithProgress(mediaUrl, {
      referrerPolicy: 'no-referrer',
      mode: 'cors',
      onProgress,
      signal,
    });
    throwIfAborted(signal);
    if (blob) return blob;
  } catch (err) {
    throwIfAborted(signal);
    if (isDownloadAborted(err)) throw err;
    /* proxyye düş */
  }

  const proxyUrl = buildProxyDownloadUrl(mediaUrl, filename, origin);
  const blob = await fetchBlobWithProgress(proxyUrl, { onProgress, signal });
  throwIfAborted(signal);
  if (!blob) throw new Error('Download failed');
  return blob;
}

export async function handleMediaDownloadClick(e, { url, filename, origin, onBefore }) {
  e.preventDefault();
  onBefore?.(e);
  await downloadMediaInBrowser(url, filename, origin);
}
