'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import MetadataIcons from './MetadataIcons.js';
import { buildDownloadFileName, buildZipFileName } from '@/lib/download-filename.js';
import { downloadMediaInBrowser, fetchMediaBlob, handleMediaDownloadClick } from '@/lib/client-download.js';
import {
  clearGuestDownloadCount,
  isGuestLimitReached,
  recordGuestDownloads,
} from '@/lib/guest-limit.js';

import {
  buildResultsByStatusId,
  dedupeLinksByStatusId,
  getLinksNeedingAnalysis,
  getTweetStatusId,
  mergeAnalysisResults,
  pruneResultsForLinks,
} from '@/lib/tweet-thumbnails.js';
import { collapseDistinctVideos } from '@/lib/tweet-media.js';

const SignInToast = dynamic(() => import('./SignInToast.js'), { ssr: false });
const getStatusId = getTweetStatusId;

const BULK_THUMB_FETCH_GAP_MS = 200;

function isValidThumbUrl(value) {
  return typeof value === 'string' && value.startsWith('http');
}

function mergeBulkThumbnailMaps(prev, patch) {
  if (!patch || typeof patch !== 'object') return prev;
  let changed = false;
  const next = { ...prev };
  for (const [statusId, thumbnail] of Object.entries(patch)) {
    if (!statusId || !isValidThumbUrl(thumbnail)) continue;
    if (next[statusId] !== thumbnail) {
      next[statusId] = thumbnail;
      changed = true;
    }
  }
  return changed ? next : prev;
}

function getBulkLinkThumbnail(url, thumbnailMap) {
  const statusId = getTweetStatusId(url);
  if (!statusId) return null;
  const cached = thumbnailMap?.[statusId];
  return isValidThumbUrl(cached) ? cached : null;
}

async function fetchBulkThumbnailForLink(url, statusId) {
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
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data || String(data.id) !== String(statusId)) return null;
    return isValidThumbUrl(data.thumbnail) ? data.thumbnail : null;
  } catch {
    return null;
  }
}

const TWITTER_URL_PATTERN = /https?:\/\/(?:www\.|mobile\.)?(?:x\.com|twitter\.com)\/(?:(?!https?:\/\/)[^\s])*/gi;

const SAMPLE_LINK = 'https://x.com/gunde5_com/status/2079477455601987829?s=20';

const TRAILING_CHARS = /[)\]\}\"'\`.,;:!?>\s]+$/;
const LEADING_CHARS = /^[(\[\{\"'\`\s]+/;

function isValidTwitterUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const t = url.trim().replace(/\/$/, '').split('?')[0];
  return t.length >= 25 && /^https?:\/\/(?:www\.|mobile\.)?(?:x\.com|twitter\.com)\/[^/]+\/status\/\d+/i.test(t);
}

function cleanExtractedUrl(raw) {
  let s = String(raw || '').trim();
  s = s.replace(TRAILING_CHARS, '').replace(LEADING_CHARS, '');
  s = s.replace(/\/+$/, '').split('?')[0];
  return s.trim();
}

function extractTwitterUrls(text) {
  if (!text || typeof text !== 'string') return [];
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const matches = normalized.match(TWITTER_URL_PATTERN) || [];
  const cleaned = matches
    .map((u) => cleanExtractedUrl(u))
    .filter(isValidTwitterUrl);
  return dedupeLinksByStatusId([...new Set(cleaned)]);
}

const themeResultStyles = {
  dark: 'bg-white border-[#1d9bf0]/30 shadow-sm',
  blue: 'bg-white border-[#1d9bf0]/30 shadow-sm',
  ocean: 'bg-white border-[#1d9bf0]/30 shadow-sm',
};

const themeInputStyles = {
  dark:
    'bg-white border-2 border-gray-300 text-gray-900 placeholder:text-gray-500 focus:border-[#1d9bf0] focus:ring-2 focus:ring-[#1d9bf0]/30 focus:shadow-[0_0_0_3px_rgba(29,155,240,0.25)] shadow-sm',
  blue:
    'bg-white border-2 border-[#1d9bf0]/50 text-gray-900 placeholder:text-gray-500 focus:border-[#1d9bf0] focus:ring-2 focus:ring-[#1d9bf0]/30 focus:shadow-[0_0_0_3px_rgba(29,155,240,0.25)] shadow-md',
  ocean:
    'bg-white border-2 border-gray-300 text-gray-900 placeholder:text-gray-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200 focus:shadow-[0_0_0_3px_rgba(34,211,238,0.2)] shadow-sm',
};

const themeCardStyles = {
  dark: 'bg-white border-[#1d9bf0]/30 hover:bg-gray-50 shadow-md',
  blue: 'bg-white border-[#1d9bf0]/30 hover:bg-gray-50 shadow-md',
  ocean: 'bg-white border-[#1d9bf0]/30 hover:bg-gray-50 shadow-md',
};

const themeRemoveStyles = {
  dark: 'text-gray-600 hover:text-red-600 hover:bg-red-50',
  blue: 'text-gray-600 hover:text-red-600 hover:bg-red-50',
  ocean: 'text-gray-600 hover:text-red-600 hover:bg-red-50',
};

const themeVideoCardStyles = {
  dark: 'bg-white border-[#1d9bf0]/30 rounded-xl shadow-md hover:shadow-lg transition-all',
  blue: 'bg-white border-[#1d9bf0]/30 rounded-xl shadow-md hover:shadow-lg transition-all',
  ocean: 'bg-white border-[#1d9bf0]/30 rounded-xl shadow-md hover:shadow-lg transition-all',
};

export default function BulkDownloadSection({
  theme = 'dark',
  accentClass,
  ui = {},
  lang = 'en',
  layout = null,
  isLoggedIn = false,
  initialLogId = null,
  variant = 'default',
}) {
  const common = layout?.common || {};
  const [rawText, setRawText] = useState('');
  const [links, setLinks] = useState([]);
  const [bulkThumbnails, setBulkThumbnails] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [downloadNotice, setDownloadNotice] = useState(null);
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [saveHistoryMessage, setSaveHistoryMessage] = useState(null);
  const [signInToast, setSignInToast] = useState(null); // null | 'limit' | 'multi'
  const [analyzeRequested, setAnalyzeRequested] = useState(false);
  const [showPasteLinksModal, setShowPasteLinksModal] = useState(false);
  const [pasteLinksModalReason, setPasteLinksModalReason] = useState('no_links'); // 'no_links' | 'no_media' | 'analyzing'
  const [pendingDownload, setPendingDownload] = useState(null); // null | { type: 'quality', mode } | { type: 'zip' }
  const [activeDownload, setActiveDownload] = useState(null); // null | { type: 'quality', mode } | { type: 'zip' }
  const requestInProgress = useRef(false);
  const lastSavedKeyRef = useRef('');
  const prevLinksKeyRef = useRef('');
  const downloadedPostKeysRef = useRef(new Set());
  const bulkThumbnailsRef = useRef({});
  bulkThumbnailsRef.current = bulkThumbnails;

  const pasteLinksModalTextDefault = lang === 'tr' ? 'Lütfen önce Twitter/X gönderi linklerini yapıştırın.' : lang === 'de' ? 'Bitte fügen Sie zuerst Twitter/X-Beitragslinks ein.' : lang === 'es' ? 'Por favor, pegue primero los enlaces de publicaciones de Twitter/X.' : 'Please paste Twitter/X post links first.';
  const noDownloadableMediaModalTextDefault = lang === 'tr' ? 'Bu gönderilerde kaydedilebilir medya bulunamadı. Kayıt henüz tamamlanmamış olabilir veya gönderilerde video/görsel yoktur.' : lang === 'de' ? 'In diesen Beiträgen wurde kein speicherbares Medium gefunden. Das Speichern läuft möglicherweise noch oder die Beiträge enthalten keine Videos/Bilder.' : lang === 'es' ? 'No se encontró contenido guardable en estas publicaciones. El guardado puede seguir en curso o las publicaciones no contienen vídeo/imagen.' : 'No saveable media found in these posts. Save may still be in progress or the posts may not contain video/images.';
  const analyzingModalTextDefault = lang === 'tr' ? 'Kayıt devam ediyor. Lütfen birkaç saniye bekleyip tekrar deneyin.' : lang === 'de' ? 'Das Speichern läuft noch. Bitte warten Sie einige Sekunden und versuchen Sie es erneut.' : lang === 'es' ? 'El guardado sigue en curso. Espere unos segundos e inténtelo de nuevo.' : 'Save is still in progress. Please wait a few seconds and try again.';
  const pasteLinksModalText =
    pasteLinksModalReason === 'analyzing'
      ? (common.analyzingModalText || analyzingModalTextDefault)
      : pasteLinksModalReason === 'no_media'
        ? (common.noDownloadableMediaModalText || noDownloadableMediaModalTextDefault)
        : (common.pasteLinksModalText || pasteLinksModalTextDefault);

  useEffect(() => {
    if (isLoggedIn && typeof window !== 'undefined') {
      clearGuestDownloadCount();
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (!links.length || typeof window === 'undefined') return;

    let cancelled = false;

    (async () => {
      for (let i = 0; i < links.length; i++) {
        if (cancelled) return;

        const url = links[i];
        const statusId = getTweetStatusId(url);
        if (!statusId) continue;

        if (isValidThumbUrl(bulkThumbnailsRef.current[statusId])) continue;

        const thumbnail = await fetchBulkThumbnailForLink(url, statusId);
        if (cancelled) return;
        if (thumbnail) {
          setBulkThumbnails((prev) => mergeBulkThumbnailMaps(prev, { [statusId]: thumbnail }));
        }

        if (i < links.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, BULK_THUMB_FETCH_GAP_MS));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [links.join('|')]);

  useEffect(() => {
    const activeIds = new Set(links.map(getTweetStatusId).filter(Boolean));
    setBulkThumbnails((prev) => {
      const next = {};
      for (const [statusId, thumbnail] of Object.entries(prev)) {
        if (activeIds.has(statusId)) next[statusId] = thumbnail;
      }
      if (Object.keys(next).length === Object.keys(prev).length) return prev;
      return next;
    });
  }, [links.join('|')]);

  useEffect(() => {
    setResults((prev) => {
      const pruned = pruneResultsForLinks(prev, links);
      return pruned.length === prev.length ? prev : pruned;
    });
  }, [links.join('|')]);

  useEffect(() => {
    if (!initialLogId || typeof window === 'undefined') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/analysis-history?logId=${encodeURIComponent(initialLogId)}`, { credentials: 'include' });
        const data = await res.json();
        if (cancelled) return;
        const log = data?.log;
        if (log && Array.isArray(log.urls) && log.urls.length > 0) {
          const text = log.urls.join('\n');
          setRawText(text);
          setLinks(dedupeLinksByStatusId(log.urls));
          setError(null);
          if (Array.isArray(log.results_json) && log.results_json.length > 0) {
            setResults(log.results_json);
          }
        }
      } catch (_) {
        if (!cancelled) setError(ui.loadLogFailed || 'Geçmiş yüklenemedi.');
      }
    })();
    return () => { cancelled = true; };
  }, [initialLogId, ui.loadLogFailed]);

  const placeholder = ui.placeholder || 'Paste Twitter/X video URLs here...';
  const removeLabel = ui.remove || 'Remove';
  const downloadTemplate = ui.downloadCount || 'Download {n} Videos Now';
  const processingLabel = ui.processing || 'Processing...';
  const videoNotFoundLabel = ui.videoNotFound || 'Video Not Found';
  const videoNotFoundFriendly = ui.videoNotFoundFriendly || 'No video found. Please check if this tweet contains a video — text-only tweets cannot be downloaded.';
  const rateLimitMessage = ui.rateLimitMessage || 'System is briefly busy. Please try again in 2 seconds.';
  const downloadVideoLabel = ui.downloadVideo || 'HD';
  const linkExpiredLabel = ui.linkExpired || 'Download link expired, please retry';
  const downloadAllLabel = ui.downloadAll || 'Download All Videos';
  const downloadingLabel = ui.downloading || 'Downloading...';
  const clearAndNewLabel = ui.clearAndNew || 'Clear & Search New';
  const zipOptionLabel = ui.zipOption || 'Bulk (ZIP)';
  const browserPermissionHint = ui.browserPermissionHint || (lang === 'tr' ? 'Sıralı kayıtta tarayıcı izni gerekebilir.' : lang === 'de' ? 'Bei sequenziellem Speichern kann eine Browsererlaubnis erforderlich sein.' : lang === 'es' ? 'El guardado secuencial puede requerir permiso del navegador.' : 'Sequential save may require browser permission.');
  const buttonsBusy = isBulkDownloading || (isProcessing && !!pendingDownload);
  const alreadyDownloadedLabel =
    lang === 'tr'
      ? 'Bu videoyu bu oturumda daha önce indirdiniz.'
      : lang === 'de'
        ? 'Sie haben dieses Video in dieser Sitzung bereits heruntergeladen.'
        : lang === 'es'
          ? 'Ya descargaste este video en esta sesión.'
          : 'You already downloaded this video in this session.';

  const getDownloadKey = useCallback((video) => {
    if (video?.url && typeof video.url === 'string') return `media:${video.url}`;
    const statusId = getStatusId(video?.tweetUrl);
    return statusId ? `post:${statusId}` : 'unknown';
  }, []);

  const filterNewDownloads = useCallback(
    (videos) => {
      const fresh = videos.filter((video) => !downloadedPostKeysRef.current.has(getDownloadKey(video)));
      if (fresh.length < videos.length) setDownloadNotice(alreadyDownloadedLabel);
      else setDownloadNotice(null);
      return fresh;
    },
    [alreadyDownloadedLabel, getDownloadKey]
  );

  const markDownloaded = useCallback(
    (video) => {
      downloadedPostKeysRef.current.add(getDownloadKey(video));
    },
    [getDownloadKey]
  );

  const bulkSignInRequiredLabel =
    common.guestBulkInlineMessage ||
    (lang === 'tr'
      ? 'Toplu kayıt yapabilmeniz için X girişi yapmanız gerekiyor.'
      : lang === 'de'
        ? 'X-Anmeldung erforderlich'
        : lang === 'es'
          ? 'Se requiere inicio de sesión con X'
          : 'X sign-in required');
  const isBulkGuest = !isLoggedIn && links.length > 1;

  const getLinkErrorLabel = useCallback(
    (result) => {
      if (isBulkGuest && analyzeRequested) return bulkSignInRequiredLabel;
      if (!result) {
        if (isProcessing) return processingLabel;
        if (!analyzeRequested) return null;
        return videoNotFoundLabel;
      }
      if (result.status === 'error') return result.error || videoNotFoundLabel;
      return null;
    },
    [isBulkGuest, analyzeRequested, bulkSignInRequiredLabel, isProcessing, processingLabel, videoNotFoundLabel, isLoggedIn]
  );

  const promptGuestSignIn = useCallback((variant) => {
    setSignInToast(variant);
    setIsProcessing(false);
    requestInProgress.current = false;
  }, []);

  const handleDownload = useCallback(async ({ showSignInToast = false, retryErrors = false } = {}) => {
    if (links.length === 0 || isProcessing || requestInProgress.current) return;
    if (!isLoggedIn && typeof window !== 'undefined') {
      if (links.length > 1) {
        setError(bulkSignInRequiredLabel);
        if (showSignInToast) promptGuestSignIn('multi');
        return;
      }
    }

    const linksToAnalyze = getLinksNeedingAnalysis(links, results, { retryErrors });
    if (linksToAnalyze.length === 0) return;

    requestInProgress.current = true;
    setIsProcessing(true);
    setError(null);

    await new Promise((r) => setTimeout(r, 200));

    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify({ urls: linksToAnalyze }),
        cache: 'no-store',
        credentials: 'include',
      });
      const data = await res.json();

      if (!res.ok) {
        const err = data?.error || 'Request failed';
        setError(err === 'RATE_LIMIT' || String(err).includes('429') || String(err).toLowerCase().includes('rate limit') ? rateLimitMessage : err);
        return;
      }

      if (data.success && Array.isArray(data.results)) {
        const hasRateLimit = data.results.some((r) => r.error === 'RATE_LIMIT');
        const failedResults = data.results.filter((r) => r.status === 'error');
        const hasSuccess = data.results.some((r) => r.status === 'success' && r.videos?.length > 0);
        const mergedResults = mergeAnalysisResults(results, data.results, links);
        if (hasRateLimit) {
          setError(rateLimitMessage);
        } else if (!hasSuccess && failedResults.length > 0) {
          const allFailed = getLinksNeedingAnalysis(links, mergedResults, { retryErrors: false }).length === links.length;
          if (allFailed) {
            setError(
              !isLoggedIn && links.length > 1
                ? bulkSignInRequiredLabel
                : failedResults[0]?.error || videoNotFoundFriendly
            );
          }
        }
        setResults(mergedResults);
        if (hasSuccess) {
          if (isLoggedIn) setSaveHistoryMessage(null);
          const saveKey = links.map(getStatusId).filter(Boolean).sort().join(',');
          if (!saveKey || lastSavedKeyRef.current !== saveKey) {
            if (saveKey) lastSavedKeyRef.current = saveKey;
            try {
              const payload = {
                urls: links,
                results: mergedResults,
                language: (lang || 'en').toUpperCase().slice(0, 2),
              };
              const saveRes = await fetch('/api/analysis-history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                credentials: 'include',
              });
              const errData = await saveRes.json().catch(() => ({}));
              if (saveRes.ok) {
                if (isLoggedIn) {
                  setSaveHistoryMessage(common.saveHistorySuccess || ui.saveHistorySuccess || 'Arşive eklendi.');
                }
              } else {
                if (saveKey && lastSavedKeyRef.current === saveKey) lastSavedKeyRef.current = '';
                if (saveRes.status === 503) {
                  if (isLoggedIn) setSaveHistoryMessage('Supabase yapılandırılmamış.');
                } else if (isLoggedIn) {
                  const apiMsg = errData?.error || errData?.code || saveRes.statusText || `HTTP ${saveRes.status}`;
                  console.error('API hatası:', apiMsg);
                  setSaveHistoryMessage(null);
                }
              }
            } catch (err) {
              if (saveKey && lastSavedKeyRef.current === saveKey) lastSavedKeyRef.current = '';
              const msg = err?.message ?? String(err);
              console.error('API hatası:', msg);
              if (isLoggedIn) setSaveHistoryMessage(null);
            }
          }
        }
      }
    } catch (err) {
      setError(err.message || 'Network error');
    } finally {
      setIsProcessing(false);
      requestInProgress.current = false;
    }
  }, [links, results, isProcessing, rateLimitMessage, videoNotFoundFriendly, isLoggedIn, promptGuestSignIn, bulkSignInRequiredLabel, lang, common, ui]);

  const handleDownloadRef = useRef(handleDownload);
  handleDownloadRef.current = handleDownload;

  useEffect(() => {
    if (links.length === 0 || typeof window === 'undefined') return;
    if (!isLoggedIn) {
      if (links.length > 1) return;
    }

    const currentKey = links.join('|');
    const prevKey = prevLinksKeyRef.current;
    prevLinksKeyRef.current = currentKey;

    if (prevKey && currentKey !== prevKey) {
      const prevIds = new Set(prevKey.split('|').filter(Boolean));
      const currIds = new Set(currentKey.split('|').filter(Boolean));
      const onlyRemoved = currIds.size < prevIds.size && [...currIds].every((id) => prevIds.has(id));
      if (onlyRemoved) return;
    }

    const id = setTimeout(() => {
      handleDownloadRef.current({ showSignInToast: false });
    }, 800);
    return () => clearTimeout(id);
  }, [links.join('|'), isLoggedIn]);

  const handleDownloadByQualityRef = useRef(null);
  const handleDownloadAsZipRef = useRef(null);

  const getQualityBand = (v) => {
    if (v?.mediaType === 'photo') return 'photo';
    const q = String(v?.label || v?.quality || '').toLowerCase();
    if (q.includes('1080')) return '1080p';
    if (q.includes('720')) return '720p';
    if (q.includes('480')) return '480p';
    if (q.includes('360')) return '360p';
    if (q.includes('görsel') || q.includes('photo') || q.includes('image')) return 'photo';
    const num = parseInt(String(v?.quality || ''), 10);
    if (!isNaN(num)) {
      if (num >= 1080) return '1080p';
      if (num >= 720) return '720p';
      if (num >= 480) return '480p';
      if (num >= 360) return '360p';
      if (num >= 1900000) return '1080p';
      if (num >= 800000) return '720p';
      if (num >= 300000) return '480p';
      if (num >= 100000) return '360p';
      if (num > 0) return 'other';
    }
    if (q && q !== 'standard') return 'other';
    return null;
  };

  const matchesQuality = (v, mode) => mode === 'best' || getQualityBand(v) === mode;

  const collectDownloadableVideos = useCallback((mode) => {
    const successResults = results.filter((r) => r.status === 'success' && r.videos?.length > 0);
    const listVideos = (r) =>
      (r.videos || [])
        .filter((v) => v?.url && typeof v.url === 'string' && v.url.startsWith('http'))
        .map((v) => ({ ...v, tweetUrl: r.tweetUrl }));
    if (mode === 'best') {
      return successResults.flatMap((r) => collapseDistinctVideos(listVideos(r)));
    }
    const matched = successResults.flatMap((r) =>
      collapseDistinctVideos(
        (r.videos || [])
          .filter((v) => v?.url && typeof v.url === 'string' && v.url.startsWith('http') && matchesQuality(v, mode))
          .map((v) => ({ ...v, tweetUrl: r.tweetUrl }))
      )
    );
    if (matched.length > 0) return matched;
    return successResults.flatMap((r) => collapseDistinctVideos(listVideos(r)));
  }, [results]);

  const requestDownload = useCallback((payload) => {
    if (links.length === 0) {
      setPasteLinksModalReason('no_links');
      setShowPasteLinksModal(true);
      return;
    }
    if (isBulkDownloading) return;
    if (isProcessing) {
      setPendingDownload(payload);
      return;
    }
    if (!isLoggedIn) {
      if (links.length > 1) {
        promptGuestSignIn('multi');
        return;
      }
      if (payload.type === 'zip') {
        promptGuestSignIn('multi');
        return;
      }
      if (isGuestLimitReached()) {
        promptGuestSignIn('limit');
        return;
      }
    }
    const needsAnalysis = getLinksNeedingAnalysis(links, results, { retryErrors: true }).length > 0;
    if (needsAnalysis) {
      setPendingDownload(payload);
      setAnalyzeRequested(true);
      handleDownloadRef.current({ showSignInToast: false, retryErrors: true });
      return;
    }
    if (payload.type === 'quality') {
      handleDownloadByQualityRef.current?.(payload.mode);
    } else if (payload.type === 'zip') {
      handleDownloadAsZipRef.current?.();
    }
  }, [links, results, isLoggedIn, isBulkDownloading, isProcessing, promptGuestSignIn]);

  const handleGuestDownloadClick = useCallback(
    (e) => {
      e.stopPropagation();
      setError(null);
      if (isLoggedIn) return;
      if (isGuestLimitReached()) {
        e.preventDefault();
        promptGuestSignIn('limit');
        return;
      }
      recordGuestDownloads(1);
    },
    [isLoggedIn, promptGuestSignIn]
  );

  const handleDownloadByQuality = useCallback(
    async (mode) => {
      const allVideos = filterNewDownloads(collectDownloadableVideos(mode));
      if (allVideos.length === 0) {
        if (downloadNotice || collectDownloadableVideos(mode).length > 0) {
          setDownloadNotice(alreadyDownloadedLabel);
          return;
        }
        const failed = results.find((r) => r.status === 'error');
        if (failed?.error) {
          setError(failed.error);
        } else {
          setPasteLinksModalReason('no_media');
          setShowPasteLinksModal(true);
        }
        return;
      }
      setIsBulkDownloading(true);
      setActiveDownload({ type: 'quality', mode });
      setError(null);
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      try {
        for (let i = 0; i < allVideos.length; i++) {
          const v = allVideos[i];
          const ext = v.mediaType === 'photo' ? (v.ext || 'jpg') : 'mp4';
          const fname = buildDownloadFileName(ext);
          await downloadMediaInBrowser(v.url, fname, origin);
          markDownloaded(v);
          if (i < allVideos.length - 1) await new Promise((r) => setTimeout(r, 400));
        }
        if (!isLoggedIn) recordGuestDownloads(1);
      } finally {
        setIsBulkDownloading(false);
        setActiveDownload(null);
      }
    },
    [results, collectDownloadableVideos, filterNewDownloads, markDownloaded, alreadyDownloadedLabel, downloadNotice, isLoggedIn]
  );
  handleDownloadByQualityRef.current = handleDownloadByQuality;

  const handleDownloadAsZip = useCallback(async () => {
    const allVideos = filterNewDownloads(collectDownloadableVideos('best'));
    if (allVideos.length === 0) {
      if (downloadNotice || collectDownloadableVideos('best').length > 0) {
        setDownloadNotice(alreadyDownloadedLabel);
        return;
      }
      const failed = results.find((r) => r.status === 'error');
      if (failed?.error) {
        setError(failed.error);
      } else {
        setPasteLinksModalReason('no_media');
        setShowPasteLinksModal(true);
      }
      return;
    }
    setIsBulkDownloading(true);
    setActiveDownload({ type: 'zip' });
    setError(null);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      for (let i = 0; i < allVideos.length; i++) {
        const v = allVideos[i];
        const ext = v.mediaType === 'photo' ? (v.ext || 'jpg') : 'mp4';
        const fname = buildDownloadFileName(ext);
        try {
          const blob = await fetchMediaBlob(v.url, fname, origin);
          zip.file(fname, blob);
        } catch {
          /* skip failed file */
        }
        if (i < allVideos.length - 1) await new Promise((r) => setTimeout(r, 300));
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(zipBlob);
      a.download = buildZipFileName();
      a.click();
      URL.revokeObjectURL(a.href);
      allVideos.forEach(markDownloaded);
    } catch (err) {
      setError(err?.message || (common.zipDownloadFailed || (lang === 'tr' ? 'ZIP oluşturulamadı.' : lang === 'de' ? 'ZIP konnte nicht erstellt werden.' : lang === 'es' ? 'No se pudo crear el ZIP.' : 'ZIP could not be created.')));
    } finally {
      setIsBulkDownloading(false);
      setActiveDownload(null);
    }
  }, [results, collectDownloadableVideos, filterNewDownloads, markDownloaded, alreadyDownloadedLabel, downloadNotice, lang, common, videoNotFoundFriendly]);

  handleDownloadAsZipRef.current = handleDownloadAsZip;

  // Analiz biter bitmez bekleyen indirmeyi tetikle
  useEffect(() => {
    if (typeof window === 'undefined' || !pendingDownload || isProcessing) return;
    const allVideos = collectDownloadableVideos(pendingDownload.type === 'quality' ? pendingDownload.mode : 'best');
    if (allVideos.length === 0) {
      const payload = pendingDownload;
      setPendingDownload(null);
      if (links.length === 0) return;
      const failed = results.find((r) => r.status === 'error');
      if (failed?.error) {
        setError(failed.error);
      } else if (getLinksNeedingAnalysis(links, results, { retryErrors: true }).length > 0) {
        setPasteLinksModalReason('analyzing');
        setShowPasteLinksModal(true);
      } else {
        setPasteLinksModalReason('no_media');
        setShowPasteLinksModal(true);
      }
      return;
    }
    const payload = pendingDownload;
    setPendingDownload(null);
    if (payload.type === 'quality' && handleDownloadByQualityRef.current) {
      handleDownloadByQualityRef.current(payload.mode);
    } else if (payload.type === 'zip' && handleDownloadAsZipRef.current) {
      handleDownloadAsZipRef.current();
    }
  }, [pendingDownload, isProcessing, results, links, collectDownloadableVideos, videoNotFoundFriendly]);

  const extractTimeoutRef = useRef(null);
  const handleChange = useCallback((e) => {
    const text = e.target.value;
    setRawText(text);
    clearTimeout(extractTimeoutRef.current);
    extractTimeoutRef.current = setTimeout(() => {
      setAnalyzeRequested(false);
      setSignInToast(null);
      setLinks(extractTwitterUrls(text));
    }, 300);
  }, []);

  useEffect(() => () => clearTimeout(extractTimeoutRef.current), []);

  const clearAndReset = useCallback(() => {
    clearTimeout(extractTimeoutRef.current);
    extractTimeoutRef.current = null;
    prevLinksKeyRef.current = '';
    setRawText('');
    setLinks([]);
    setResults([]);
    setBulkThumbnails({});
    setError(null);
    setDownloadNotice(null);
    setSaveHistoryMessage(null);
    setAnalyzeRequested(false);
    lastSavedKeyRef.current = '';
    setSignInToast(null);
    setPendingDownload(null);
    setActiveDownload(null);
    setIsBulkDownloading(false);
  }, []);

  const removeLink = useCallback((urlToRemove) => {
    setLinks((prev) => prev.filter((u) => u !== urlToRemove));
    setRawText((prev) => {
      const escaped = urlToRemove.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return prev
        .replace(new RegExp(escaped + '\\s*\\/?', 'gi'), '')
        .replace(/\n\n+/g, '\n')
        .trim();
    });
  }, []);

  const sampleLinkLabel =
    lang === 'tr' ? 'Örnek link' : lang === 'de' ? 'Beispiellink' : lang === 'es' ? 'Enlace de ejemplo' : 'Sample link';

  const applySampleLink = useCallback(() => {
    if (isProcessing || isBulkDownloading) return;

    clearTimeout(extractTimeoutRef.current);
    extractTimeoutRef.current = null;

    const extracted = extractTwitterUrls(SAMPLE_LINK);
    const sameAsCurrent =
      links.length === extracted.length && links.every((url, index) => url === extracted[index]);

    setError(null);
    setDownloadNotice(null);
    setAnalyzeRequested(false);
    setSignInToast(null);
    setPendingDownload(null);
    setActiveDownload(null);
    setSaveHistoryMessage(null);
    lastSavedKeyRef.current = '';
    setRawText(SAMPLE_LINK);

    if (sameAsCurrent) {
      setResults([]);
      setBulkThumbnails({});
      prevLinksKeyRef.current = '';
      handleDownloadRef.current({ showSignInToast: false, retryErrors: true });
      return;
    }

    prevLinksKeyRef.current = '';
    setResults([]);
    setBulkThumbnails({});
    setLinks(extracted);
  }, [isProcessing, isBulkDownloading, links]);

  const inputClass = themeInputStyles[theme] || themeInputStyles.dark;
  const cardClass = themeCardStyles[theme] || themeCardStyles.dark;
  const removeClass = themeRemoveStyles[theme] || themeRemoveStyles.dark;
  const resultClass = themeResultStyles[theme] || themeResultStyles.dark;

  const count = links.length;
  const downloadLabel = downloadTemplate.replace('{n}', String(count));
  const successResults = results.filter((r) => r.status === 'success' && r.videos?.length > 0);

  const linkToResult = buildResultsByStatusId(results);

  const linkDisplayRows = links.flatMap((url) => {
    const statusId = getStatusId(url);
    const r = statusId ? (linkToResult.get(statusId) ?? null) : null;
    const playableVideos = collapseDistinctVideos(
      (r?.videos || []).filter(
        (v) => v?.url && typeof v.url === 'string' && v.url.startsWith('http') && v.mediaType !== 'photo'
      )
    );
    const rowCount = Math.max(1, playableVideos.length);
    return Array.from({ length: rowCount }, (_, videoIndex) => ({
      url,
      statusId,
      r,
      video: playableVideos[videoIndex] || null,
      videoIndex,
      showRemove: videoIndex === 0,
      rowKey: playableVideos[videoIndex]?.url || `${statusId || url}-${videoIndex}`,
    }));
  });

  const BAND_ORDER = ['1080p', '720p', '480p', '360p', 'photo', 'other'];
  const availableQualities = (() => {
    const bands = new Set();
    let hasAnyVideo = false;
    for (const r of successResults) {
      for (const v of r.videos || []) {
        if (!v?.url || !v.url.startsWith('http')) continue;
        hasAnyVideo = true;
        const b = getQualityBand(v);
        if (b) bands.add(b);
      }
    }
    const specific = BAND_ORDER.filter((b) => bands.has(b));
    let list = specific.length > 0 ? ['best', ...specific] : hasAnyVideo ? ['best', 'other'] : ['best'];
    if (list.length === 2 && list[1] === 'other') list = ['best'];
    return list.slice(0, 3);
  })();

  const BAND_LABELS = {
    tr: { best: 'HD', '1080p': '1080p', '720p': '720p', '480p': '480p', '360p': '360p', photo: 'Görsel', other: 'SD' },
    en: { best: 'HD', '1080p': '1080p', '720p': '720p', '480p': '480p', '360p': '360p', photo: 'Image', other: 'SD' },
    de: { best: 'HD', '1080p': '1080p', '720p': '720p', '480p': '480p', '360p': '360p', photo: 'Bild', other: 'SD' },
    es: { best: 'HD', '1080p': '1080p', '720p': '720p', '480p': '480p', '360p': '360p', photo: 'Imagen', other: 'SD' },
  };
  const getBandLabel = (b) => BAND_LABELS[lang]?.[b] || BAND_LABELS.en[b] || b;

  const isWbs = variant === 'wbs';
  const wbsPlaceholder =
    lang === 'tr'
      ? 'X/Twitter linklerini buraya yapıştırın...'
      : lang === 'de'
        ? 'X/Twitter-Links hier einfügen...'
        : lang === 'es'
          ? 'Pegue enlaces de X/Twitter aquí...'
          : 'Paste X/Twitter links here...';

  const sampleLinkButton = (
    <button
      type="button"
      onClick={applySampleLink}
      disabled={isProcessing || isBulkDownloading}
      className="text-xs sm:text-sm underline underline-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed text-[#1d9bf0] hover:text-[#1a8cd8] whitespace-nowrap"
    >
      {sampleLinkLabel}
    </button>
  );

  return (
    <section className="w-full space-y-4 sm:space-y-6">
      {isWbs ? (
        <div className="glass-input p-2.5 sm:p-3 rounded-2xl shadow-xl border border-white/20">
          <div className="flex flex-col sm:flex-row sm:items-start sm:gap-2">
            <textarea
              value={rawText}
              onChange={handleChange}
              placeholder={wbsPlaceholder}
              rows={3}
              className="w-full sm:flex-1 min-w-0 p-2 sm:p-3 bg-transparent text-slate-800 text-[11px] sm:text-sm placeholder:text-[10px] sm:placeholder:text-sm placeholder:text-slate-400 placeholder:whitespace-nowrap focus:outline-none border-none resize-none"
              aria-label="X/Twitter video linkleri"
            />
            <div className="flex justify-center sm:justify-end sm:shrink-0 sm:pt-2 sm:pr-1">
              {sampleLinkButton}
            </div>
          </div>
          {(rawText.length > 0 || links.length > 0) && (
            <div className="flex justify-end mt-2">
              <button type="button" onClick={clearAndReset} className="text-xs text-slate-500 hover:text-slate-700 underline">{clearAndNewLabel}</button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex justify-end">
            {(rawText.length > 0 || links.length > 0) && (
              <button type="button" onClick={clearAndReset} className="text-xs text-gray-600 hover:text-gray-900 underline">{clearAndNewLabel}</button>
            )}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-start sm:gap-3">
            <textarea
              value={rawText}
              onChange={handleChange}
              placeholder={placeholder}
              rows={rawText.length ? Math.min(6, Math.max(2, rawText.split('\n').length + 1)) : 1}
              className={`w-full sm:flex-1 min-w-0 px-3 sm:px-4 py-3 sm:py-3.5 rounded-xl border focus:outline-none transition-all duration-200 text-[11px] sm:text-[12px] resize-y min-h-0 whitespace-pre placeholder:text-[10px] sm:placeholder:text-[12px] placeholder:whitespace-nowrap ${inputClass}`}
              aria-label="Video URLs"
            />
            <div className="flex justify-center sm:justify-end sm:shrink-0 sm:pt-3.5 sm:pr-1">
              {sampleLinkButton}
            </div>
          </div>
        </div>
      )}

      {links.length > 0 && (
        <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
            {linkDisplayRows.map(({ url, statusId, r, video, videoIndex, showRemove, rowKey }) => {
              const previewThumb =
                (isValidThumbUrl(video?.thumbnail) && video.thumbnail) ||
                getBulkLinkThumbnail(url, bulkThumbnails) ||
                (isValidThumbUrl(r?.thumbnail) ? r.thumbnail : null);
              return (
              <div
                key={rowKey}
                className={`flex flex-nowrap items-center gap-2 sm:gap-3 rounded-lg border px-3 sm:px-4 py-2.5 sm:py-3 transition-colors overflow-hidden ${cardClass}`}
              >
                <div className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
                  {previewThumb ? (
                    <img
                      key={`${statusId}-${previewThumb}-${videoIndex}`}
                      src={previewThumb}
                      alt="WBS - X/Twitter video önizleme"
                      width={64}
                      height={64}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="text-gray-400 text-xl">🎬</span>
                  )}
                </div>
                <div className="min-w-0 flex-1 overflow-hidden flex items-center gap-2">
                  {(() => {
                    const linkLabel = getLinkErrorLabel(r);
                    if (linkLabel) {
                      return (
                        <>
                          <span
                            className={`text-[12px] flex-1 min-w-0 break-words leading-snug ${isBulkGuest || r?.status === 'error' ? 'text-amber-600' : 'text-gray-500'}`}
                            title={r?.status === 'error' && !isBulkGuest ? r?.error : undefined}
                          >
                            {linkLabel}
                          </span>
                          {showRemove && (
                          <button
                            type="button"
                            onClick={() => removeLink(url)}
                            className={`shrink-0 text-[11px] font-medium px-2.5 py-1.5 rounded-md border transition ${removeClass}`}
                            aria-label={removeLabel}
                          >
                            {removeLabel}
                          </button>
                          )}
                        </>
                      );
                    }
                    if (!r && isProcessing) {
                      return <span className="text-[12px] text-gray-500">{processingLabel}</span>;
                    }
                    if (r) {
                      return (
                        <>
                          <MetadataIcons
                            durationSec={video?.duration ?? r?.metadata?.duration}
                            likes={r?.metadata?.likes}
                            retweets={r?.metadata?.retweets}
                            views={r?.metadata?.views}
                            created_at={r?.metadata?.created_at}
                            created_timestamp={r?.metadata?.created_timestamp}
                          />
                          {showRemove && (
                          <button
                            type="button"
                            onClick={() => removeLink(url)}
                            className={`shrink-0 text-[11px] font-medium px-2.5 py-1.5 rounded-md border transition ${removeClass}`}
                            aria-label={removeLabel}
                          >
                            {removeLabel}
                          </button>
                          )}
                        </>
                      );
                    }
                    return (
                      <>
                        <span className="flex-1 min-w-0" aria-hidden />
                        {showRemove && (
                        <button
                          type="button"
                          onClick={() => removeLink(url)}
                          className={`shrink-0 text-[11px] font-medium px-2.5 py-1.5 rounded-md border transition ${removeClass}`}
                          aria-label={removeLabel}
                        >
                          {removeLabel}
                        </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
              );
            })}
        </div>
      )}

      {error && (!(error === bulkSignInRequiredLabel) || analyzeRequested) && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${
          error === rateLimitMessage || error === bulkSignInRequiredLabel
            ? 'text-amber-800 bg-amber-50 border-amber-200'
            : 'text-red-700 bg-red-50 border-red-200'
        } ${resultClass}`}>
          {error}
        </div>
      )}

      {downloadNotice && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
          {downloadNotice}
        </div>
      )}

      <SignInToast open={!!signInToast} variant={signInToast} onClose={() => setSignInToast(null)} lang={lang} layout={layout} />
      {showPasteLinksModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="paste-links-modal-title"
          onClick={() => { setShowPasteLinksModal(false); setPasteLinksModalReason('no_links'); }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full border-2 border-[#1d9bf0]/40"
          >
            <p id="paste-links-modal-title" className="text-gray-700 text-sm mb-6">{pasteLinksModalText}</p>
            <button
              type="button"
              onClick={() => { setShowPasteLinksModal(false); setPasteLinksModalReason('no_links'); }}
              className={`w-full min-h-[44px] px-5 py-2.5 rounded-lg text-sm font-semibold transition ${accentClass}`}
            >
              {common.modalOk || (lang === 'tr' ? 'Tamam' : lang === 'de' ? 'OK' : lang === 'es' ? 'Aceptar' : 'OK')}
            </button>
          </div>
        </div>
      )}

      <div className={`rounded-xl border px-3 sm:px-4 py-3 sm:py-4 ${resultClass}`}>
        <div className="flex flex-col sm:flex-row flex-wrap gap-2">
          {availableQualities.map((mode) => {
            const isBest = mode === 'best';
            const buttonText = isBest ? downloadVideoLabel : getBandLabel(mode);
            const isPendingThis = pendingDownload?.type === 'quality' && pendingDownload.mode === mode;
            const isActiveThis = activeDownload?.type === 'quality' && activeDownload.mode === mode;
            const showAnalyzing = isProcessing && isPendingThis;
            const showDownloading = isBulkDownloading && isActiveThis;
            const busyLabel = showAnalyzing ? processingLabel : showDownloading ? downloadingLabel : null;
            const displayText = busyLabel || buttonText;
            return (
            <button
              key={mode}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                requestDownload({ type: 'quality', mode });
              }}
              disabled={buttonsBusy}
              className="w-full sm:flex-1 sm:min-w-[80px] flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-3 sm:py-2 rounded-lg font-semibold text-sm transition-colors disabled:opacity-70 disabled:cursor-not-allowed bg-green-600 hover:bg-green-700 text-white touch-target"
              aria-label={displayText}
              aria-busy={!!busyLabel}
            >
              {busyLabel ? (
                <svg className="animate-spin shrink-0" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                  <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              )}
              {displayText}
            </button>
            );
          })}
          {(() => {
            const isPendingZip = pendingDownload?.type === 'zip';
            const isActiveZip = activeDownload?.type === 'zip';
            const showAnalyzingZip = isProcessing && isPendingZip;
            const showDownloadingZip = isBulkDownloading && isActiveZip;
            const busyLabelZip = showAnalyzingZip ? processingLabel : showDownloadingZip ? downloadingLabel : null;
            const displayZip = busyLabelZip || zipOptionLabel;
            return (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              requestDownload({ type: 'zip' });
            }}
            disabled={buttonsBusy}
            className="w-full sm:flex-1 sm:min-w-[80px] flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-3 sm:py-2 rounded-lg font-semibold text-sm transition-colors disabled:opacity-70 disabled:cursor-not-allowed bg-green-600 hover:bg-green-700 text-white touch-target"
            aria-label={displayZip}
            aria-busy={!!busyLabelZip}
            title={common.downloadAllAsZipTitle || (lang === 'tr' ? 'Tümünü tek ZIP dosyasında kaydet (izin penceresi çıkmaz)' : lang === 'de' ? 'Alle in einer ZIP-Datei speichern (ohne Berechtigungsabfrage)' : lang === 'es' ? 'Guardar todo en un archivo ZIP (sin solicitud de permiso)' : 'Save all in one ZIP file (no permission prompt)')}
          >
            {busyLabelZip ? (
              <svg className="animate-spin shrink-0" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            )}
            {displayZip}
          </button>
            );
          })()}
        </div>
        <p className="text-xs text-gray-500 mt-2" role="note">
          {browserPermissionHint}
        </p>
      </div>

      {successResults.some((r) => (r.videos || []).some((v) => (v.label || v.quality || '') !== 'Standard')) && (
            <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
              {successResults
                .filter((r) => (r.videos || []).some((v) => (v.label || v.quality || '') !== 'Standard'))
                .map((r) => {
                  const videosToShow = (r.videos || []).filter((v) => (v.label || v.quality || '') !== 'Standard');
                  if (videosToShow.length === 0) return null;
                  return (
                <div
                  key={r.tweetUrl}
                  className={`rounded-xl border px-3 sm:px-4 py-2 sm:py-3 ${themeVideoCardStyles[theme] || themeVideoCardStyles.dark}`}
                >
                  <div
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2"
                    onClick={(e) => e.stopPropagation()}
                    role="group"
                    aria-label="Video download options"
                  >
                    {videosToShow.map((v, i) => {
                      const hasValidHref = v?.url && typeof v.url === 'string' && v.url.startsWith('http');
                      const label = v.label || v.quality || '';
                      const ext = v.mediaType === 'photo' ? (v.ext || 'jpg') : 'mp4';
                      const fileName = buildDownloadFileName(ext);
                      return hasValidHref ? (
                        <a
                          key={i}
                          href={v.url}
                          download={fileName}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center justify-center rounded-lg px-4 py-3 sm:py-2.5 min-h-[44px] text-sm font-medium transition-colors ${accentClass}`}
                          title={v.url}
                          onClick={async (e) => {
                            const video = { ...v, tweetUrl: r.tweetUrl };
                            if (downloadedPostKeysRef.current.has(getDownloadKey(video))) {
                              e.preventDefault();
                              setDownloadNotice(alreadyDownloadedLabel);
                              return;
                            }
                            setDownloadNotice(null);
                            await handleMediaDownloadClick(e, {
                              url: v.url,
                              filename: fileName,
                              origin: typeof window !== 'undefined' ? window.location.origin : '',
                              onBefore: handleGuestDownloadClick,
                            });
                            markDownloaded(video);
                          }}
                        >
                          {downloadVideoLabel} {label}
                        </a>
                      ) : (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            console.warn('[Download] Invalid video URL from API - object:', v);
                            setError(linkExpiredLabel);
                          }}
                          disabled
                          className={`flex items-center justify-center rounded-lg px-4 py-3 sm:py-2.5 min-h-[44px] text-sm font-medium transition-colors opacity-50 cursor-not-allowed ${accentClass}`}
                        >
                          {downloadVideoLabel} {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                  );
                })}
            </div>
      )}
    </section>
  );
}
