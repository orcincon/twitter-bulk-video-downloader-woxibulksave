'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { formatBucketLabel } from '@/lib/visitor-stats.js';
import ConfirmToast from '@/components/ConfirmToast.js';

export default function KamikazePage() {
  const [status, setStatus] = useState('loading'); // 'loading' | 'login' | 'dashboard' | 'error' | 'not_configured'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [stats, setStats] = useState({ totalLogs: 0, totalUsers: 0, usersWithOAuthToken: 0, recentLogs: [] });
  const [loadingStats, setLoadingStats] = useState(true);
  const [activeTab, setActiveTab] = useState('stats'); // 'stats' | 'users' | 'visitors'
  const [users, setUsers] = useState([]);
  const [guests, setGuests] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState(new Set());
  const [selectedUserIds, setSelectedUserIds] = useState(new Set());
  const [selectedGuestIps, setSelectedGuestIps] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deletingUsers, setDeletingUsers] = useState(false);
  const [deletingGuests, setDeletingGuests] = useState(false);
  const [actionError, setActionError] = useState('');
  const [visitorGranularity, setVisitorGranularity] = useState('day');
  const [visitorStats, setVisitorStats] = useState({
    uniqueVisitors: 0,
    totalVisits: 0,
    breakdown: [],
    usingAnalysisFallback: false,
    tableReady: true,
    serviceRoleConfigured: true,
    referrers: [],
    recentVisits: [],
  });
  const [loadingVisitors, setLoadingVisitors] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const openConfirm = (message, onConfirm) => {
    setConfirmDialog({ message, onConfirm });
  };

  const closeConfirm = () => {
    setConfirmDialog(null);
  };

  const handleConfirmAction = async () => {
    if (!confirmDialog?.onConfirm) return;
    await confirmDialog.onConfirm();
    closeConfirm();
  };

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const res = await fetch('/api/kamikaze/stats', { credentials: 'include' });
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
      setStatus('dashboard');
    } catch {
      setStatus('error');
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

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

  const loadVisitors = useCallback(async (granularity) => {
    setLoadingVisitors(true);
    try {
      const res = await fetch(`/api/kamikaze/visitors?granularity=${granularity}`, { credentials: 'include' });
      if (res.status === 401) {
        setStatus('login');
        return;
      }
      if (!res.ok) {
        setVisitorStats({
          uniqueVisitors: 0,
          totalVisits: 0,
          breakdown: [],
          usingAnalysisFallback: false,
          tableReady: false,
          serviceRoleConfigured: true,
          referrers: [],
          recentVisits: [],
        });
        return;
      }
      const data = await res.json();
      setVisitorStats({
        uniqueVisitors: data.uniqueVisitors ?? 0,
        totalVisits: data.totalVisits ?? 0,
        breakdown: data.breakdown ?? [],
        usingAnalysisFallback: Boolean(data.usingAnalysisFallback),
        tableReady: data.tableReady !== false,
        serviceRoleConfigured: data.serviceRoleConfigured !== false,
        referrers: data.referrers ?? [],
        recentVisits: data.recentVisits ?? [],
      });
    } catch {
      setVisitorStats({
        uniqueVisitors: 0,
        totalVisits: 0,
        breakdown: [],
        usingAnalysisFallback: false,
        tableReady: false,
        serviceRoleConfigured: true,
        referrers: [],
        recentVisits: [],
      });
    } finally {
      setLoadingVisitors(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'dashboard' && activeTab === 'visitors') loadVisitors(visitorGranularity);
  }, [status, activeTab, visitorGranularity, loadVisitors]);

  useEffect(() => {
    setActionError('');
    if (activeTab === 'stats') {
      setSelectedUserIds(new Set());
      setSelectedGuestIps(new Set());
    } else if (activeTab === 'users') {
      setSelectedRowIds(new Set());
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

  const toggleAll = () => {
    if (selectedRowIds.size >= stats.recentLogs.length) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(new Set(stats.recentLogs.map((r) => r.id)));
    }
  };

  const deleteLogs = async (logIds) => {
    if (!logIds.length) return;
    setDeleting(true);
    setActionError('');
    try {
      const res = await fetch('/api/kamikaze/logs/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ log_ids: logIds }),
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setSelectedRowIds(new Set());
        await loadStats();
      } else {
        setActionError('Analiz silinemedi.');
      }
    } catch {
      setActionError('Bağlantı hatası.');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteRow = (row) => {
    openConfirm('Bu kayıt silinecek. Emin misiniz?', () => deleteLogs([row.log_id]));
  };

  const handleBulkDelete = () => {
    const logIds = [...new Set(stats.recentLogs.filter((r) => selectedRowIds.has(r.id)).map((r) => r.log_id))];
    if (!logIds.length) return;
    openConfirm(`${logIds.length} analiz silinecek. Emin misiniz?`, () => deleteLogs(logIds));
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

  const deleteUsers = async (userIds) => {
    if (!userIds.length) return;
    setDeletingUsers(true);
    setActionError('');
    try {
      const res = await fetch('/api/kamikaze/users/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_ids: userIds }),
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
    openConfirm(`"${user.email || user.id}" kullanıcısı ve analiz geçmişi silinecek. Emin misiniz?`, () => deleteUsers([user.id]));
  };

  const handleBulkDeleteUsers = () => {
    const userIds = [...selectedUserIds];
    if (!userIds.length) return;
    openConfirm(`${userIds.length} kullanıcı ve analiz geçmişleri silinecek. Emin misiniz?`, () => deleteUsers(userIds));
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
    openConfirm(`${guest.client_ip} IP adresine ait misafir analizleri silinecek. Emin misiniz?`, () => deleteGuests([guest.client_ip]));
  };

  const handleBulkDeleteGuests = () => {
    const clientIps = [...selectedGuestIps];
    if (!clientIps.length) return;
    openConfirm(`${clientIps.length} misafir IP kaydı ve ilgili analizler silinecek. Emin misiniz?`, () => deleteGuests(clientIps));
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
            onClick={() => { setStatus('loading'); setLoadingStats(true); loadStats(); }}
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
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 flex gap-0 sm:gap-1">
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
                <p className="text-lg sm:text-3xl lg:text-4xl font-bold text-gray-900 tabular-nums">{stats.totalLogs}</p>
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
                <div className="flex flex-wrap items-center gap-2">
                  {stats.recentLogs.length > 0 && (
                    <button
                      type="button"
                      onClick={toggleAll}
                      className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                    >
                      {selectedRowIds.size >= stats.recentLogs.length ? 'Seçimi kaldır' : 'Tümünü seç'}
                    </button>
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
                          checked={stats.recentLogs.length > 0 && selectedRowIds.size >= stats.recentLogs.length}
                          onChange={toggleAll}
                          className="rounded border-gray-300"
                          aria-label="Tümünü seç"
                        />
                      </th>
                      <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium">Önizleme</th>
                      <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium">Ad</th>
                      <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium">Tarih</th>
                      <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium">Video linki</th>
                      <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium" title="Bu linkten bulunan video adedi">Video</th>
                      <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium w-12">Sil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentLogs.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 lg:px-8 py-12 text-center text-gray-500">Henüz kayıt yok.</td>
                      </tr>
                    ) : (
                      stats.recentLogs.map((row) => (
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
                              <img src={row.thumbnail} alt="" className="w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 rounded-lg object-cover bg-gray-100 shrink-0" />
                            ) : (
                              <span className="w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 rounded-lg bg-gray-200 flex items-center justify-center text-gray-400 text-xs shrink-0">—</span>
                            )}
                          </td>
                          <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-700 text-xs truncate max-w-[90px] sm:max-w-[160px] align-middle" title={row.user_name}>{row.user_name}</td>
                          <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-700 whitespace-nowrap align-middle">{formatDate(row.created_at)}</td>
                          <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 max-w-[140px] sm:max-w-[200px] lg:max-w-[280px] align-middle">
                            {row.url ? (
                              <a href={row.url} target="_blank" rel="noopener noreferrer" className="text-[#1d9bf0] hover:text-[#1d9bf0] truncate block font-mono text-xs sm:text-sm" title={row.url}>
                                {(row.url.replace(/^https?:\/\//, '').length > 40 ? row.url.replace(/^https?:\/\//, '').slice(0, 37) + '…' : row.url.replace(/^https?:\/\//, ''))}
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
                              title="Bu kaydı sil"
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
            </div>
          </>
        )}

        {activeTab === 'users' && (
          <div className="space-y-6 lg:space-y-8">
            <div className="bg-white rounded-xl lg:rounded-2xl border border-[#1d9bf0]/30 shadow-md overflow-hidden">
              <div className="px-4 sm:px-6 lg:px-8 py-3 sm:py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base lg:text-lg font-bold text-gray-900">Kayıtlı kullanıcılar</h2>
                <div className="flex flex-wrap items-center gap-2">
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
                  <table className="w-full text-sm lg:text-base min-w-[640px]">
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
                        <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium">Profil</th>
                        <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium">E-posta</th>
                        <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium hidden lg:table-cell">Ad</th>
                        <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium hidden md:table-cell">Dil</th>
                        <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium hidden md:table-cell">OAuth</th>
                        <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium">Kayıt</th>
                        <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium hidden xl:table-cell">Güncelleme</th>
                        <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium w-12">Sil</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-4 lg:px-8 py-12 text-center text-gray-500">Kayıtlı kullanıcı yok.</td>
                        </tr>
                      ) : (
                        users.map((u) => (
                          <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                            <td className="px-2 sm:px-3 py-2 sm:py-3 align-middle">
                              <input
                                type="checkbox"
                                checked={selectedUserIds.has(u.id)}
                                onChange={() => toggleUser(u.id)}
                                className="rounded border-gray-300"
                                aria-label="Kullanıcıyı seç"
                              />
                            </td>
                            <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 align-middle">
                              {u.image ? (
                                <img src={u.image} alt="" className="w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10 rounded-full object-cover shrink-0" />
                              ) : (
                                <span className="w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs shrink-0">?</span>
                              )}
                            </td>
                            <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-700 truncate max-w-[120px] sm:max-w-[180px] align-middle">{u.email ?? '—'}</td>
                            <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-700 truncate max-w-[100px] align-middle hidden lg:table-cell">{u.name ?? '—'}</td>
                            <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-700 align-middle hidden md:table-cell">{u.preferred_language ?? '—'}</td>
                            <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-700 align-middle hidden md:table-cell">{u.has_oauth_token ? 'Var' : 'Yok'}</td>
                            <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-700 whitespace-nowrap align-middle">{formatDate(u.created_at)}</td>
                            <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-700 whitespace-nowrap align-middle hidden xl:table-cell">{formatDate(u.updated_at)}</td>
                            <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 align-middle">
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u)}
                                disabled={deletingUsers}
                                className="p-1.5 rounded text-red-600 hover:bg-red-50 disabled:opacity-50"
                                title="Kullanıcıyı sil"
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
                        <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium">IP adresi</th>
                        <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium hidden sm:table-cell">User-Agent</th>
                        <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium w-24">Analiz</th>
                        <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium">Son görülme</th>
                        <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium w-12">Sil</th>
                      </tr>
                    </thead>
                    <tbody>
                      {guests.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 lg:px-8 py-12 text-center text-gray-500">Misafir kaydı yok veya IP bilgisi alınamadı.</td>
                        </tr>
                      ) : (
                        guests.map((g, i) => (
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-lg border border-[#1d9bf0]/30 bg-white p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => setVisitorGranularity('day')}
                  className={`px-3 sm:px-4 py-1.5 text-sm font-medium rounded-md transition ${visitorGranularity === 'day' ? 'bg-[#1d9bf0] text-white' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  Günlük
                </button>
                <button
                  type="button"
                  onClick={() => setVisitorGranularity('week')}
                  className={`px-3 sm:px-4 py-1.5 text-sm font-medium rounded-md transition ${visitorGranularity === 'week' ? 'bg-[#1d9bf0] text-white' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  Haftalık
                </button>
              </div>
              <p className="text-xs text-gray-500">
                {visitorGranularity === 'day' ? 'Son 14 gün' : 'Son 8 hafta'}
                {visitorStats.usingAnalysisFallback ? ' · Analiz kayıtlarından (geçmiş)' : ''}
                {visitorStats.tableReady === false ? ' · site_visits tablosu yok — migration 013/014 çalıştırın' : ''}
              </p>
            </div>

            {!visitorStats.tableReady && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Ziyaret kaydı için Supabase&apos;de <code className="bg-amber-100 px-1 rounded">013_site_visits.sql</code> ve{' '}
                <code className="bg-amber-100 px-1 rounded">014_site_visits_referrer_rls.sql</code> dosyalarını çalıştırın.
                Ana sayfa ve diğer sayfalar sayılır. <code className="bg-amber-100 px-1 rounded">/kamikaze</code> ve Kamikaze oturumunuz açıkken yapılan ziyaretler sayılmaz.
              </div>
            )}

            {visitorStats.serviceRoleConfigured === false && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                Vercel ortam değişkenlerine <code className="bg-red-100 px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code> ekleyin.
                RLS açıkken anon key ile ziyaret kaydı yazılamaz; tüm sayılar sıfır kalır.
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 sm:gap-6 max-w-xl">
              <div className="bg-white rounded-lg sm:rounded-xl border border-[#1d9bf0]/30 shadow-md p-2 sm:p-6 min-w-0">
                <p className="text-[10px] sm:text-sm text-gray-600 mb-0.5 sm:mb-1 leading-tight">Tekil ziyaretçi</p>
                <p className="text-lg sm:text-3xl font-bold text-gray-900 tabular-nums">{loadingVisitors ? '…' : visitorStats.uniqueVisitors}</p>
              </div>
              <div className="bg-white rounded-lg sm:rounded-xl border border-[#1d9bf0]/30 shadow-md p-2 sm:p-6 min-w-0">
                <p className="text-[10px] sm:text-sm text-gray-600 mb-0.5 sm:mb-1 leading-tight">Toplam ziyaret</p>
                <p className="text-lg sm:text-3xl font-bold text-gray-900 tabular-nums">{loadingVisitors ? '…' : visitorStats.totalVisits}</p>
              </div>
            </div>

            <div className="bg-white rounded-xl lg:rounded-2xl border border-[#1d9bf0]/30 shadow-md overflow-hidden">
              <h2 className="text-base lg:text-lg font-bold text-gray-900 px-4 sm:px-6 lg:px-8 py-3 sm:py-4 border-b border-gray-100">
                {visitorGranularity === 'day' ? 'Günlük dağılım' : 'Haftalık dağılım'}
              </h2>
              {loadingVisitors ? (
                <div className="px-4 lg:px-8 py-12 text-center text-gray-500 text-sm">Yükleniyor...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm lg:text-base min-w-[320px]">
                    <thead>
                      <tr className="bg-gray-50 text-left text-gray-600">
                        <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium">{visitorGranularity === 'day' ? 'Gün' : 'Hafta'}</th>
                        <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium w-28">Tekil</th>
                        <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium w-28">Toplam</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visitorStats.breakdown.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 lg:px-8 py-12 text-center text-gray-500">Henüz ziyaret verisi yok.</td>
                        </tr>
                      ) : (
                        visitorStats.breakdown.map((row) => (
                          <tr key={row.period} className="border-t border-gray-100 hover:bg-gray-50/50">
                            <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-700 whitespace-nowrap">{formatBucketLabel(row.period, visitorGranularity)}</td>
                            <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-900 font-semibold tabular-nums">{row.uniqueVisitors}</td>
                            <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-900 font-semibold tabular-nums">{row.totalVisits}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              <div className="bg-white rounded-xl lg:rounded-2xl border border-[#1d9bf0]/30 shadow-md overflow-hidden">
                <h2 className="text-base lg:text-lg font-bold text-gray-900 px-4 sm:px-6 lg:px-8 py-3 sm:py-4 border-b border-gray-100">Referans kaynakları</h2>
                {loadingVisitors ? (
                  <div className="px-4 py-10 text-center text-gray-500 text-sm">Yükleniyor...</div>
                ) : visitorStats.referrers.length === 0 ? (
                  <div className="px-4 py-10 text-center text-gray-500 text-sm">Henüz referans verisi yok.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[280px]">
                      <thead>
                        <tr className="bg-gray-50 text-left text-gray-600">
                          <th className="px-3 sm:px-4 py-2 font-medium">Kaynak</th>
                          <th className="px-3 sm:px-4 py-2 font-medium w-20 text-right">Ziyaret</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visitorStats.referrers.map((ref) => (
                          <tr key={ref.label} className="border-t border-gray-100">
                            <td className="px-3 sm:px-4 py-2 text-gray-700">
                              {ref.referrer ? (
                                <a href={ref.referrer} target="_blank" rel="noopener noreferrer" className="text-[#1d9bf0] hover:underline truncate block max-w-[240px]" title={ref.referrer}>
                                  {ref.label}
                                </a>
                              ) : (
                                <span>{ref.label}</span>
                              )}
                            </td>
                            <td className="px-3 sm:px-4 py-2 text-gray-900 font-semibold text-right tabular-nums">{ref.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl lg:rounded-2xl border border-[#1d9bf0]/30 shadow-md overflow-hidden">
                <h2 className="text-base lg:text-lg font-bold text-gray-900 px-4 sm:px-6 lg:px-8 py-3 sm:py-4 border-b border-gray-100">Son ziyaretler</h2>
                {loadingVisitors ? (
                  <div className="px-4 py-10 text-center text-gray-500 text-sm">Yükleniyor...</div>
                ) : visitorStats.recentVisits.length === 0 ? (
                  <div className="px-4 py-10 text-center text-gray-500 text-sm">Henüz ziyaret kaydı yok.</div>
                ) : (
                  <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                    <table className="w-full text-sm min-w-[320px]">
                      <thead className="sticky top-0 bg-gray-50">
                        <tr className="text-left text-gray-600">
                          <th className="px-3 sm:px-4 py-2 font-medium">Tarih</th>
                          <th className="px-3 sm:px-4 py-2 font-medium">Sayfa</th>
                          <th className="px-3 sm:px-4 py-2 font-medium">Referans</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visitorStats.recentVisits.map((v, i) => (
                          <tr key={`${v.created_at}-${i}`} className="border-t border-gray-100">
                            <td className="px-3 sm:px-4 py-2 text-gray-600 whitespace-nowrap text-xs">{formatDate(v.created_at)}</td>
                            <td className="px-3 sm:px-4 py-2 text-gray-700 font-mono text-xs truncate max-w-[100px]" title={v.path}>{v.path}</td>
                            <td className="px-3 sm:px-4 py-2 text-gray-700 text-xs truncate max-w-[140px]" title={v.referrer || ''}>
                              {v.referrer ? (
                                <a href={v.referrer} target="_blank" rel="noopener noreferrer" className="text-[#1d9bf0] hover:underline">
                                  {v.referrerLabel}
                                </a>
                              ) : (
                                v.referrerLabel
                              )}
                            </td>
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
      </main>
      <ConfirmToast
        open={Boolean(confirmDialog)}
        message={confirmDialog?.message}
        onConfirm={handleConfirmAction}
        onCancel={closeConfirm}
        confirming={deleting || deletingUsers || deletingGuests}
      />
    </div>
  );
}
