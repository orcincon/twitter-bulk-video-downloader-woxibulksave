'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function KamikazePage() {
  const [status, setStatus] = useState('loading'); // 'loading' | 'login' | 'dashboard' | 'error' | 'not_configured'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [stats, setStats] = useState({ totalLogs: 0, totalUsers: 0, usersWithOAuthToken: 0, recentLogs: [] });
  const [loadingStats, setLoadingStats] = useState(true);
  const [activeTab, setActiveTab] = useState('stats'); // 'stats' | 'users'
  const [users, setUsers] = useState([]);
  const [guests, setGuests] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);

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
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteRow = (row) => {
    if (!window.confirm('Bu kayıt silinecek. Emin misiniz?')) return;
    deleteLogs([row.log_id]);
  };

  const handleBulkDelete = () => {
    const logIds = [...new Set(stats.recentLogs.filter((r) => selectedRowIds.has(r.id)).map((r) => r.log_id))];
    if (!logIds.length) return;
    if (!window.confirm(`${logIds.length} analiz silinecek. Emin misiniz?`)) return;
    deleteLogs(logIds);
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
        </div>
      </nav>

      <main className="flex-grow w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
        {activeTab === 'stats' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 lg:gap-8 mb-6 sm:mb-8 lg:mb-10">
              <div className="bg-white rounded-xl lg:rounded-2xl border border-[#1d9bf0]/30 shadow-md p-5 sm:p-6 lg:p-8">
                <p className="text-sm text-gray-600 mb-1">Toplam analiz</p>
                <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">{stats.totalLogs}</p>
              </div>
              <div className="bg-white rounded-xl lg:rounded-2xl border border-[#1d9bf0]/30 shadow-md p-5 sm:p-6 lg:p-8">
                <p className="text-sm text-gray-600 mb-1">Kayıtlı kullanıcı</p>
                <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">{stats.totalUsers}</p>
              </div>
              <div className="bg-white rounded-xl lg:rounded-2xl border border-[#1d9bf0]/30 shadow-md p-5 sm:p-6 lg:p-8">
                <p className="text-sm text-gray-600 mb-1">OAuth token&apos;lı kullanıcı</p>
                <p className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">{stats.usersWithOAuthToken}</p>
                <p className="text-xs text-gray-500 mt-1">X girişinde kaydedilen havuz token&apos;ı</p>
              </div>
            </div>

            <div className="bg-white rounded-xl lg:rounded-2xl border border-[#1d9bf0]/30 shadow-md overflow-hidden">
              <div className="px-4 sm:px-6 lg:px-8 py-3 sm:py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base lg:text-lg font-bold text-gray-900">Son analizler</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Her satır = bir X linki. Video = o linkten bulunan video adedi.</p>
                </div>
                {selectedRowIds.size > 0 && (
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    disabled={deleting}
                    className="px-3 py-1.5 text-sm font-medium rounded-lg bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                  >
                    {deleting ? 'Siliniyor…' : `Seçilenleri sil (${selectedRowIds.size})`}
                  </button>
                )}
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
                      <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium">Video linki</th>
                      <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium">Tarih</th>
                      <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium hidden md:table-cell">Kullanıcı</th>
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
                          <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 max-w-[140px] sm:max-w-[200px] lg:max-w-[280px] align-middle">
                            {row.url ? (
                              <a href={row.url} target="_blank" rel="noopener noreferrer" className="text-[#1d9bf0] hover:text-[#1d9bf0] truncate block font-mono text-xs sm:text-sm" title={row.url}>
                                {(row.url.replace(/^https?:\/\//, '').length > 40 ? row.url.replace(/^https?:\/\//, '').slice(0, 37) + '…' : row.url.replace(/^https?:\/\//, ''))}
                              </a>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-700 whitespace-nowrap align-middle">{formatDate(row.created_at)}</td>
                          <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-700 font-mono text-xs truncate max-w-[90px] md:max-w-[120px] align-middle hidden md:table-cell" title={row.user_id}>{row.user_id === 'guest' ? 'Misafir' : row.user_id}</td>
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
              <h2 className="text-base lg:text-lg font-bold text-gray-900 px-4 sm:px-6 lg:px-8 py-3 sm:py-4 border-b border-gray-100">Kayıtlı kullanıcılar</h2>
              {loadingUsers ? (
                <div className="px-4 lg:px-8 py-12 text-center text-gray-500 text-sm sm:text-base">Yükleniyor...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm lg:text-base min-w-[640px]">
                    <thead>
                      <tr className="bg-gray-50 text-left text-gray-600">
                        <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium">Profil</th>
                        <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium">E-posta</th>
                        <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium hidden lg:table-cell">Ad</th>
                        <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium hidden md:table-cell">Dil</th>
                        <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium hidden md:table-cell">OAuth</th>
                        <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium">Kayıt</th>
                        <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium hidden xl:table-cell">Güncelleme</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 lg:px-8 py-12 text-center text-gray-500">Kayıtlı kullanıcı yok.</td>
                        </tr>
                      ) : (
                        users.map((u) => (
                          <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50/50">
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
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl lg:rounded-2xl border border-[#1d9bf0]/30 shadow-md overflow-hidden">
              <h2 className="text-base lg:text-lg font-bold text-gray-900 px-4 sm:px-6 lg:px-8 py-3 sm:py-4 border-b border-gray-100">Misafirler (kayıtsız)</h2>
              <p className="text-xs text-gray-500 px-4 sm:px-6 lg:px-8 pb-2">IP ve User-Agent analiz kayıtlarından; sadece giriş yapmadan analiz yapanlar.</p>
              {loadingUsers ? (
                <div className="px-4 lg:px-8 py-8 text-center text-gray-500 text-sm">Yükleniyor...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm lg:text-base min-w-[520px]">
                    <thead>
                      <tr className="bg-gray-50 text-left text-gray-600">
                        <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium">IP adresi</th>
                        <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium hidden sm:table-cell">User-Agent</th>
                        <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium w-24">Analiz</th>
                        <th className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 font-medium">Son görülme</th>
                      </tr>
                    </thead>
                    <tbody>
                      {guests.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 lg:px-8 py-12 text-center text-gray-500">Misafir kaydı yok veya IP bilgisi alınamadı.</td>
                        </tr>
                      ) : (
                        guests.map((g, i) => (
                          <tr key={`guest-${g.client_ip}-${i}`} className="border-t border-gray-100 hover:bg-gray-50/50">
                            <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-700 font-mono text-xs sm:text-sm align-middle">{g.client_ip}</td>
                            <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-600 text-xs max-w-[200px] sm:max-w-[320px] truncate align-middle hidden sm:table-cell" title={g.user_agent || ''}>{g.user_agent || '—'}</td>
                            <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-700 align-middle">{g.count}</td>
                            <td className="px-3 sm:px-4 lg:px-6 py-2 sm:py-3 text-gray-700 whitespace-nowrap align-middle">{formatDate(g.last_seen)}</td>
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
      </main>
    </div>
  );
}
