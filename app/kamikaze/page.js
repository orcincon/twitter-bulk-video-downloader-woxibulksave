'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { formatBucketLabel } from '@/lib/visitor-stats.js';
import ConfirmToast from '@/components/ConfirmToast.js';
import { extractTweetId } from '@/lib/tweet-url.js';

function compareSortValues(a, b, dir) {
  const mul = dir === 'asc' ? 1 : -1;
  if (a == null && b == null) return 0;
  if (a == null) return 1 * mul;
  if (b == null) return -1 * mul;
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * mul;
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    if (a === b) return 0;
    return (a ? 1 : -1) * mul;
  }
  const ad = Date.parse(a);
  const bd = Date.parse(b);
  if (!Number.isNaN(ad) && !Number.isNaN(bd)) return (ad - bd) * mul;
  return String(a).localeCompare(String(b), 'tr', { sensitivity: 'base' }) * mul;
}

function sortRows(rows, sort, getters) {
  const getter = getters[sort.field];
  if (!getter) return rows;
  return [...rows].sort((a, b) => compareSortValues(getter(a), getter(b), sort.dir));
}

function nextSortState(prev, field) {
  if (prev.field !== field) return { field, dir: 'asc' };
  return { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
}

function upgradeProfileImageUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('http')) return null;
  return url.replace(/_(?:normal|bigger|mini|reasonably_small|\d+x\d+)(\.(?:jpe?g|png|webp|gif))?(\?.*)?$/i, '$1$2');
}

function SortableTh({ label, field, sort, onSort, className = '', align = 'left', title }) {
  const active = sort?.field === field;
  const arrow = !active ? '↕' : sort.dir === 'asc' ? '↑' : '↓';
  return (
    <th className={`${className}${align === 'right' ? ' text-right' : ''}`}>
      <button
        type="button"
        onClick={() => onSort(field)}
        title={title || `${label} — artan/azalan sırala`}
        className={`inline-flex items-center gap-1 font-medium hover:text-gray-900 ${
          align === 'right' ? 'ml-auto' : ''
        } ${active ? 'text-[#1d9bf0]' : 'text-gray-600'}`}
      >
        <span>{label}</span>
        <span className={`text-xs ${active ? 'text-[#1d9bf0]' : 'text-gray-400'}`} aria-hidden>
          {arrow}
        </span>
      </button>
    </th>
  );
}

const USER_SORT_GETTERS = {
  username: (u) => u.username || '',
  email: (u) => u.email || '',
  name: (u) => u.name || '',
  preferred_language: (u) => u.preferred_language || '',
  has_oauth_token: (u) => Boolean(u.has_oauth_token),
  created_at: (u) => u.created_at || '',
  updated_at: (u) => u.updated_at || '',
};

const GUEST_SORT_GETTERS = {
  client_ip: (g) => g.client_ip || '',
  user_agent: (g) => g.user_agent || '',
  count: (g) => g.count ?? 0,
  last_seen: (g) => g.last_seen || '',
};

const PAGE_SORT_GETTERS = {
  path: (p) => p.path || '',
  visits: (p) => p.visits ?? 0,
  uniqueVisitors: (p) => p.uniqueVisitors ?? 0,
};

const REFERRER_SORT_GETTERS = {
  label: (r) => r.label || '',
  visits: (r) => r.visits ?? 0,
  uniqueVisitors: (r) => r.uniqueVisitors ?? 0,
};

const DAILY_SORT_GETTERS = {
  period: (r) => r.period || '',
  uniqueVisitors: (r) => r.uniqueVisitors ?? 0,
  totalVisits: (r) => r.totalVisits ?? 0,
};

const GONE_LIVE_STATUSES = new Set(['tweet_deleted', 'account_deleted', 'suspended', 'missing']);

const LIVE_STATUS_STYLES = {
  ok: 'bg-green-50 text-green-700',
  tweet_deleted: 'bg-amber-50 text-amber-800',
  account_deleted: 'bg-red-50 text-red-700',
  suspended: 'bg-red-50 text-red-700',
  private: 'bg-gray-100 text-gray-600',
  missing: 'bg-amber-50 text-amber-800',
  unknown: 'bg-gray-100 text-gray-500',
  invalid: 'bg-gray-100 text-gray-500',
};

export default function KamikazePage() {
  const [status, setStatus] = useState('loading'); // 'loading' | 'login' | 'dashboard' | 'error' | 'not_configured'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [stats, setStats] = useState({ totalLogs: 0, totalUsers: 0, usersWithOAuthToken: 0, recentLogs: [] });
  const [loadingStats, setLoadingStats] = useState(true);
  const [logsUsernameFilter, setLogsUsernameFilter] = useState('');
  const [logsUsernameFilterMode, setLogsUsernameFilterMode] = useState('include');
  const [logsSort, setLogsSort] = useState({ field: 'created_at', dir: 'desc' });
  const [usersSort, setUsersSort] = useState({ field: 'created_at', dir: 'desc' });
  const [guestsSort, setGuestsSort] = useState({ field: 'last_seen', dir: 'desc' });
  const [pagesSort, setPagesSort] = useState({ field: 'visits', dir: 'desc' });
  const [referrersSort, setReferrersSort] = useState({ field: 'visits', dir: 'desc' });
  const [dailySort, setDailySort] = useState({ field: 'period', dir: 'desc' });
  const [logsPage, setLogsPage] = useState(1);
  const [logsPagination, setLogsPagination] = useState({ page: 1, pageSize: 100, totalPages: 1, totalRecentRows: 0 });
  const [logUsernameOptions, setLogUsernameOptions] = useState([]);
  const [activeTab, setActiveTab] = useState('stats'); // 'stats' | 'users' | 'visitors' | 'daily' | 'hidden'
  const [users, setUsers] = useState([]);
  const [guests, setGuests] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState(new Set());
  const [selectedUserIds, setSelectedUserIds] = useState(new Set());
  const [selectedGuestIps, setSelectedGuestIps] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deletingUsers, setDeletingUsers] = useState(false);
  const [deletingGuests, setDeletingGuests] = useState(false);
  const [syncingUsernames, setSyncingUsernames] = useState(false);
  const [usernameSyncMessage, setUsernameSyncMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [savingUser, setSavingUser] = useState(false);
  const [visitorStats, setVisitorStats] = useState({
    uniqueVisitors: 0,
    totalVisits: 0,
    pages: [],
    referrers: [],
    daily: [],
    tableReady: true,
    serviceRoleConfigured: true,
    truncated: false,
  });
  const [loadingVisitors, setLoadingVisitors] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [hiddenLogs, setHiddenLogs] = useState([]);
  const [loadingHidden, setLoadingHidden] = useState(false);
  const [hiddenPage, setHiddenPage] = useState(1);
  const [hiddenPagination, setHiddenPagination] = useState({ page: 1, pageSize: 100, totalPages: 1, totalRecentRows: 0 });
  const [hiddenSort, setHiddenSort] = useState({ field: 'created_at', dir: 'desc' });
  const [hiddenUsernameFilter, setHiddenUsernameFilter] = useState('');
  const [hiddenUsernameFilterMode, setHiddenUsernameFilterMode] = useState('include');
  const [hiddenUsernameOptions, setHiddenUsernameOptions] = useState([]);
  const [selectedHiddenRowIds, setSelectedHiddenRowIds] = useState(new Set());
  const [hiddenColumnMissing, setHiddenColumnMissing] = useState(false);
  const [liveStatusByTweetId, setLiveStatusByTweetId] = useState({});
  const [checkingLiveStatus, setCheckingLiveStatus] = useState(false);
  const [liveStatusFilter, setLiveStatusFilter] = useState('all');
  const [liveCheckProgress, setLiveCheckProgress] = useState({ done: 0, total: 0 });

  const openConfirm = (dialog) => {
    setConfirmDialog(dialog);
  };

  const closeConfirm = () => {
    setConfirmDialog(null);
  };

  const runConfirmAction = async (fn) => {
    if (!fn) return;
    await fn();
    closeConfirm();
  };

  const loadStats = async (page = logsPage) => {
    setLoadingStats(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '100',
      });
      const filterNorm = logsUsernameFilter.trim().replace(/^@+/, '');
      if (filterNorm) {
        params.set('username', filterNorm);
        params.set('usernameMode', logsUsernameFilterMode);
      }
      params.set('sortBy', logsSort.field);
      params.set('sortDir', logsSort.dir);

      const res = await fetch(`/api/kamikaze/stats?${params.toString()}`, { credentials: 'include' });
      if (res.status === 401) {
        setStatus('login');
        return;
      }
      if (res.status === 503) {
        const data = await res.json().catch(() => ({}));
        if (data.error === 'NOT_CONFIGURED') setStatus('not_configured');
        else setStatus('error');
        return;
      }
      if (!res.ok) {
        setStatus('error');
        return;
      }
      const data = await res.json();
      setStats({
        totalLogs: data.totalLogs ?? 0,
        totalUsers: data.totalUsers ?? 0,
        usersWithOAuthToken: data.usersWithOAuthToken ?? 0,
        recentLogs: data.recentLogs ?? [],
      });
      setLogsPagination({
        page: data.page ?? page,
        pageSize: data.pageSize ?? 100,
        totalPages: data.totalPages ?? 1,
        totalRecentRows: data.totalRecentRows ?? 0,
      });
      setLogUsernameOptions(data.usernameOptions ?? []);
      if ((data.page ?? page) !== page) setLogsPage(data.page ?? page);
      setStatus('dashboard');
    } catch {
      setStatus('error');
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'stats') loadStats(logsPage);
  }, [activeTab, logsPage, logsUsernameFilter, logsUsernameFilterMode, logsSort]);

  const loadHiddenLogs = async (page = hiddenPage) => {
    setLoadingHidden(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '100',
        hidden: '1',
      });
      const filterNorm = hiddenUsernameFilter.trim().replace(/^@+/, '');
      if (filterNorm) {
        params.set('username', filterNorm);
        params.set('usernameMode', hiddenUsernameFilterMode);
      }
      params.set('sortBy', hiddenSort.field);
      params.set('sortDir', hiddenSort.dir);

      const res = await fetch(`/api/kamikaze/stats?${params.toString()}`, { credentials: 'include' });
      if (res.status === 401) {
        setStatus('login');
        return;
      }
      if (!res.ok) {
        setActionError('Soft silinenler yüklenemedi.');
        return;
      }
      const data = await res.json();
      setHiddenLogs(data.recentLogs ?? []);
      setHiddenPagination({
        page: data.page ?? page,
        pageSize: data.pageSize ?? 100,
        totalPages: data.totalPages ?? 1,
        totalRecentRows: data.totalRecentRows ?? 0,
      });
      setHiddenUsernameOptions(data.usernameOptions ?? []);
      setHiddenColumnMissing(Boolean(data.columnMissing));
      if ((data.page ?? page) !== page) setHiddenPage(data.page ?? page);
    } catch {
      setActionError('Bağlantı hatası.');
    } finally {
      setLoadingHidden(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'hidden') loadHiddenLogs(hiddenPage);
  }, [activeTab, hiddenPage, hiddenUsernameFilter, hiddenUsernameFilterMode, hiddenSort]);

  useEffect(() => {
    if (!previewImage && !editingUser) return undefined;
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      if (previewImage) setPreviewImage(null);
      else if (editingUser && !savingUser) setEditingUser(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewImage, editingUser, savingUser]);

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch('/api/kamikaze/users', { credentials: 'include' });
      if (res.status === 401) {
        setStatus('login');
        return;
      }
      if (!res.ok) {
        setUsers([]);
        return;
      }
      const data = await res.json();
      setUsers(data.users ?? []);
      setGuests(data.guests ?? []);
    } catch {
      setUsers([]);
      setGuests([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (status === 'dashboard' && activeTab === 'users') loadUsers();
  }, [status, activeTab]);

  const loadVisitors = async () => {
    setLoadingVisitors(true);
    try {
      const res = await fetch('/api/kamikaze/visitors', { credentials: 'include' });
      if (res.status === 401) {
        setStatus('login');
        return;
      }
      if (!res.ok) {
        setVisitorStats({
          uniqueVisitors: 0,
          totalVisits: 0,
          pages: [],
          referrers: [],
          daily: [],
          tableReady: false,
          serviceRoleConfigured: true,
          truncated: false,
        });
        return;
      }
      const data = await res.json();
      setVisitorStats({
        uniqueVisitors: data.uniqueVisitors ?? 0,
        totalVisits: data.totalVisits ?? 0,
        pages: data.pages ?? [],
        referrers: data.referrers ?? [],
        daily: data.daily ?? [],
        tableReady: data.tableReady !== false,
        serviceRoleConfigured: data.serviceRoleConfigured !== false,
        truncated: Boolean(data.truncated),
      });
    } catch {
      setVisitorStats({
        uniqueVisitors: 0,
        totalVisits: 0,
        pages: [],
        referrers: [],
        daily: [],
        tableReady: false,
        serviceRoleConfigured: true,
        truncated: false,
      });
    } finally {
      setLoadingVisitors(false);
    }
  };

  useEffect(() => {
    if (status === 'dashboard' && (activeTab === 'visitors' || activeTab === 'daily')) loadVisitors();
  }, [status, activeTab]);

  useEffect(() => {
    setActionError('');
    if (activeTab === 'stats') {
      setSelectedUserIds(new Set());
      setSelectedGuestIps(new Set());
      setSelectedHiddenRowIds(new Set());
    } else if (activeTab === 'users') {
      setSelectedRowIds(new Set());
      setSelectedHiddenRowIds(new Set());
    } else if (activeTab === 'hidden') {
      setSelectedRowIds(new Set());
      setSelectedUserIds(new Set());
      setSelectedGuestIps(new Set());
    }
  }, [activeTab]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/kamikaze/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setEmail('');
        setPassword('');
        setSubmitting(false);
        window.location.href = '/kamikaze';
        return;
      }
      if (res.status === 503) setStatus('not_configured');
      else setSubmitError(data.error === 'INVALID_CREDENTIALS' ? 'E-posta veya şifre hatalı.' : 'Giriş başarısız.');
    } catch {
      setSubmitError('Bağlantı hatası. Ağınızı kontrol edin.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/kamikaze/logout', { method: 'POST', credentials: 'include' });
    setStatus('login');
    setStats({ totalLogs: 0, totalUsers: 0, usersWithOAuthToken: 0, recentLogs: [] });
  };

  const formatDate = (s) => {
    if (!s) return '—';
    try {
      const d = new Date(s);
      return d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return s;
    }
  };

  const toggleRow = (rowId) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const filteredRecentLogs = useMemo(() => {
    if (liveStatusFilter !== 'gone') return stats.recentLogs;
    return stats.recentLogs.filter((row) => {
      const tweetId = extractTweetId(row.url);
      const status = tweetId ? liveStatusByTweetId[tweetId]?.status : null;
      return GONE_LIVE_STATUSES.has(status);
    });
  }, [stats.recentLogs, liveStatusFilter, liveStatusByTweetId]);

  const sortedUsers = useMemo(() => sortRows(users, usersSort, USER_SORT_GETTERS), [users, usersSort]);
  const sortedGuests = useMemo(() => sortRows(guests, guestsSort, GUEST_SORT_GETTERS), [guests, guestsSort]);
  const sortedPages = useMemo(
    () => sortRows(visitorStats.pages, pagesSort, PAGE_SORT_GETTERS),
    [visitorStats.pages, pagesSort]
  );
  const sortedReferrers = useMemo(
    () => sortRows(visitorStats.referrers, referrersSort, REFERRER_SORT_GETTERS),
    [visitorStats.referrers, referrersSort]
  );
  const sortedDaily = useMemo(
    () => sortRows(visitorStats.daily ?? [], dailySort, DAILY_SORT_GETTERS),
    [visitorStats.daily, dailySort]
  );

  const handleLogsSort = (field) => {
    setLogsSort((prev) => nextSortState(prev, field));
    setLogsPage(1);
  };

  const allFilteredLogsSelected =
    filteredRecentLogs.length > 0 && filteredRecentLogs.every((r) => selectedRowIds.has(r.id));

  const toggleAll = () => {
    setSelectedRowIds((prev) => {
      if (filteredRecentLogs.length === 0) return prev;
      if (filteredRecentLogs.every((r) => prev.has(r.id))) {
        const next = new Set(prev);
        filteredRecentLogs.forEach((r) => next.delete(r.id));
        return next;
      }
      const next = new Set(prev);
      filteredRecentLogs.forEach((r) => next.add(r.id));
      return next;
    });
  };

  const deleteLogs = async (logIds, mode = 'hard') => {
    if (!logIds.length) return;
    setDeleting(true);
    setActionError('');
    try {
      const res = await fetch('/api/kamikaze/logs/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ log_ids: logIds, mode }),
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 400 && data.error === 'ADMIN_HIDDEN_COLUMN_MISSING') {
        setActionError("Önce Supabase'de analysis_logs.admin_hidden kolonunu ekleyin (017_analysis_logs_admin_hidden.sql).");
        return;
      }
      if (res.ok && data.ok) {
        setSelectedRowIds(new Set());
        setSelectedHiddenRowIds(new Set());
        if (activeTab === 'hidden') {
          const nextPage =
            hiddenLogs.length <= 1 && hiddenPage > 1 ? hiddenPage - 1 : hiddenPage;
          if (nextPage !== hiddenPage) setHiddenPage(nextPage);
          else await loadHiddenLogs(hiddenPage);
        } else {
          const nextPage =
            stats.recentLogs.length <= 1 && logsPage > 1 ? logsPage - 1 : logsPage;
          if (nextPage !== logsPage) setLogsPage(nextPage);
          else await loadStats(logsPage);
        }
      } else {
        setActionError(
          mode === 'soft' ? 'Analiz gizlenemedi.' : mode === 'restore' ? 'Analiz geri alınamadı.' : 'Analiz silinemedi.'
        );
      }
    } catch {
      setActionError('Bağlantı hatası.');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteRow = (row) => {
    openConfirm({
      message: 'Bu kayıt kamikaze listesinden kaldırılacak.',
      detail: 'Soft sil kullanıcının arşivini korur.\nKalıcı sil kaydı arşivden de siler.',
      onSoftConfirm: () => deleteLogs([row.log_id], 'soft'),
      onHardConfirm: () => deleteLogs([row.log_id], 'hard'),
    });
  };

  const handleBulkDelete = () => {
    const logIds = [...new Set(stats.recentLogs.filter((r) => selectedRowIds.has(r.id)).map((r) => r.log_id))];
    if (!logIds.length) return;
    openConfirm({
      message: `${logIds.length} analiz kamikaze listesinden kaldırılacak.`,
      detail: 'Soft sil kullanıcı arşivlerini korur.\nKalıcı sil kayıtları arşivden de siler.',
      onSoftConfirm: () => deleteLogs(logIds, 'soft'),
      onHardConfirm: () => deleteLogs(logIds, 'hard'),
    });
  };

  const liveStatusCounts = useMemo(() => {
    let gone = 0;
    let checked = 0;
    for (const row of stats.recentLogs) {
      const tweetId = extractTweetId(row.url);
      const st = tweetId ? liveStatusByTweetId[tweetId] : null;
      if (!st) continue;
      checked += 1;
      if (GONE_LIVE_STATUSES.has(st.status)) gone += 1;
    }
    return { gone, checked };
  }, [stats.recentLogs, liveStatusByTweetId]);

  const checkLiveStatus = async () => {
    const source =
      selectedRowIds.size > 0
        ? filteredRecentLogs.filter((row) => selectedRowIds.has(row.id))
        : filteredRecentLogs;
    const items = [];
    const seen = new Set();
    for (const row of source) {
      if (!row.url) continue;
      const tweetId = extractTweetId(row.url);
      if (!tweetId || seen.has(tweetId)) continue;
      seen.add(tweetId);
      items.push({ url: row.url, username: row.user_username || '' });
    }
    if (!items.length) {
      setActionError('Kontrol edilecek gönderi yok.');
      return;
    }

    setCheckingLiveStatus(true);
    setActionError('');
    setLiveCheckProgress({ done: 0, total: items.length });
    const chunkSize = 12;
    try {
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        const res = await fetch('/api/kamikaze/logs/live-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: chunk }),
          credentials: 'include',
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          setStatus('login');
          return;
        }
        if (!res.ok || !data.ok) {
          setActionError('Gönderi durumu kontrol edilemedi.');
          return;
        }
        setLiveStatusByTweetId((prev) => ({ ...prev, ...(data.results || {}) }));
        setLiveCheckProgress({ done: Math.min(i + chunk.length, items.length), total: items.length });
      }
    } catch {
      setActionError('Bağlantı hatası.');
    } finally {
      setCheckingLiveStatus(false);
    }
  };

  const allHiddenLogsSelected =
    hiddenLogs.length > 0 && hiddenLogs.every((r) => selectedHiddenRowIds.has(r.id));

  const toggleHiddenRow = (rowId) => {
    setSelectedHiddenRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const toggleAllHidden = () => {
    setSelectedHiddenRowIds((prev) => {
      if (hiddenLogs.length === 0) return prev;
      if (hiddenLogs.every((r) => prev.has(r.id))) {
        const next = new Set(prev);
        hiddenLogs.forEach((r) => next.delete(r.id));
        return next;
      }
      const next = new Set(prev);
      hiddenLogs.forEach((r) => next.add(r.id));
      return next;
    });
  };

  const selectedHiddenLogIds = () =>
    [...new Set(hiddenLogs.filter((r) => selectedHiddenRowIds.has(r.id)).map((r) => r.log_id))];

  const handleRestoreHiddenRow = (row) => {
    openConfirm({
      message: 'Bu kayıt istatistiklere geri alınacak.',
      confirmLabel: 'Geri al',
      onConfirm: () => deleteLogs([row.log_id], 'restore'),
    });
  };

  const handleHardDeleteHiddenRow = (row) => {
    openConfirm({
      message: 'Bu kayıt kalıcı olarak silinecek. Kullanıcının arşivinden de gider.',
      confirmLabel: 'Kalıcı sil',
      onConfirm: () => deleteLogs([row.log_id], 'hard'),
    });
  };

  const handleBulkRestoreHidden = () => {
    const logIds = selectedHiddenLogIds();
    if (!logIds.length) return;
    openConfirm({
      message: `${logIds.length} kayıt istatistiklere geri alınacak.`,
      confirmLabel: 'Geri al',
      onConfirm: () => deleteLogs(logIds, 'restore'),
    });
  };

  const handleBulkHardDeleteHidden = () => {
    const logIds = selectedHiddenLogIds();
    if (!logIds.length) return;
    openConfirm({
      message: `${logIds.length} kayıt kalıcı olarak silinecek. Kullanıcı arşivlerinden de gider.`,
      confirmLabel: 'Kalıcı sil',
      onConfirm: () => deleteLogs(logIds, 'hard'),
    });
  };

  const handleHiddenSort = (field) => {
    setHiddenSort((prev) => nextSortState(prev, field));
    setHiddenPage(1);
  };

  const toggleSetItem = (setter, key) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleUser = (userId) => toggleSetItem(setSelectedUserIds, userId);

  const toggleAllUsers = () => {
    if (selectedUserIds.size >= users.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(users.map((u) => u.id)));
    }
  };

  const deleteUsers = async (userIds, mode = 'hard') => {
    if (!userIds.length) return;
    setDeletingUsers(true);
    setActionError('');
    try {
      const res = await fetch('/api/kamikaze/users/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_ids: userIds, mode }),
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setSelectedUserIds(new Set());
        await Promise.all([loadUsers(), loadStats()]);
      } else {
        setActionError('Kullanıcı silinemedi.');
      }
    } catch {
      setActionError('Bağlantı hatası.');
    } finally {
      setDeletingUsers(false);
    }
  };

  const handleDeleteUser = (user) => {
    openConfirm({
      message: `"${user.email || user.id}" kullanıcısı silinecek.`,
      detail: 'Soft sil: kullanıcı listeden kalkar, arşivi kalır.\nKalıcı sil: kullanıcı ve arşivi tamamen silinir.',
      onSoftConfirm: () => deleteUsers([user.id], 'soft'),
      onHardConfirm: () => deleteUsers([user.id], 'hard'),
    });
  };

  const openEditUser = (user) => {
    setActionError('');
    setEditingUser({
      id: user.id,
      username: user.username || '',
      email: user.email || '',
      name: user.name || '',
      preferred_language: String(user.preferred_language || 'en').toLowerCase(),
    });
  };

  const saveEditedUser = async (event) => {
    event?.preventDefault?.();
    if (!editingUser?.id || savingUser) return;
    setSavingUser(true);
    setActionError('');
    try {
      const res = await fetch('/api/kamikaze/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingUser.id,
          name: editingUser.name,
          preferred_language: editingUser.preferred_language,
        }),
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setStatus('login');
        return;
      }
      if (!res.ok || !data.ok || !data.user) {
        const messages = {
          LANGUAGE_INVALID: 'Dil geçersiz.',
          NOT_FOUND: 'Kullanıcı bulunamadı.',
        };
        setActionError(messages[data.error] || 'Kullanıcı güncellenemedi.');
        return;
      }
      setUsers((prev) => prev.map((row) => (row.id === data.user.id ? { ...row, ...data.user } : row)));
      setEditingUser(null);
      setUsernameSyncMessage('Kullanıcı bilgileri güncellendi.');
    } catch {
      setActionError('Bağlantı hatası.');
    } finally {
      setSavingUser(false);
    }
  };

  const handleBulkDeleteUsers = () => {
    const userIds = [...selectedUserIds];
    if (!userIds.length) return;
    openConfirm({
      message: `${userIds.length} kullanıcı silinecek.`,
      detail: 'Soft sil: kullanıcılar listeden kalkar, arşivleri kalır.\nKalıcı sil: kullanıcılar ve arşivleri tamamen silinir.',
      onSoftConfirm: () => deleteUsers(userIds, 'soft'),
      onHardConfirm: () => deleteUsers(userIds, 'hard'),
    });
  };

  const handleSyncUsernames = async () => {
    setSyncingUsernames(true);
    setUsernameSyncMessage('');
    setActionError('');
    try {
      const res = await fetch('/api/kamikaze/users/sync-usernames', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setStatus('login');
        return;
      }
      if (res.status === 400 && data.error === 'USERNAME_COLUMN_MISSING') {
        setActionError('Önce Supabase\'de users.username kolonunu ekleyin (016_users_username.sql).');
        return;
      }
      if (!res.ok || !data.ok) {
        setActionError('X kullanıcı adları alınamadı.');
        return;
      }
      if (data.saved > 0) {
        setUsernameSyncMessage(`${data.saved} kullanıcının X kullanıcı adı güncellendi.`);
      } else if (data.missing === 0) {
        setUsernameSyncMessage('Tüm kullanıcıların X kullanıcı adı zaten kayıtlı.');
      } else {
        setUsernameSyncMessage('Eksik kullanıcı adı bulunamadı veya X API yanıt vermedi.');
      }
      await loadUsers();
    } catch {
      setActionError('Bağlantı hatası.');
    } finally {
      setSyncingUsernames(false);
    }
  };

  const toggleGuest = (clientIp) => toggleSetItem(setSelectedGuestIps, clientIp);

  const toggleAllGuests = () => {
    if (selectedGuestIps.size >= guests.length) {
      setSelectedGuestIps(new Set());
    } else {
      setSelectedGuestIps(new Set(guests.map((g) => g.client_ip)));
    }
  };

  const deleteGuests = async (clientIps) => {
    if (!clientIps.length) return;
    setDeletingGuests(true);
    setActionError('');
    try {
      const res = await fetch('/api/kamikaze/guests/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_ips: clientIps }),
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setSelectedGuestIps(new Set());
        await Promise.all([loadUsers(), loadStats()]);
      } else {
        setActionError('Misafir kayıtları silinemedi.');
      }
    } catch {
      setActionError('Bağlantı hatası.');
    } finally {
      setDeletingGuests(false);
    }
  };

  const handleDeleteGuest = (guest) => {
    openConfirm({
      message: `${guest.client_ip} IP adresine ait misafir analizleri silinecek. Emin misiniz?`,
      onConfirm: () => deleteGuests([guest.client_ip]),
    });
  };

  const handleBulkDeleteGuests = () => {
    const clientIps = [...selectedGuestIps];
    if (!clientIps.length) return;
    openConfirm({
      message: `${clientIps.length} misafir IP kaydı ve ilgili analizler silinecek. Emin misiniz?`,
      onConfirm: () => deleteGuests(clientIps),
    });
  };

  const renderBulkActions = (selectedCount, onDelete, deletingFlag, label) => {
    if (selectedCount === 0) return null;
    return (
      <button
        type="button"
        onClick={onDelete}
        disabled={deletingFlag}
        className="px-3 py-1.5 text-sm font-medium rounded-lg bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
      >
        {deletingFlag ? 'Siliniyor…' : `${label} (${selectedCount})`}
      </button>
    );
  };

  const renderLogsPagination = () => {
    if (logsPagination.totalPages <= 1) return null;
    return (
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        {Array.from({ length: logsPagination.totalPages }, (_, i) => i + 1).map((pageNum) => (
          <button
            key={pageNum}
            type="button"
            onClick={() => setLogsPage(pageNum)}
            disabled={loadingStats}
            className={`min-w-[2rem] px-2.5 py-1 text-sm font-medium rounded-lg border transition disabled:opacity-50 ${
              pageNum === logsPagination.page
                ? 'border-[#1d9bf0] bg-[#1d9bf0] text-white'
                : 'border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
            aria-label={`Sayfa ${pageNum}`}
            aria-current={pageNum === logsPagination.page ? 'page' : undefined}
          >
            {pageNum}
          </button>
        ))}
      </div>
    );
  };

  const renderHiddenPagination = () => {
    if (hiddenPagination.totalPages <= 1) return null;
    return (
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        {Array.from({ length: hiddenPagination.totalPages }, (_, i) => i + 1).map((pageNum) => (
          <button
            key={pageNum}
            type="button"
            onClick={() => setHiddenPage(pageNum)}
            disabled={loadingHidden}
            className={`min-w-[2rem] px-2.5 py-1 text-sm font-medium rounded-lg border transition disabled:opacity-50 ${
              pageNum === hiddenPagination.page
                ? 'border-[#1d9bf0] bg-[#1d9bf0] text-white'
                : 'border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
            aria-label={`Sayfa ${pageNum}`}
            aria-current={pageNum === hiddenPagination.page ? 'page' : undefined}
          >
            {pageNum}
          </button>
        ))}
      </div>
    );
  };

  if (status === 'loading' && loadingStats) {
    return (
      <div className="min-h-screen bg-[#E7F3FF] flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-[#1d9bf0]/30 shadow-lg p-8 lg:p-10 max-w-md w-full text-center">
          <p className="text-gray-600 text-sm sm:text-base">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (status === 'not_configured') {
    return (
      <div className="min-h-screen bg-[#E7F3FF] flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-[#1d9bf0]/30 shadow-lg p-8 lg:p-10 max-w-md lg:max-w-lg w-full text-center">
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900 mb-2">Kamikaze</h1>
          <p className="text-gray-600 text-sm sm:text-base mb-6">Yönetim paneli yapılandırılmamış. En az <code className="bg-gray-100 px-1 rounded">KAMIKAZE_SECRET</code> ortam değişkeni tanımlanmalı (isteğe bağlı: <code className="bg-gray-100 px-1 rounded">KAMIKAZE_EMAIL</code>). <code className="bg-gray-100 px-1 rounded">.env.local</code> veya Vercel Environment Variables kullanın.</p>
          <Link href="/" className="text-[#1d9bf0] hover:text-[#1d9bf0] text-sm sm:text-base font-medium">← Ana sayfa</Link>
        </div>
      </div>
    );
  }

  if (status === 'login') {
    return (
      <div className="min-h-screen bg-[#E7F3FF] flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-[#1d9bf0]/30 shadow-lg p-8 lg:p-10 max-w-md lg:max-w-lg w-full">
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900 mb-2 text-center">Kamikaze</h1>
          <p className="text-gray-600 text-sm sm:text-base text-center mb-6 lg:mb-8">Yönetim paneline giriş</p>
          <form onSubmit={handleLogin} className="space-y-4 lg:space-y-5" autoComplete="off">
            <div>
              <label htmlFor="kamikaze-email" className="block text-sm font-medium text-gray-700 mb-1">E-posta</label>
              <input
                id="kamikaze-email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 sm:py-3 rounded-xl border-2 border-[#1d9bf0]/40 bg-white text-gray-900 text-sm sm:text-base focus:border-[#1d9bf0] focus:ring-2 focus:ring-[#1d9bf0]/30 focus:outline-none"
                placeholder="E-posta adresiniz"
                autoComplete="off"
                required
              />
            </div>
            <div>
              <label htmlFor="kamikaze-password" className="block text-sm font-medium text-gray-700 mb-1">Şifre</label>
              <input
                id="kamikaze-password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 sm:py-3 rounded-xl border-2 border-[#1d9bf0]/40 bg-white text-gray-900 text-sm sm:text-base focus:border-[#1d9bf0] focus:ring-2 focus:ring-[#1d9bf0]/30 focus:outline-none"
                placeholder="Şifre"
                autoComplete="off"
                required
              />
            </div>
            {submitError && <p className="text-sm text-red-600 font-medium">{submitError}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 sm:py-3 rounded-xl bg-[#1d9bf0] hover:bg-[#1686d4] disabled:opacity-70 disabled:cursor-not-allowed text-white font-semibold text-sm sm:text-base transition"
            >
              {submitting ? 'Giriş yapılıyor…' : 'Giriş'}
            </button>
          </form>
          <p className="mt-6 lg:mt-8 text-center">
            <Link href="/" className="text-[#1d9bf0] hover:text-[#1d9bf0] text-sm sm:text-base font-medium">← Ana sayfa</Link>
          </p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-[#E7F3FF] flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-[#1d9bf0]/30 shadow-lg p-8 lg:p-10 max-w-md lg:max-w-lg w-full text-center">
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900 mb-2">Kamikaze</h1>
          <p className="text-gray-600 text-sm sm:text-base mb-6">Bir hata oluştu. Lütfen tekrar deneyin.</p>
          <button
            type="button"
            onClick={() => { setStatus('loading'); setLoadingStats(true); loadStats(logsPage); }}
            className="text-[#1d9bf0] hover:text-[#1d9bf0] text-sm sm:text-base font-medium"
          >
            Tekrar dene
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#E7F3FF] flex flex-col">
      <header className="bg-[#D1EBFF] border-b border-[#1d9bf0]/40 px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between">
        <h1 className="text-base sm:text-lg lg:text-xl xl:text-2xl font-bold text-gray-900 truncate mr-4">Kamikaze — Yönetim Paneli</h1>
        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          <Link href="/" className="text-[#1d9bf0] hover:text-[#1d9bf0] text-sm sm:text-base font-medium whitespace-nowrap">Ana sayfa</Link>
          <button
            type="button"
            onClick={handleLogout}
            className="text-sm sm:text-base font-medium text-gray-600 hover:text-red-600 whitespace-nowrap"
          >
            Çıkış
          </button>
        </div>
      </header>

      <nav className="bg-white border-b border-[#1d9bf0]/30">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 flex gap-0 sm:gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('stats')}
            className={`px-3 sm:px-5 lg:px-6 py-3 sm:py-3.5 text-sm lg:text-base font-medium border-b-2 transition whitespace-nowrap ${activeTab === 'stats' ? 'border-[#1d9bf0] text-[#1d9bf0]' : 'border-transparent text-gray-600 hover:text-gray-900'}`}
          >
            İstatistikler
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`px-3 sm:px-5 lg:px-6 py-3 sm:py-3.5 text-sm lg:text-base font-medium border-b-2 transition whitespace-nowrap ${activeTab === 'users' ? 'border-[#1d9bf0] text-[#1d9bf0]' : 'border-transparent text-gray-600 hover:text-gray-900'}`}
          >
            Kullanıcı yönetimi
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('visitors')}
            className={`px-3 sm:px-5 lg:px-6 py-3 sm:py-3.5 text-sm lg:text-base font-medium border-b-2 transition whitespace-nowrap ${activeTab === 'visitors' ? 'border-[#1d9bf0] text-[#1d9bf0]' : 'border-transparent text-gray-600 hover:text-gray-900'}`}
          >
            Ziyaretçiler
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('daily')}
            className={`px-3 sm:px-5 lg:px-6 py-3 sm:py-3.5 text-sm lg:text-base font-medium border-b-2 transition whitespace-nowrap ${activeTab === 'daily' ? 'border-[#1d9bf0] text-[#1d9bf0]' : 'border-transparent text-gray-600 hover:text-gray-900'}`}
          >
            Günlük ziyaretçi
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('hidden')}
            className={`px-3 sm:px-5 lg:px-6 py-3 sm:py-3.5 text-sm lg:text-base font-medium border-b-2 transition whitespace-nowrap ${activeTab === 'hidden' ? 'border-[#1d9bf0] text-[#1d9bf0]' : 'border-transparent text-gray-600 hover:text-gray-900'}`}
          >
            Soft silinenler
          </button>
        </div>
      </nav>

      <main className="flex-grow w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
        {actionError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {actionError}
          </div>
        )}
        {activeTab === 'stats' && (
          <>
            <div className="grid grid-cols-3 gap-2 sm:gap-6 lg:gap-8 mb-4 sm:mb-8 lg:mb-10">
              <div className="bg-white rounded-lg sm:rounded-xl lg:rounded-2xl border border-[#1d9bf0]/30 shadow-md p-2 sm:p-6 lg:p-8 min-w-0">
                <p className="text-[10px] sm:text-sm text-gray-600 mb-0.5 sm:mb-1 leading-tight">Toplam analiz</p>
                <div className="flex items-center gap-2">
                  <p className="text-lg sm:text-3xl lg:text-4xl font-bold text-gray-900 tabular-nums">{stats.totalLogs}</p>
                  <button
                    type="button"
                    onClick={() => loadStats(logsPage)}
                    disabled={loadingStats}
                    className="inline-flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 text-xs sm:text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    aria-label="Toplam analizi yenile"
                    title="Yenile"
                  >
                    <svg
                      className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${loadingStats ? 'animate-spin' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    <span className="hidden sm:inline">Yenile</span>
                  </button>
                </div>
              </div>
              <div className="bg-white rounded-lg sm:rounded-xl lg:rounded-2xl border border-[#1d9bf0]/30 shadow-md p-2 sm:p-6 lg:p-8 min-w-0">
                <p className="text-[10px] sm:text-sm text-gray-600 mb-0.5 sm:mb-1 leading-tight">
                  <span className="sm:hidden">Kullanıcı</span>
                  <span className="hidden sm:inline">Kayıtlı kullanıcı</span>
                </p>
                <p className="text-lg sm:text-3xl lg:text-4xl font-bold text-gray-900 tabular-nums">{stats.totalUsers}</p>
              </div>
              <div className="bg-white rounded-lg sm:rounded-xl lg:rounded-2xl border border-[#1d9bf0]/30 shadow-md p-2 sm:p-6 lg:p-8 min-w-0">
                <p className="text-[10px] sm:text-sm text-gray-600 mb-0.5 sm:mb-1 leading-tight">
                  <span className="sm:hidden">OAuth</span>
                  <span className="hidden sm:inline">OAuth token&apos;lı kullanıcı</span>
                </p>
                <p className="text-lg sm:text-3xl lg:text-4xl font-bold text-gray-900 tabular-nums">{stats.usersWithOAuthToken}</p>
                <p className="hidden sm:block text-xs text-gray-500 mt-1">X girişinde kaydedilen havuz token&apos;ı</p>
              </div>
            </div>

            <div className="bg-white rounded-xl lg:rounded-2xl border border-[#1d9bf0]/30 shadow-md overflow-hidden">
              <div className="px-4 sm:px-6 lg:px-8 py-3 sm:py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base lg:text-lg font-bold text-gray-900">Son analizler</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Her satır = bir X linki. Video = o linkten bulunan video adedi.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  {renderLogsPagination()}
                  <label className="flex items-center gap-2 min-w-0">
                    <span className="sr-only">Filtre modu</span>
                    <select
                      value={logsUsernameFilterMode}
                      onChange={(e) => {
                        setLogsUsernameFilterMode(e.target.value);
                        setLogsPage(1);
                      }}
                      disabled={!logsUsernameFilter}
                      className="w-[6.5rem] sm:w-28 max-w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1d9bf0]/30 focus:border-[#1d9bf0] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="include">Göster</option>
                      <option value="exclude">Hariç tut</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 min-w-0">
                    <span className="sr-only">X kullanıcı adı filtre</span>
                    <select
                      value={logsUsernameFilter}
                      onChange={(e) => {
                        setLogsUsernameFilter(e.target.value);
                        setLogsPage(1);
                      }}
                      className="w-[9.5rem] sm:w-44 max-w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1d9bf0]/30 focus:border-[#1d9bf0]"
                    >
                      <option value="">Tümü</option>
                      {logUsernameOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span
                    className="text-sm font-semibold tabular-nums text-gray-700 whitespace-nowrap"
                    title="Filtreye uyan / tüm analizler"
                  >
                    {logsPagination.totalRecentRows}/{stats.totalLogs}
                  </span>
                  {filteredRecentLogs.length > 0 && (
                    <button
                      type="button"
                      onClick={toggleAll}
                      className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                    >
                      {allFilteredLogsSelected ? 'Seçimi kaldır' : 'Tümünü seç'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={checkLiveStatus}
                    disabled={checkingLiveStatus || filteredRecentLogs.length === 0}
                    className="px-3 py-1.5 text-sm font-medium rounded-lg border border-[#1d9bf0]/40 text-[#1d9bf0] hover:bg-[#1d9bf0]/5 disabled:opacity-50"
                    title={selectedRowIds.size > 0 ? 'Seçilen gönderileri X üzerinde kontrol et' : 'Bu sayfadaki gönderileri X üzerinde kontrol et'}
                  >
                    {checkingLiveStatus
                      ? `Taranıyor ${liveCheckProgress.done}/${liveCheckProgress.total}`
                      : selectedRowIds.size > 0
                        ? `Silinmişleri tara (${selectedRowIds.size})`
                        : 'Silinmişleri tara'}
                  </button>
                  {liveStatusCounts.checked > 0 && (
                    <label className="flex items-center gap-2 min-w-0">
                      <span className="sr-only">Durum filtresi</span>
                      <select
                        value={liveStatusFilter}
                        onChange={(e) => setLiveStatusFilter(e.target.value)}
                        className="w-[9.5rem] sm:w-40 max-w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1d9bf0]/30 focus:border-[#1d9bf0]"
                      >
                        <option value="all">Tüm durumlar</option>
                        <option value="gone">Silinmiş / askıda ({liveStatusCounts.gone})</option>
                      </select>
                    </label>
                  )}
                  {renderBulkActions(selectedRowIds.size, handleBulkDelete, deleting, 'Seçilenleri sil')}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm lg:text-base min-w-[640px]">
                  <thead>
                    <tr className="bg-gray-50 text-left text-gray-600">
                      <th className="px-2 sm:px-3 py-2 sm:py-3 w-10">
                        <input
                          type="checkbox"
                          checked={allFilteredLogsSelected}
                          onChange={toggleAll}
                          className="rounded border-gray-300"
                          aria-label="Tümünü seç"
                        />
                      </th>
                      <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium">Önizleme</th>
                      <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium w-28">Durum</th>
                      <SortableTh
                        label="X"
                        field="user"
                        sort={logsSort}
                        onSort={handleLogsSort}
                        className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3"
                      />
                      <SortableTh
                        label="Tarih"
                        field="created_at"
                        sort={logsSort}
                        onSort={handleLogsSort}
                        className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3"
                      />
                      <SortableTh
                        label="Video linki"
                        field="url"
                        sort={logsSort}
                        onSort={handleLogsSort}
                        className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3"
                      />
                      <SortableTh
                        label="Video"
                        field="video_count"
                        sort={logsSort}
                        onSort={handleLogsSort}
                        className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3"
                        title="Bu linkten bulunan video adedi"
                      />
                      <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium w-12">Sil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentLogs.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 lg:px-8 py-12 text-center text-gray-500">Henüz kayıt yok.</td>
                      </tr>
                    ) : filteredRecentLogs.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 lg:px-8 py-12 text-center text-gray-500">
                          {liveStatusFilter === 'gone'
                            ? 'Bu sayfada silinmiş veya askıdaki gönderi yok. Önce taramayı çalıştırın.'
                            : logsUsernameFilterMode === 'exclude'
                            ? 'Hariç tutulan kullanıcı dışında kayıt bulunamadı.'
                            : 'Bu kullanıcı adına ait kayıt bulunamadı.'}
                        </td>
                      </tr>
                    ) : (
                      filteredRecentLogs.map((row) => (
                        <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                          <td className="px-2 sm:px-3 py-2 sm:py-3 align-middle">
                            <input
                              type="checkbox"
                              checked={selectedRowIds.has(row.id)}
                              onChange={() => toggleRow(row.id)}
                              className="rounded border-gray-300"
                              aria-label="Satırı seç"
                            />
                          </td>
                          <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 align-middle">
                            {row.thumbnail ? (
                              <button
                                type="button"
                                onClick={() => setPreviewImage(row.thumbnail)}
                                className="block rounded-lg overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1d9bf0]"
                                title="Önizlemeyi büyüt"
                                aria-label="Önizlemeyi büyüt"
                              >
                                <img src={row.thumbnail} alt="" className="w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 rounded-lg object-cover bg-gray-100 shrink-0 hover:opacity-90 cursor-zoom-in" />
                              </button>
                            ) : (
                              <span className="w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 rounded-lg bg-gray-200 flex items-center justify-center text-gray-400 text-xs shrink-0">—</span>
                            )}
                          </td>
                          <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 align-middle">
                            {(() => {
                              const tweetId = extractTweetId(row.url);
                              const st = tweetId ? liveStatusByTweetId[tweetId] : null;
                              if (!st) return <span className="text-gray-400">—</span>;
                              const cls = LIVE_STATUS_STYLES[st.status] || LIVE_STATUS_STYLES.unknown;
                              return (
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${cls}`}>
                                  {st.label}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-700 text-xs truncate max-w-[90px] sm:max-w-[160px] align-middle">
                            {row.user_username ? (
                              <a
                                href={`https://x.com/${encodeURIComponent(row.user_username)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#1d9bf0] hover:underline"
                                title={row.user_name}
                              >
                                {row.user_name}
                              </a>
                            ) : (
                              <span title={row.user_name}>{row.user_name}</span>
                            )}
                          </td>
                          <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-700 whitespace-nowrap align-middle">{formatDate(row.created_at)}</td>
                          <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 max-w-[140px] sm:max-w-none align-middle">
                            {row.url ? (
                              <a
                                href={row.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#1d9bf0] hover:text-[#1d9bf0] font-mono text-xs sm:text-sm block truncate sm:truncate-none sm:break-all sm:whitespace-normal"
                                title={row.url}
                              >
                                <span className="sm:hidden">
                                  {row.url.replace(/^https?:\/\//, '').length > 40
                                    ? `${row.url.replace(/^https?:\/\//, '').slice(0, 37)}…`
                                    : row.url.replace(/^https?:\/\//, '')}
                                </span>
                                <span className="hidden sm:inline">{row.url}</span>
                              </a>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-700 align-middle">{row.video_count ?? 0}</td>
                          <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 align-middle">
                            <button
                              type="button"
                              onClick={() => handleDeleteRow(row)}
                              disabled={deleting}
                              className="p-1.5 rounded text-red-600 hover:bg-red-50 disabled:opacity-50"
                              title="Kaydı sil (soft veya kalıcı)"
                              aria-label="Sil"
                            >
                              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {logsPagination.totalPages > 1 && (
                <div className="px-4 sm:px-6 lg:px-8 py-3 sm:py-4 border-t border-gray-100 flex flex-wrap items-center justify-center">
                  {renderLogsPagination()}
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'users' && (
          <div className="space-y-6 lg:space-y-8">
            {usernameSyncMessage && (
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">{usernameSyncMessage}</p>
            )}
            <div className="bg-white rounded-xl lg:rounded-2xl border border-[#1d9bf0]/30 shadow-md overflow-hidden">
              <div className="px-4 sm:px-6 lg:px-8 py-3 sm:py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base lg:text-lg font-bold text-gray-900">
                  Kayıtlı kullanıcılar
                  <span className="text-gray-500 font-semibold tabular-nums ml-1.5">({users.length})</span>
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSyncUsernames}
                    disabled={syncingUsernames || loadingUsers}
                    className="px-3 py-1.5 text-sm font-medium rounded-lg border border-[#1d9bf0]/40 text-[#1d9bf0] hover:bg-[#1d9bf0]/5 disabled:opacity-50"
                  >
                    {syncingUsernames ? 'X adları çekiliyor...' : 'X kullanıcı adlarını çek'}
                  </button>
                  {users.length > 0 && !loadingUsers && (
                    <button
                      type="button"
                      onClick={toggleAllUsers}
                      className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                    >
                      {selectedUserIds.size >= users.length ? 'Seçimi kaldır' : 'Tümünü seç'}
                    </button>
                  )}
                  {renderBulkActions(selectedUserIds.size, handleBulkDeleteUsers, deletingUsers, 'Seçilenleri sil')}
                </div>
              </div>
              {loadingUsers ? (
                <div className="px-4 lg:px-8 py-12 text-center text-gray-500 text-sm sm:text-base">Yükleniyor...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm lg:text-base min-w-[1080px] table-auto">
                    <thead>
                      <tr className="bg-gray-50 text-left text-gray-600">
                        <th className="px-2 sm:px-3 py-2 sm:py-3 w-10">
                          <input
                            type="checkbox"
                            checked={users.length > 0 && selectedUserIds.size >= users.length}
                            onChange={toggleAllUsers}
                            className="rounded border-gray-300"
                            aria-label="Tüm kullanıcıları seç"
                          />
                        </th>
                        <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium w-16">Profil</th>
                      <SortableTh
                        label="X"
                        field="username"
                        sort={usersSort}
                        onSort={(field) => setUsersSort((prev) => nextSortState(prev, field))}
                        className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 min-w-[120px]"
                      />
                      <SortableTh
                        label="E-posta"
                        field="email"
                        sort={usersSort}
                        onSort={(field) => setUsersSort((prev) => nextSortState(prev, field))}
                        className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 min-w-[220px]"
                      />
                      <SortableTh
                        label="Ad"
                        field="name"
                        sort={usersSort}
                        onSort={(field) => setUsersSort((prev) => nextSortState(prev, field))}
                        className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 min-w-[140px]"
                      />
                      <SortableTh
                        label="Dil"
                        field="preferred_language"
                        sort={usersSort}
                        onSort={(field) => setUsersSort((prev) => nextSortState(prev, field))}
                        className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 w-16"
                      />
                      <SortableTh
                        label="OAuth"
                        field="has_oauth_token"
                        sort={usersSort}
                        onSort={(field) => setUsersSort((prev) => nextSortState(prev, field))}
                        className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 w-20"
                      />
                      <SortableTh
                        label="Kayıt"
                        field="created_at"
                        sort={usersSort}
                        onSort={(field) => setUsersSort((prev) => nextSortState(prev, field))}
                        className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 whitespace-nowrap"
                      />
                      <SortableTh
                        label="Güncelleme"
                        field="updated_at"
                        sort={usersSort}
                        onSort={(field) => setUsersSort((prev) => nextSortState(prev, field))}
                        className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 whitespace-nowrap"
                      />
                        <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium w-20">İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="px-4 lg:px-8 py-12 text-center text-gray-500">Kayıtlı kullanıcı yok.</td>
                        </tr>
                      ) : (
                        sortedUsers.map((u) => (
                          <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                            <td className="px-2 sm:px-3 py-2 sm:py-3 align-top">
                              <input
                                type="checkbox"
                                checked={selectedUserIds.has(u.id)}
                                onChange={() => toggleUser(u.id)}
                                className="rounded border-gray-300"
                                aria-label="Kullanıcıyı seç"
                              />
                            </td>
                            <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 align-top">
                              {u.image ? (
                                <button
                                  type="button"
                                  onClick={() => setPreviewImage(upgradeProfileImageUrl(u.image) || u.image)}
                                  className="block rounded-full overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1d9bf0]"
                                  title="Profil fotoğrafını büyüt"
                                  aria-label="Profil fotoğrafını büyüt"
                                >
                                  <img src={u.image} alt="" className="w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10 rounded-full object-cover shrink-0 hover:opacity-90 cursor-zoom-in" />
                                </button>
                              ) : (
                                <span className="w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs shrink-0">?</span>
                              )}
                            </td>
                            <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-700 align-top whitespace-normal break-words">
                              {u.username ? (
                                <a
                                  href={`https://x.com/${encodeURIComponent(u.username)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[#1d9bf0] hover:underline break-all"
                                >
                                  @{u.username}
                                </a>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-700 align-top whitespace-normal break-all">{u.email ?? '—'}</td>
                            <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-700 align-top whitespace-normal break-words">{u.name ?? '—'}</td>
                            <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-700 align-top">{u.preferred_language ?? '—'}</td>
                            <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-700 align-top">{u.has_oauth_token ? 'Var' : 'Yok'}</td>
                            <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-700 whitespace-nowrap align-top">{formatDate(u.created_at)}</td>
                            <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-700 whitespace-nowrap align-top">{formatDate(u.updated_at)}</td>
                            <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 align-top">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEditUser(u)}
                                  className="p-1.5 rounded text-[#1d9bf0] hover:bg-[#1d9bf0]/10"
                                  title="Kullanıcıyı düzenle"
                                  aria-label="Düzenle"
                                >
                                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5h2m3.5 1.5l-9.5 9.5L5 19l3-2 9.5-9.5A2.12 2.12 0 0015.5 6.5z" /></svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(u)}
                                  disabled={deletingUsers}
                                  className="p-1.5 rounded text-red-600 hover:bg-red-50 disabled:opacity-50"
                                  title="Kullanıcıyı sil (soft veya kalıcı)"
                                  aria-label="Sil"
                                >
                                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl lg:rounded-2xl border border-[#1d9bf0]/30 shadow-md overflow-hidden">
              <div className="px-4 sm:px-6 lg:px-8 py-3 sm:py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base lg:text-lg font-bold text-gray-900">Misafirler (kayıtsız)</h2>
                  <p className="text-xs text-gray-500 mt-0.5">IP ve User-Agent analiz kayıtlarından; sadece giriş yapmadan analiz yapanlar.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {guests.length > 0 && !loadingUsers && (
                    <button
                      type="button"
                      onClick={toggleAllGuests}
                      className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                    >
                      {selectedGuestIps.size >= guests.length ? 'Seçimi kaldır' : 'Tümünü seç'}
                    </button>
                  )}
                  {renderBulkActions(selectedGuestIps.size, handleBulkDeleteGuests, deletingGuests, 'Seçilenleri sil')}
                </div>
              </div>
              {loadingUsers ? (
                <div className="px-4 lg:px-8 py-8 text-center text-gray-500 text-sm">Yükleniyor...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm lg:text-base min-w-[520px]">
                    <thead>
                      <tr className="bg-gray-50 text-left text-gray-600">
                        <th className="px-2 sm:px-3 py-2 sm:py-3 w-10">
                          <input
                            type="checkbox"
                            checked={guests.length > 0 && selectedGuestIps.size >= guests.length}
                            onChange={toggleAllGuests}
                            className="rounded border-gray-300"
                            aria-label="Tüm misafirleri seç"
                          />
                        </th>
                        <SortableTh
                          label="IP adresi"
                          field="client_ip"
                          sort={guestsSort}
                          onSort={(field) => setGuestsSort((prev) => nextSortState(prev, field))}
                          className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3"
                        />
                        <SortableTh
                          label="User-Agent"
                          field="user_agent"
                          sort={guestsSort}
                          onSort={(field) => setGuestsSort((prev) => nextSortState(prev, field))}
                          className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 hidden sm:table-cell"
                        />
                        <SortableTh
                          label="Analiz"
                          field="count"
                          sort={guestsSort}
                          onSort={(field) => setGuestsSort((prev) => nextSortState(prev, field))}
                          className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 w-24"
                        />
                        <SortableTh
                          label="Son görülme"
                          field="last_seen"
                          sort={guestsSort}
                          onSort={(field) => setGuestsSort((prev) => nextSortState(prev, field))}
                          className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3"
                        />
                        <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium w-12">Sil</th>
                      </tr>
                    </thead>
                    <tbody>
                      {guests.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 lg:px-8 py-12 text-center text-gray-500">Misafir kaydı yok veya IP bilgisi alınamadı.</td>
                        </tr>
                      ) : (
                        sortedGuests.map((g, i) => (
                          <tr key={`guest-${g.client_ip}-${i}`} className="border-t border-gray-100 hover:bg-gray-50/50">
                            <td className="px-2 sm:px-3 py-2 sm:py-3 align-middle">
                              <input
                                type="checkbox"
                                checked={selectedGuestIps.has(g.client_ip)}
                                onChange={() => toggleGuest(g.client_ip)}
                                className="rounded border-gray-300"
                                aria-label="Misafiri seç"
                              />
                            </td>
                            <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-700 font-mono text-xs sm:text-sm align-middle">{g.client_ip}</td>
                            <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-600 text-xs max-w-[200px] sm:max-w-[320px] truncate align-middle hidden sm:table-cell" title={g.user_agent || ''}>{g.user_agent || '—'}</td>
                            <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-700 align-middle">{g.count}</td>
                            <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-700 whitespace-nowrap align-middle">{formatDate(g.last_seen)}</td>
                            <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 align-middle">
                              <button
                                type="button"
                                onClick={() => handleDeleteGuest(g)}
                                disabled={deletingGuests}
                                className="p-1.5 rounded text-red-600 hover:bg-red-50 disabled:opacity-50"
                                title="Misafir kayıtlarını sil"
                                aria-label="Sil"
                              >
                                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'visitors' && (
          <div className="space-y-4 sm:space-y-6">
            {!visitorStats.tableReady && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Ziyaret kaydı için Supabase&apos;de <code className="bg-amber-100 px-1 rounded">013_site_visits.sql</code> ve{' '}
                <code className="bg-amber-100 px-1 rounded">019_site_visit_totals.sql</code> migration&apos;larını çalıştırın.
              </div>
            )}
            {visitorStats.serviceRoleConfigured === false && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                Vercel ortam değişkenlerine <code className="bg-red-100 px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code> ekleyin.
                RLS açıkken anon key ile ziyaret verisi okunamaz.
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 sm:gap-6 max-w-xl">
              <div className="bg-white rounded-lg sm:rounded-xl border border-[#1d9bf0]/30 shadow-md p-2 sm:p-6 min-w-0">
                <p className="text-[10px] sm:text-sm text-gray-600 mb-0.5 sm:mb-1 leading-tight">Tekil ziyaretçi</p>
                <p className="text-lg sm:text-3xl font-bold text-gray-900 tabular-nums">
                  {loadingVisitors ? '…' : visitorStats.uniqueVisitors}
                </p>
              </div>
              <div className="bg-white rounded-lg sm:rounded-xl border border-[#1d9bf0]/30 shadow-md p-2 sm:p-6 min-w-0">
                <p className="text-[10px] sm:text-sm text-gray-600 mb-0.5 sm:mb-1 leading-tight">Toplam ziyaret</p>
                <p className="text-lg sm:text-3xl font-bold text-gray-900 tabular-nums">
                  {loadingVisitors ? '…' : visitorStats.totalVisits}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              <div className="bg-white rounded-xl lg:rounded-2xl border border-[#1d9bf0]/30 shadow-md overflow-hidden">
                <div className="px-4 sm:px-6 lg:px-8 py-3 sm:py-4 border-b border-gray-100 flex items-center justify-between gap-2">
                  <h2 className="text-base lg:text-lg font-bold text-gray-900">Ziyaret edilen sayfalar</h2>
                  <span className="text-xs text-gray-500 tabular-nums">{visitorStats.pages.length} sayfa</span>
                </div>
                {loadingVisitors ? (
                  <div className="px-4 py-10 text-center text-gray-500 text-sm">Yükleniyor...</div>
                ) : visitorStats.pages.length === 0 ? (
                  <div className="px-4 py-10 text-center text-gray-500 text-sm">Henüz sayfa ziyareti yok.</div>
                ) : (
                  <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                    <table className="w-full text-sm min-w-[280px]">
                      <thead className="sticky top-0 bg-gray-50">
                        <tr className="text-left text-gray-600">
                          <SortableTh
                            label="Sayfa"
                            field="path"
                            sort={pagesSort}
                            onSort={(field) => setPagesSort((prev) => nextSortState(prev, field))}
                            className="px-3 sm:px-4 py-2"
                          />
                          <SortableTh
                            label="Ziyaret"
                            field="visits"
                            sort={pagesSort}
                            onSort={(field) => setPagesSort((prev) => nextSortState(prev, field))}
                            className="px-3 sm:px-4 py-2 w-20"
                            align="right"
                          />
                          <SortableTh
                            label="Tekil"
                            field="uniqueVisitors"
                            sort={pagesSort}
                            onSort={(field) => setPagesSort((prev) => nextSortState(prev, field))}
                            className="px-3 sm:px-4 py-2 w-20"
                            align="right"
                          />
                        </tr>
                      </thead>
                      <tbody>
                        {sortedPages.map((page) => (
                          <tr key={page.path} className="border-t border-gray-100 hover:bg-gray-50/50">
                            <td className="px-3 sm:px-4 py-2 text-gray-800 font-mono text-xs truncate max-w-[220px]" title={page.path}>
                              {page.path}
                            </td>
                            <td className="px-3 sm:px-4 py-2 text-gray-900 font-semibold text-right tabular-nums">{page.visits}</td>
                            <td className="px-3 sm:px-4 py-2 text-gray-700 text-right tabular-nums">{page.uniqueVisitors}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl lg:rounded-2xl border border-[#1d9bf0]/30 shadow-md overflow-hidden">
                <div className="px-4 sm:px-6 lg:px-8 py-3 sm:py-4 border-b border-gray-100 flex items-center justify-between gap-2">
                  <h2 className="text-base lg:text-lg font-bold text-gray-900">Referans siteler</h2>
                  <span className="text-xs text-gray-500 tabular-nums">{visitorStats.referrers.length} kaynak</span>
                </div>
                {loadingVisitors ? (
                  <div className="px-4 py-10 text-center text-gray-500 text-sm">Yükleniyor...</div>
                ) : visitorStats.referrers.length === 0 ? (
                  <div className="px-4 py-10 text-center text-gray-500 text-sm">Henüz referans verisi yok.</div>
                ) : (
                  <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                    <table className="w-full text-sm min-w-[280px]">
                      <thead className="sticky top-0 bg-gray-50">
                        <tr className="text-left text-gray-600">
                          <SortableTh
                            label="Kaynak"
                            field="label"
                            sort={referrersSort}
                            onSort={(field) => setReferrersSort((prev) => nextSortState(prev, field))}
                            className="px-3 sm:px-4 py-2"
                          />
                          <SortableTh
                            label="Ziyaret"
                            field="visits"
                            sort={referrersSort}
                            onSort={(field) => setReferrersSort((prev) => nextSortState(prev, field))}
                            className="px-3 sm:px-4 py-2 w-20"
                            align="right"
                          />
                          <SortableTh
                            label="Tekil"
                            field="uniqueVisitors"
                            sort={referrersSort}
                            onSort={(field) => setReferrersSort((prev) => nextSortState(prev, field))}
                            className="px-3 sm:px-4 py-2 w-20"
                            align="right"
                          />
                        </tr>
                      </thead>
                      <tbody>
                        {sortedReferrers.map((ref) => (
                          <tr key={`${ref.label}-${ref.referrer || 'direct'}`} className="border-t border-gray-100 hover:bg-gray-50/50">
                            <td className="px-3 sm:px-4 py-2 text-gray-700">
                              {ref.referrer ? (
                                <a
                                  href={ref.referrer}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[#1d9bf0] hover:underline truncate block max-w-[240px]"
                                  title={ref.referrer}
                                >
                                  {ref.label}
                                </a>
                              ) : (
                                <span>{ref.label}</span>
                              )}
                            </td>
                            <td className="px-3 sm:px-4 py-2 text-gray-900 font-semibold text-right tabular-nums">{ref.visits}</td>
                            <td className="px-3 sm:px-4 py-2 text-gray-700 text-right tabular-nums">{ref.uniqueVisitors}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'daily' && (
          <div className="space-y-4 sm:space-y-6">
            {!visitorStats.tableReady && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Ziyaret kaydı için Supabase&apos;de <code className="bg-amber-100 px-1 rounded">013_site_visits.sql</code> ve{' '}
                <code className="bg-amber-100 px-1 rounded">019_site_visit_totals.sql</code> migration&apos;larını çalıştırın.
              </div>
            )}
            {visitorStats.serviceRoleConfigured === false && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                Vercel ortam değişkenlerine <code className="bg-red-100 px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code> ekleyin.
                RLS açıkken anon key ile ziyaret verisi okunamaz.
              </div>
            )}

            <div className="bg-white rounded-xl lg:rounded-2xl border border-[#1d9bf0]/30 shadow-md overflow-hidden">
              <div className="px-4 sm:px-6 lg:px-8 py-3 sm:py-4 border-b border-gray-100 flex items-center justify-between gap-2">
                <h2 className="text-base lg:text-lg font-bold text-gray-900">Günlük ziyaretçi</h2>
                <span className="text-xs text-gray-500">Son 15 gün</span>
              </div>
              {loadingVisitors ? (
                <div className="px-4 py-10 text-center text-gray-500 text-sm">Yükleniyor...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[280px]">
                    <thead>
                      <tr className="bg-gray-50 text-left text-gray-600">
                        <SortableTh
                          label="Gün"
                          field="period"
                          sort={dailySort}
                          onSort={(field) => setDailySort((prev) => nextSortState(prev, field))}
                          className="px-3 sm:px-4 py-2"
                        />
                        <SortableTh
                          label="Tekil"
                          field="uniqueVisitors"
                          sort={dailySort}
                          onSort={(field) => setDailySort((prev) => nextSortState(prev, field))}
                          className="px-3 sm:px-4 py-2 w-24"
                          align="right"
                        />
                        <SortableTh
                          label="Toplam"
                          field="totalVisits"
                          sort={dailySort}
                          onSort={(field) => setDailySort((prev) => nextSortState(prev, field))}
                          className="px-3 sm:px-4 py-2 w-24"
                          align="right"
                        />
                      </tr>
                    </thead>
                    <tbody>
                      {(visitorStats.daily ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-10 text-center text-gray-500">Henüz günlük veri yok.</td>
                        </tr>
                      ) : (
                        sortedDaily.map((row) => (
                          <tr
                            key={row.period}
                            className={`border-t border-gray-100 hover:bg-gray-50/50 ${row.totalVisits === 0 ? 'text-gray-400' : ''}`}
                          >
                            <td className="px-3 sm:px-4 py-2 whitespace-nowrap text-gray-800">
                              {formatBucketLabel(row.period, 'day')}
                            </td>
                            <td className="px-3 sm:px-4 py-2 font-semibold tabular-nums text-right">{row.uniqueVisitors}</td>
                            <td className="px-3 sm:px-4 py-2 font-semibold tabular-nums text-right">{row.totalVisits}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'hidden' && (
          <div className="bg-white rounded-xl lg:rounded-2xl border border-[#1d9bf0]/30 shadow-md overflow-hidden">
            <div className="px-4 sm:px-6 lg:px-8 py-3 sm:py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base lg:text-lg font-bold text-gray-900">Soft silinenler</h2>
                <p className="text-xs text-gray-500 mt-0.5">Kamikaze listesinden gizlenen kayıtlar. Kullanıcı arşivinde durur.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                {renderHiddenPagination()}
                <label className="flex items-center gap-2 min-w-0">
                  <span className="sr-only">Filtre modu</span>
                  <select
                    value={hiddenUsernameFilterMode}
                    onChange={(e) => {
                      setHiddenUsernameFilterMode(e.target.value);
                      setHiddenPage(1);
                    }}
                    disabled={!hiddenUsernameFilter}
                    className="w-[6.5rem] sm:w-28 max-w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1d9bf0]/30 focus:border-[#1d9bf0] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="include">Göster</option>
                    <option value="exclude">Hariç tut</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 min-w-0">
                  <span className="sr-only">X kullanıcı adı filtre</span>
                  <select
                    value={hiddenUsernameFilter}
                    onChange={(e) => {
                      setHiddenUsernameFilter(e.target.value);
                      setHiddenPage(1);
                    }}
                    className="w-[9.5rem] sm:w-44 max-w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1d9bf0]/30 focus:border-[#1d9bf0]"
                  >
                    <option value="">Tümü</option>
                    {hiddenUsernameOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="text-sm font-semibold tabular-nums text-gray-700 whitespace-nowrap">
                  {hiddenPagination.totalRecentRows}
                </span>
                {hiddenLogs.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleAllHidden}
                    className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                  >
                    {allHiddenLogsSelected ? 'Seçimi kaldır' : 'Tümünü seç'}
                  </button>
                )}
                {selectedHiddenRowIds.size > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={handleBulkRestoreHidden}
                      disabled={deleting}
                      className="px-3 py-1.5 text-sm font-medium rounded-lg bg-[#1d9bf0]/10 text-[#1d9bf0] hover:bg-[#1d9bf0]/20 disabled:opacity-50"
                    >
                      {deleting ? 'İşleniyor…' : `Geri al (${selectedHiddenRowIds.size})`}
                    </button>
                    {renderBulkActions(selectedHiddenRowIds.size, handleBulkHardDeleteHidden, deleting, 'Kalıcı sil')}
                  </>
                )}
              </div>
            </div>
            {hiddenColumnMissing ? (
              <div className="px-4 lg:px-8 py-12 text-center text-gray-500 text-sm sm:text-base">
                Soft silinenleri görmek için Supabase&apos;de <code className="bg-gray-100 px-1 rounded">017_analysis_logs_admin_hidden.sql</code> dosyasını çalıştırın.
              </div>
            ) : loadingHidden ? (
              <div className="px-4 lg:px-8 py-12 text-center text-gray-500 text-sm sm:text-base">Yükleniyor...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm lg:text-base min-w-[640px]">
                  <thead>
                    <tr className="bg-gray-50 text-left text-gray-600">
                      <th className="px-2 sm:px-3 py-2 sm:py-3 w-10">
                        <input
                          type="checkbox"
                          checked={allHiddenLogsSelected}
                          onChange={toggleAllHidden}
                          className="rounded border-gray-300"
                          aria-label="Tümünü seç"
                        />
                      </th>
                      <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium">Önizleme</th>
                      <SortableTh
                        label="X"
                        field="user"
                        sort={hiddenSort}
                        onSort={handleHiddenSort}
                        className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3"
                      />
                      <SortableTh
                        label="Tarih"
                        field="created_at"
                        sort={hiddenSort}
                        onSort={handleHiddenSort}
                        className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3"
                      />
                      <SortableTh
                        label="Video linki"
                        field="url"
                        sort={hiddenSort}
                        onSort={handleHiddenSort}
                        className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3"
                      />
                      <SortableTh
                        label="Video"
                        field="video_count"
                        sort={hiddenSort}
                        onSort={handleHiddenSort}
                        className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3"
                        title="Bu linkten bulunan video adedi"
                      />
                      <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium w-24">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hiddenLogs.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 lg:px-8 py-12 text-center text-gray-500">Soft silinen kayıt yok.</td>
                      </tr>
                    ) : (
                      hiddenLogs.map((row) => (
                        <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                          <td className="px-2 sm:px-3 py-2 sm:py-3 align-middle">
                            <input
                              type="checkbox"
                              checked={selectedHiddenRowIds.has(row.id)}
                              onChange={() => toggleHiddenRow(row.id)}
                              className="rounded border-gray-300"
                              aria-label="Satırı seç"
                            />
                          </td>
                          <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 align-middle">
                            {row.thumbnail ? (
                              <button
                                type="button"
                                onClick={() => setPreviewImage(row.thumbnail)}
                                className="block rounded-lg overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1d9bf0]"
                                title="Önizlemeyi büyüt"
                                aria-label="Önizlemeyi büyüt"
                              >
                                <img src={row.thumbnail} alt="" className="w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 rounded-lg object-cover bg-gray-100 shrink-0 hover:opacity-90 cursor-zoom-in" />
                              </button>
                            ) : (
                              <span className="w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 rounded-lg bg-gray-200 flex items-center justify-center text-gray-400 text-xs shrink-0">—</span>
                            )}
                          </td>
                          <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-700 text-xs truncate max-w-[90px] sm:max-w-[160px] align-middle">
                            {row.user_username ? (
                              <a
                                href={`https://x.com/${encodeURIComponent(row.user_username)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#1d9bf0] hover:underline"
                                title={row.user_name}
                              >
                                {row.user_name}
                              </a>
                            ) : (
                              <span title={row.user_name}>{row.user_name}</span>
                            )}
                          </td>
                          <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-700 whitespace-nowrap align-middle">{formatDate(row.created_at)}</td>
                          <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 max-w-[140px] sm:max-w-none align-middle">
                            {row.url ? (
                              <a
                                href={row.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#1d9bf0] hover:text-[#1d9bf0] font-mono text-xs sm:text-sm block truncate sm:truncate-none sm:break-all sm:whitespace-normal"
                                title={row.url}
                              >
                                <span className="sm:hidden">
                                  {row.url.replace(/^https?:\/\//, '').length > 40
                                    ? `${row.url.replace(/^https?:\/\//, '').slice(0, 37)}…`
                                    : row.url.replace(/^https?:\/\//, '')}
                                </span>
                                <span className="hidden sm:inline">{row.url}</span>
                              </a>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-700 align-middle">{row.video_count ?? 0}</td>
                          <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 align-middle">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleRestoreHiddenRow(row)}
                                disabled={deleting}
                                className="p-1.5 rounded text-[#1d9bf0] hover:bg-[#1d9bf0]/10 disabled:opacity-50"
                                title="İstatistiklere geri al"
                                aria-label="Geri al"
                              >
                                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a4 4 0 014 4v2M3 10l4-4M3 10l4 4" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleHardDeleteHiddenRow(row)}
                                disabled={deleting}
                                className="p-1.5 rounded text-red-600 hover:bg-red-50 disabled:opacity-50"
                                title="Kalıcı sil"
                                aria-label="Kalıcı sil"
                              >
                                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {hiddenPagination.totalPages > 1 && !hiddenColumnMissing && (
              <div className="px-4 sm:px-6 lg:px-8 py-3 sm:py-4 border-t border-gray-100 flex flex-wrap items-center justify-center">
                {renderHiddenPagination()}
              </div>
            )}
          </div>
        )}

      </main>
      {previewImage ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Önizleme"
          className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setPreviewImage(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewImage(null)}
            className="absolute top-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition"
            aria-label="Kapat"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <img
            src={previewImage}
            alt=""
            className="max-w-[min(960px,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] w-auto h-auto rounded-xl object-contain shadow-2xl bg-black"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
      {editingUser ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-user-title"
          className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => {
            if (!savingUser) setEditingUser(null);
          }}
        >
          <form
            onSubmit={saveEditedUser}
            onClick={(event) => event.stopPropagation()}
            className="bg-white rounded-2xl p-5 sm:p-6 shadow-xl max-w-md w-full border-2 border-[#1d9bf0]/30 space-y-4"
          >
            <div>
              <h3 id="edit-user-title" className="text-lg font-bold text-gray-900">Kullanıcıyı düzenle</h3>
              <p className="text-xs text-gray-500 mt-1 break-all">ID: {editingUser.id}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">X kullanıcı adı</p>
              <p className="mt-1 text-sm text-gray-900 break-all">{editingUser.username ? `@${editingUser.username}` : '—'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">E-posta</p>
              <p className="mt-1 text-sm text-gray-900 break-all">{editingUser.email || '—'}</p>
            </div>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Ad</span>
              <input
                type="text"
                value={editingUser.name}
                onChange={(e) => setEditingUser((prev) => ({ ...prev, name: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#1d9bf0] focus:ring-2 focus:ring-[#1d9bf0]/30"
                maxLength={200}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Dil</span>
              <select
                value={editingUser.preferred_language || 'en'}
                onChange={(e) => setEditingUser((prev) => ({ ...prev, preferred_language: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#1d9bf0] focus:ring-2 focus:ring-[#1d9bf0]/30"
              >
                <option value="en">EN</option>
                <option value="tr">TR</option>
                <option value="de">DE</option>
                <option value="es">ES</option>
              </select>
            </label>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                disabled={savingUser}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                İptal
              </button>
              <button
                type="submit"
                disabled={savingUser}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#1d9bf0] hover:bg-[#1686d4] text-white disabled:opacity-50"
              >
                {savingUser ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      <ConfirmToast
        open={Boolean(confirmDialog)}
        message={confirmDialog?.message}
        detail={confirmDialog?.detail}
        onConfirm={() => runConfirmAction(confirmDialog?.onConfirm)}
        onSoftConfirm={confirmDialog?.onSoftConfirm ? () => runConfirmAction(confirmDialog.onSoftConfirm) : undefined}
        onHardConfirm={confirmDialog?.onHardConfirm ? () => runConfirmAction(confirmDialog.onHardConfirm) : undefined}
        onCancel={closeConfirm}
        confirmLabel={confirmDialog?.confirmLabel}
        confirming={deleting || deletingUsers || deletingGuests}
      />
    </div>
  );
}
