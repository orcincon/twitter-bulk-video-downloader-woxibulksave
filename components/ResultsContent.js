'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import SignInToast from './SignInToast.js';
import { buildDownloadFileName, buildZipFileName } from '@/lib/download-filename.js';
import {
  clearGuestDownloadCount,
  isGuestLimitReached,
  recordGuestDownloads,
} from '@/lib/guest-limit.js';

const STATUS_ID_REGEX = /\/status\/(\d+)/i;
function getStatusId(u) {
  const m = String(u || '').match(STATUS_ID_REGEX);
  return m ? m[1] : null;
}

export default function ResultsContent({
  initialUrls = [],
  initialLogId = null,
  lang = 'en',
  theme = 'dark',
  accentClass,
  layout = {},
  siteTheme,
  isLoggedIn = false,
}) {
  const t = layout.pages?.results || {};
  const [urls, setUrls] = useState(initialUrls);
  const [results, setResults] = useState([]);
  const [isProcessing, setIsProcessing] = useState(!!initialLogId || initialUrls.length > 0);
  const [error, setError] = useState(null);
  const [downloadMode, setDownloadMode] = useState('sequential');
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [signInToast, setSignInToast] = useState(null);
  const loadedLogIdRef = useRef(null);

  useEffect(() => {
    if (isLoggedIn) clearGuestDownloadCount();
  }, [isLoggedIn]);

  const processingLabel = t.processing || 'Analyzing...';
  const noUrlsLabel = t.noUrls || 'No URLs provided. Paste links on the home page first.';
  const backToHomeLabel = t.backToHome || '← Back to Home';
  const sequentialLabel = t.sequentialDownload || 'Sequential Download (No ZIP)';
  const zipLabel = t.downloadAsZip || 'Download All as ZIP';
  const downloadAllLabel = t.downloadAll || 'Download All';
  const thumbnailLabel = t.thumbnail || 'Preview';
  const tweetUrlLabel = t.tweetUrl || 'Tweet';
  const qualityLabel = t.quality || 'Quality';
  const downloadVideoLabel = t.downloadVideo || 'Download HD Video';
  const downloadingLabel = t.downloading || 'Downloading...';
  const clearLabel = t.clearAndNew || 'Clear & New Search';
  const browserPermissionHint = t.browserPermissionHint || 'Your browser may ask for permission to allow multiple downloads.';

  useEffect(() => {
    if (initialUrls.length > 0 && !initialLogId) setUrls(initialUrls);
  }, [initialUrls.join(','), initialLogId]);


  useEffect(() => {
    if (!isLoggedIn && initialUrls.length > 0 && !initialLogId && typeof window !== 'undefined') {
      if (initialUrls.length > 1) {
        setSignInToast('multi');
        setIsProcessing(false);
        return;
      }
      if (isGuestLimitReached()) {
        setSignInToast('limit');
        setIsProcessing(false);
        return;
      }
    }
    if (initialLogId) {
      if (loadedLogIdRef.current === initialLogId) return;
      loadedLogIdRef.current = initialLogId;
      let cancelled = false;
      (async () => {
        try {
          const res = await fetch(`/api/analysis-history?logId=${encodeURIComponent(initialLogId)}`, { credentials: 'include' });
          const data = await res.json();
          if (cancelled) return;

          const log = data?.log;
          if (log && Array.isArray(log.results_json) && log.results_json.length > 0) {
            setUrls(log.urls || []);
            setResults(log.results_json);
            if (!cancelled) setIsProcessing(false);
          } else if (log && Array.isArray(log.urls) && log.urls.length > 0) {
            setUrls(log.urls);
            const dlRes = await fetch('/api/download', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
              body: JSON.stringify({ urls: log.urls }),
              cache: 'no-store',
              credentials: 'include',
            });
            const dlData = await dlRes.json();
            if (cancelled) return;
            if (dlRes.ok && dlData?.success && Array.isArray(dlData.results)) {
              setResults(dlData.results);
            } else {
              setError(dlData?.error || 'Request failed');
            }
          } else {
            setError('Log not found');
          }
        } catch (err) {
          if (!cancelled) setError(err?.message || 'Network error');
        } finally {
          if (!cancelled) setIsProcessing(false);
        }
      })();
      return () => { cancelled = true; };
    }
    if (urls.length === 0) {
      setIsProcessing(false);
      return;
    }

    if (!isLoggedIn && typeof window !== 'undefined') {
      if (urls.length > 1) {
        setSignInToast('multi');
        setIsProcessing(false);
        return;
      }
      if (isGuestLimitReached()) {
        setSignInToast('limit');
        setIsProcessing(false);
        return;
      }
    }

    const urlsToAnalyze = urls;

    let cancelled = false;
    setIsProcessing(true);
    setError(null);
    setResults([]);

    (async () => {
      try {
        const res = await fetch('/api/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
          body: JSON.stringify({ urls: urlsToAnalyze }),
          cache: 'no-store',
          credentials: 'include',
        });
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          setError(data?.error || 'Request failed');
          return;
        }

        if (data.success && Array.isArray(data.results)) {
          setResults(data.results);
          if (!isLoggedIn && typeof window !== 'undefined') {
            const successCount = data.results.filter((r) => r.status === 'success' && r.videos?.length > 0).length;
            if (successCount > 0) recordGuestDownloads(successCount);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Network error');
      } finally {
        if (!cancelled) setIsProcessing(false);
      }
    })();

    return () => { cancelled = true; };
  }, [initialLogId, urls.join(','), isLoggedIn]);

  const successResults = results.filter((r) => r.status === 'success' && r.videos?.length > 0);
  const allVideos = successResults.flatMap((r) =>
    (r.videos || [])
      .filter((v) => v?.url && typeof v.url === 'string' && v.url.startsWith('http') && (v.label || v.quality || '') !== 'Standard')
      .map((v) => ({ ...v, tweetUrl: r.tweetUrl }))
  );

  const handleDownloadAll = useCallback(async () => {
    if (allVideos.length === 0) return;
    if (!isLoggedIn) {
      if (urls.length > 1 || downloadMode === 'zip' || successResults.length > 1) {
        setSignInToast('multi');
        return;
      }
    }
    setIsBulkDownloading(true);
    setError(null);

    if (downloadMode === 'zip') {
      try {
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        for (let i = 0; i < allVideos.length; i++) {
          const v = allVideos[i];
          const ext = v.mediaType === 'photo' ? (v.ext || 'jpg') : 'mp4';
          const fname = buildDownloadFileName(ext);
          const proxyUrl = `${window.location.origin}/api/download/file?url=${encodeURIComponent(v.url)}&filename=${encodeURIComponent(fname)}`;
          const res = await fetch(proxyUrl);
          if (res.ok) {
            const blob = await res.blob();
            zip.file(fname, blob);
          }
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(zipBlob);
        a.download = buildZipFileName();
        a.click();
        URL.revokeObjectURL(a.href);
      } catch (err) {
        setError(err?.message || 'ZIP download failed');
      }
    } else {
      for (let i = 0; i < allVideos.length; i++) {
        const v = allVideos[i];
        const ext = v.mediaType === 'photo' ? (v.ext || 'jpg') : 'mp4';
        const fname = buildDownloadFileName(ext);
        const proxyUrl = `${window.location.origin}/api/download/file?url=${encodeURIComponent(v.url)}&filename=${encodeURIComponent(fname)}`;
        window.open(proxyUrl, '_blank', 'noopener');
        if (i < allVideos.length - 1) await new Promise((r) => setTimeout(r, 800));
      }
    }
    setIsBulkDownloading(false);
  }, [allVideos, downloadMode, isLoggedIn, urls.length, successResults.length]);

  const homeHref = lang !== 'en' ? `/?lang=${lang}` : '/';

  const hasNoUrlsAndNotLoading = urls.length === 0 && !initialLogId;

  if (hasNoUrlsAndNotLoading) {
    return (
      <div className="bg-[#D1EBFF] backdrop-blur-xl border border-[#1d9bf0]/40 rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-lg">
        <h1 className="text-xl sm:text-2xl font-bold mb-2 text-gray-900">{t.title || 'Analysis Results'}</h1>
        <p className="text-gray-600 text-sm mb-6">{noUrlsLabel}</p>
        <Link href={homeHref} className={`inline-flex items-center justify-center min-h-[44px] ${accentClass} px-6 py-3 rounded-xl font-semibold text-sm transition`}>
          {backToHomeLabel}
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-[#D1EBFF] backdrop-blur-xl border border-[#1d9bf0]/40 rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-lg relative">
      <SignInToast open={!!signInToast} variant={signInToast} onClose={() => setSignInToast(null)} lang={lang} layout={layout} />
      <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center justify-between gap-4 mb-4 sm:mb-6">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold mb-1">{t.title || 'Analysis Results'}</h1>
          <p className="text-gray-600 text-sm">{t.subtitle || 'Video download options based on your analysis.'}</p>
        </div>
        <Link href={homeHref} className="text-sm text-gray-600 hover:text-gray-900 transition py-2 -my-2">
          {backToHomeLabel}
        </Link>
      </div>

      {isProcessing && (
        <div className="py-12 text-center text-gray-600">
          <p className="animate-pulse">{processingLabel}</p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-6">
          {error}
        </div>
      )}

      {!isProcessing && successResults.length > 0 && (
        <>
            <div className="rounded-xl border border-[#1d9bf0]/30 bg-white px-3 sm:px-4 py-3 sm:py-4 mb-4 sm:mb-6 space-y-3 shadow-sm">
              <p className="text-sm font-medium text-gray-700">{t.downloadOptions || 'Download Options'}</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="downloadMode"
                  value="sequential"
                  checked={downloadMode === 'sequential'}
                  onChange={() => setDownloadMode('sequential')}
                  className="w-4 h-4 accent-slate-400"
                />
                  <span className="text-sm text-gray-700">{sequentialLabel}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="downloadMode"
                  value="zip"
                  checked={downloadMode === 'zip'}
                  onChange={() => setDownloadMode('zip')}
                  className="w-4 h-4 accent-slate-400"
                />
                  <span className="text-sm text-gray-700">{zipLabel}</span>
              </label>
              <button
                type="button"
                onClick={handleDownloadAll}
                disabled={isBulkDownloading}
                className={`w-full sm:w-auto min-h-[44px] px-6 py-3 sm:py-2.5 rounded-lg font-semibold text-sm transition disabled:opacity-50 ${accentClass}`}
              >
                {isBulkDownloading ? downloadingLabel : downloadAllLabel}
              </button>
            </div>
            {downloadMode === 'sequential' && (
              <p className="text-xs text-gray-500 mt-2" role="note">
                {browserPermissionHint}
              </p>
            )}
          </div>

          {/* Mobile: card layout */}
          <div className="md:hidden space-y-3">
            {successResults.map((r) =>
              (r.videos || []).filter((v) => (v.label || v.quality || '') !== 'Standard').map((v, i) => {
                const hasUrl = v?.url && typeof v.url === 'string' && v.url.startsWith('http');
                const label = v.label || v.quality || '';
                const ext = v.mediaType === 'photo' ? (v.ext || 'jpg') : 'mp4';
                const fname = buildDownloadFileName(ext);
                const proxyUrl = hasUrl ? `/api/download/file?url=${encodeURIComponent(v.url)}&filename=${encodeURIComponent(fname)}` : '#';
                const thumbUrl = r?.thumbnail && typeof r.thumbnail === 'string' && r.thumbnail.startsWith('http') ? r.thumbnail : null;
                const rowStatusId = getStatusId(r.tweetUrl);
                return (
                  <div key={`${r.tweetUrl}-${i}`} className="rounded-xl border border-[#1d9bf0]/30 bg-white p-4 space-y-3 shadow-sm">
                    {thumbUrl ? (
                      <img key={`${rowStatusId}-${thumbUrl}`} src={thumbUrl} alt="WBS - X/Twitter video önizleme" width={320} height={180} className="w-full aspect-video object-cover rounded-lg bg-gray-100" referrerPolicy="no-referrer" />
                    ) : null}
                    <p className="text-xs text-gray-600">{qualityLabel}: {label}</p>
                    {hasUrl ? (
                      <a
                        href={proxyUrl}
                        download={fname}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center justify-center w-full min-h-[44px] px-4 py-3 rounded-lg text-sm font-medium transition ${accentClass}`}
                      >
                        {downloadVideoLabel} {label}
                      </a>
                    ) : (
                      <span className="text-gray-500 text-xs">—</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-2 text-gray-600 font-medium">{thumbnailLabel}</th>
                  <th className="text-left py-3 px-2 text-gray-600 font-medium">{qualityLabel}</th>
                  <th className="text-left py-3 px-2 text-gray-400 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {successResults.map((r) =>
                  (r.videos || []).filter((v) => (v.label || v.quality || '') !== 'Standard').map((v, i) => {
                    const hasUrl = v?.url && typeof v.url === 'string' && v.url.startsWith('http');
                    const label = v.label || v.quality || '';
                    const ext = v.mediaType === 'photo' ? (v.ext || 'jpg') : 'mp4';
                const fname = buildDownloadFileName(ext);
                    const proxyUrl = hasUrl ? `/api/download/file?url=${encodeURIComponent(v.url)}&filename=${encodeURIComponent(fname)}` : '#';
                    const thumbUrl = r?.thumbnail && typeof r.thumbnail === 'string' && r.thumbnail.startsWith('http') ? r.thumbnail : null;
                    const rowStatusId = getStatusId(r.tweetUrl);
                    return (
                      <tr key={`${r.tweetUrl}-${i}`} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="py-3 px-2">
                          <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center shrink-0">
                            {thumbUrl ? (
                              <img key={`${rowStatusId}-${thumbUrl}`} src={thumbUrl} alt="WBS - X/Twitter video önizleme" width={64} height={64} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <span className="text-gray-500 text-xs">🎬</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-2 text-gray-700">{label}</td>
                        <td className="py-3 px-2">
                          {hasUrl ? (
                            <a
                              href={proxyUrl}
                              download={fname}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`inline-block px-4 py-2 rounded-lg text-xs font-medium transition min-h-[36px] ${accentClass}`}
                            >
                              {downloadVideoLabel} {label}
                            </a>
                          ) : (
                            <span className="text-gray-500 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!isProcessing && results.length > 0 && successResults.length === 0 && !error && (
        <p className="text-gray-600 py-8 text-center max-w-md mx-auto break-words leading-snug">
          {t.videoNotFound || 'No videos found in the provided links.'}
        </p>
      )}
    </div>
  );
}
