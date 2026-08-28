import { isDownloadAborted } from './client-download.js';

export function createDownloadAbortedError() {
  const err = new Error('DOWNLOAD_ABORTED');
  err.name = 'DownloadAbortedError';
  return err;
}

export async function waitWhilePaused(controlRef) {
  while (controlRef.current.status === 'paused') {
    await new Promise((resolve) => {
      controlRef.current.wake = resolve;
    });
  }
}

export async function delayWithControl(ms, controlRef) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (controlRef.current.status === 'cancelled') throw createDownloadAbortedError();
    await waitWhilePaused(controlRef);
    if (controlRef.current.status === 'cancelled') throw createDownloadAbortedError();
    const remaining = end - Date.now();
    if (remaining <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(80, remaining)));
  }
}

export async function runCancellableFile(controlRef, work) {
  while (true) {
    if (controlRef.current.status === 'cancelled') throw createDownloadAbortedError();
    await waitWhilePaused(controlRef);
    if (controlRef.current.status === 'cancelled') throw createDownloadAbortedError();

    const abort = new AbortController();
    controlRef.current.abort = abort;
    if (controlRef.current.status !== 'paused' && controlRef.current.status !== 'cancelled') {
      controlRef.current.status = 'running';
    }

    try {
      return await work(abort.signal);
    } catch (err) {
      if (controlRef.current.status === 'paused') continue;
      if (controlRef.current.status === 'cancelled' || isDownloadAborted(err)) {
        throw createDownloadAbortedError();
      }
      throw err;
    }
  }
}

export function createDownloadProgressTracker(fileCount, onUpdate) {
  const fileTotals = new Array(fileCount).fill(0);
  let completedBytes = 0;
  let currentLoaded = 0;
  let currentIndex = 0;

  const publish = () => {
    const loaded = completedBytes + currentLoaded;
    const total = fileTotals.reduce((sum, n) => sum + n, 0);
    const percent =
      total > 0
        ? Math.min(99, Math.round((loaded / total) * 100))
        : loaded > 0
          ? Math.min(90, Math.round(90 * (1 - Math.exp(-loaded / 2_000_000))))
          : 1;
    onUpdate({
      loaded,
      total,
      percent: Math.max(0, Math.min(100, percent)),
      current: fileCount > 0 ? Math.min(fileCount, currentIndex + 1) : 0,
      fileCount,
    });
  };

  return {
    startFile(index) {
      currentIndex = index;
      currentLoaded = 0;
      publish();
    },
    setProbedSize(index, bytes) {
      if (bytes > 0 && bytes > fileTotals[index]) {
        fileTotals[index] = bytes;
        publish();
      }
    },
    onFileProgress(index, { received = 0, total = 0 } = {}) {
      currentIndex = index;
      currentLoaded = received;
      if (total > 0) fileTotals[index] = total;
      publish();
    },
    finishFile(index, received = 0, { failed = false } = {}) {
      const size = failed ? 0 : (received > 0 ? received : fileTotals[index] || 0);
      fileTotals[index] = size;
      completedBytes += size;
      currentLoaded = 0;
      currentIndex = index;
      publish();
    },
    complete() {
      const loaded = Math.max(completedBytes, fileTotals.reduce((sum, n) => sum + n, 0));
      onUpdate({ loaded, total: loaded, percent: 100, current: fileCount, fileCount });
    },
  };
}
