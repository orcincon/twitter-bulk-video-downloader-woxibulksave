'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import MetadataIcons from './MetadataIcons.js';
import AuthButton from './AuthButton.js';
import ConfirmHistoryModal from './ConfirmHistoryModal.js';

const STATUS_ID_REGEX = /\/status\/(\d+)/i;

function getStatusId(u) {
  const m = String(u || '').match(STATUS_ID_REGEX);
  return m ? m[1] : null;
}

function findResultForUrl(url, results) {
  if (!Array.isArray(results) || results.length === 0) return null;
  const id = getStatusId(url);
  if (!id) return null;
  return results.find((r) => getStatusId(r?.tweetUrl) === id) ?? null;
}

const FALLBACK = {
  viewAgain: 'Tekrar Görüntüle',
  goHome: 'Ana Sayfaya Git',
  empty: 'Henüz işlem geçmişi bulunmuyor.',
  emptySub: 'Gönderi analiz ettiğinizde burada görünecektir.',
  emptyLoginHint: 'Analizlerinizi arşivinize ekleyebilmek için X kullanıcı girişi yapın.',
  backToHome: '← Ana sayfaya dön',
  loading: 'Yükleniyor...',
  deleteLabel: 'Sil',
  clearAllLabel: 'Tümünü Temizle',
  confirmClearMessage: 'Bu işlem geçmişinizi temizleyecektir, onaylıyor musunuz?',
  cancelLabel: 'İptal',
};

export default function HistoryContent({ lang = 'en', layout = {}, accentClass, theme = 'dark', isLoggedIn = false }) {
  const { status: sessionStatus } = useSession();
  const t = layout.pages?.gecmis || {};
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchedThumbs, setFetchedThumbs] = useState({});
  const [fetchedMetadata, setFetchedMetadata] = useState({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmPayload, setConfirmPayload] = useState(null);
  const [softDeletingId, setSoftDeletingId] = useState(null);
  const [softDeletingAll, setSoftDeletingAll] = useState(false);

  const viewAgainLabel = t.viewAgain || FALLBACK.viewAgain;
  const emptyLabel = t.empty || FALLBACK.empty;
  const emptySubLabel = t.emptySub || FALLBACK.emptySub;
  const emptyLoginHint = t.emptyLoginHint || FALLBACK.emptyLoginHint;
  const goHomeLabel = t.goHome || FALLBACK.goHome;
  const backToHomeLabel = t.backToHome || layout.pages?.backToHome || FALLBACK.backToHome;
  const deleteLabel = t.deleteLabel || FALLBACK.deleteLabel;
  const clearAllLabel = t.clearAllLabel || FALLBACK.clearAllLabel;
  const confirmClearMessage = t.confirmClearMessage || FALLBACK.confirmClearMessage;
  const cancelLabel = t.cancelLabel || layout.common?.cancel || FALLBACK.cancelLabel;

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/analysis-history', { credentials: 'include', cache: 'no-store' });
      const data = await res.json();
      setLogs(Array.isArray(data?.logs) ? data.logs : []);
    } catch (_) {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const authenticated = sessionStatus === 'authenticated' || (sessionStatus !== 'unauthenticated' && isLoggedIn);

  useEffect(() => {
    if (sessionStatus === 'loading') return;
    if (!authenticated) {
      setLogs([]);
      setFetchedThumbs({});
      setFetchedMetadata({});
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchLogs();
  }, [sessionStatus, authenticated, fetchLogs]);

  const openConfirmSingle = (logId) => {
    setConfirmPayload({ type: 'single', logId });
    setConfirmOpen(true);
  };

  const openConfirmAll = () => {
    setConfirmPayload({ type: 'all' });
    setConfirmOpen(true);
  };

  const closeConfirm = () => {
    setConfirmOpen(false);
    setConfirmPayload(null);
  };

  const handleConfirm = () => {
    const payload = confirmPayload;
    closeConfirm();
    if (!payload) return;
    const isAll = payload.type === 'all';
    if (isAll) setSoftDeletingAll(true);
    else setSoftDeletingId(payload.logId);
    const url = isAll ? '/api/analysis-history' : `/api/analysis-history?logId=${encodeURIComponent(payload.logId)}`;
    fetch(url, { method: 'PATCH', credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data?.ok) {
          if (isAll) setLogs([]);
          else setLogs((prev) => prev.filter((l) => l.id !== payload.logId));
        }
      })
      .finally(() => {
        setSoftDeletingAll(false);
        setSoftDeletingId(null);
      });
  };

  useEffect(() => {
    if (!logs.length) return;
    let cancelled = false;
    const fetchMissing = async () => {
      for (const log of logs) {
        if (cancelled) return;
        const results = Array.isArray(log?.results_json) ? log.results_json : [];
        const hasFromJson = results.some((r) => r?.thumbnail);
        if (hasFromJson) continue;
        const urls = Array.isArray(log?.urls) ? log.urls : [];
        const thumbs = [];
        for (let i = 0; i < urls.length; i++) {
          if (cancelled) return;
          try {
            const statusId = getStatusId(urls[i]);
            const thumbUrl = statusId
              ? `/api/thumbnail?url=${encodeURIComponent(urls[i])}&id=${encodeURIComponent(statusId)}`
              : `/api/thumbnail?url=${encodeURIComponent(urls[i])}`;
            const res = await fetch(thumbUrl, { credentials: 'include', cache: 'no-store' });
            const data = await res.json();
            thumbs.push(data?.thumbnail || null);
          } catch (_) {
            thumbs.push(null);
          }
          if (i < urls.length - 1) await new Promise((r) => setTimeout(r, 150));
        }
        if (cancelled) return;
        if (thumbs.some(Boolean)) setFetchedThumbs((prev) => ({ ...prev, [log.id]: thumbs }));
      }
    };
    fetchMissing();
    return () => { cancelled = true; };
  }, [logs]);

  useEffect(() => {
    if (!logs.length) return;
    let cancelled = false;
    const fetchMeta = async () => {
      for (const log of logs) {
        if (cancelled) return;
        const urls = Array.isArray(log?.urls) ? log.urls : [];
        const results = Array.isArray(log?.results_json) ? log.results_json : [];
        const urlToResult = new Map();
        for (const r of results) {
          const id = getStatusId(r?.tweetUrl);
          if (id) urlToResult.set(id, r);
        }
        const metaByUrl = {};
        for (let i = 0; i < urls.length; i++) {
          if (cancelled) return;
          const r = findResultForUrl(urls[i], results);
          if (r?.metadata) continue;
          try {
            const res = await fetch(`/api/tweet-metadata?url=${encodeURIComponent(urls[i])}`, { credentials: 'include' });
            const data = await res.json();
            if (data?.metadata) metaByUrl[urlNorm(urls[i])] = data.metadata;
          } catch (_) {}
          if (i < urls.length - 1) await new Promise((r) => setTimeout(r, 120));
        }
        if (cancelled) return;
        if (Object.keys(metaByUrl).length > 0) setFetchedMetadata((prev) => ({ ...prev, [log.id]: metaByUrl }));
      }
    };
    fetchMeta();
    return () => { cancelled = true; };
  }, [logs]);

  const viewAgainHref = (log) => {
    if (!log?.id) return lang !== 'en' ? `/?lang=${lang}` : '/';
    const q = new URLSearchParams({ logId: log.id });
    if (lang && lang !== 'en') q.set('lang', lang);
    return `/?${q.toString()}`;
  };

  const homeHref = lang !== 'en' ? `/?lang=${lang}` : '/';

  const urlNorm = (u) => (typeof u === 'string' ? u.trim().split('?')[0] : '');

  /** Bir kart = bir log (tek kayıt). İlk URL'in thumbnail ve metadata'sı gösterilir. */
  const buildLogCards = () => {
    return logs.map((log) => {
      const urls = Array.isArray(log?.urls) ? log.urls : [];
      const results = Array.isArray(log?.results_json) ? log.results_json : [];
      const fetched = fetchedThumbs[log.id] || [];
      const firstUrl = urls[0];
      const firstResult = firstUrl ? findResultForUrl(firstUrl, results) : (results[0] ?? null);
      const firstThumb = firstResult?.thumbnail ?? fetched[0] ?? null;
      const metaMap = fetchedMetadata[log.id] || {};
      const firstMeta = firstResult ? (firstResult?.metadata ?? metaMap[urlNorm(firstUrl)]) : null;
      return {
        key: log.id,
        log,
        thumbnail: firstThumb,
        metadata: firstMeta,
        created_at: log.created_at,
      };
    });
  };

  const logCards = buildLogCards();

  if (loading) {
    return (
      <div className="bg-[#D1EBFF] backdrop-blur-xl border border-[#1d9bf0]/40 rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-lg">
        <h1 className="text-xl sm:text-2xl font-bold mb-2 text-gray-900">{t.title || 'My History'}</h1>
        <p className="text-gray-600 text-sm mb-6">{t.subtitle}</p>
        <div className="py-12 min-h-[200px] flex items-center justify-center text-center text-gray-600 animate-pulse" aria-hidden>{t.loading || FALLBACK.loading}</div>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="bg-[#D1EBFF] backdrop-blur-xl border border-[#1d9bf0]/40 rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-lg">
        <h1 className="text-xl sm:text-2xl font-bold mb-2 text-gray-900">{t.title || 'My History'}</h1>
        <p className="text-gray-600 text-sm mb-6">{t.subtitle}</p>
        <div className="text-center py-12 border border-dashed border-gray-300 rounded-2xl">
          <p className="text-gray-600 text-sm">{emptyLabel}</p>
          <p className="text-gray-500 text-xs mt-2">{emptySubLabel}</p>
          {!authenticated && (
            <>
              <p className="text-gray-600 text-xs mt-3">{emptyLoginHint}</p>
              <div className="mt-4">
                <AuthButton accentClass={accentClass} theme={theme} signInLabel={layout.header?.signIn} signOutLabel={layout.header?.signOut} historyHref={lang && lang !== 'en' ? `/gecmis?lang=${lang}` : '/gecmis'} historyLabel={layout.header?.history} />
              </div>
            </>
          )}
          <Link href={homeHref} className={`inline-block mt-6 ${accentClass} px-6 py-3 rounded-xl font-semibold text-sm transition`}>
            {goHomeLabel}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#D1EBFF] backdrop-blur-xl border border-[#1d9bf0]/40 rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-lg">
      <h1 className="text-xl sm:text-2xl font-bold mb-2 text-gray-900">{t.title || 'Arşivim'}</h1>
      <p className="text-gray-600 text-sm mb-4">{t.subtitle}</p>

      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={openConfirmAll}
          disabled={softDeletingAll}
          className="text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-lg border border-red-200 transition disabled:opacity-50"
        >
          {softDeletingAll ? '...' : clearAllLabel}
        </button>
      </div>

      <ConfirmHistoryModal
        open={confirmOpen}
        onClose={closeConfirm}
        onConfirm={handleConfirm}
        message={confirmClearMessage}
        confirmLabel={confirmPayload?.type === 'all' ? clearAllLabel : deleteLabel}
        cancelLabel={cancelLabel}
      />

      <div className="space-y-4">
        {logCards.map((card) => (
          <div
            key={card.key}
            className="flex gap-3 p-3 sm:p-4 rounded-xl border border-[#1d9bf0]/30 bg-white hover:bg-gray-50 transition shadow-sm items-start"
          >
            {card.thumbnail ? (
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg overflow-hidden bg-gray-200 shrink-0">
                <img
                  src={card.thumbnail}
                  alt="WBS - X/Twitter video önizleme"
                  width={56}
                  height={56}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : (
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-gray-200 shrink-0 flex items-center justify-center text-gray-400 text-xl">
                🎬
              </div>
            )}
            <div className="flex-1 min-w-0 overflow-hidden">
              <MetadataIcons
                durationSec={card.metadata?.duration}
                likes={card.metadata?.likes}
                retweets={card.metadata?.retweets}
                views={card.metadata?.views}
                created_at={card.metadata?.created_at ?? card.created_at}
                created_timestamp={card.metadata?.created_timestamp}
              />
            </div>
            <div className="flex flex-row items-center gap-2 shrink-0 ml-auto">
              <Link
                href={viewAgainHref(card.log)}
                className={`flex items-center justify-center min-h-[40px] min-w-[40px] sm:min-h-[44px] sm:min-w-[44px] rounded-lg text-sm font-semibold transition ${accentClass}`}
                aria-label={viewAgainLabel}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </Link>
              <button
                type="button"
                onClick={() => openConfirmSingle(card.log.id)}
                disabled={softDeletingId === card.log.id}
                className="flex items-center justify-center min-h-[40px] px-3 sm:min-h-[44px] sm:px-4 rounded-lg text-xs sm:text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200 transition disabled:opacity-50 whitespace-nowrap"
                aria-label={deleteLabel}
              >
                {softDeletingId === card.log.id ? '...' : deleteLabel}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <Link href={homeHref} className="text-sm text-gray-600 hover:text-gray-900 transition">
          {backToHomeLabel}
        </Link>
      </div>
    </div>
  );
}
