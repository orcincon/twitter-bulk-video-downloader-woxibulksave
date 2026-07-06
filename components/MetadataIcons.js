'use client';

function formatCompact(n) {
  if (n == null || typeof n !== 'number' || n < 0) return null;
  if (n < 1000) return String(n);
  if (n < 1000000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
}

function formatDuration(sec) {
  if (sec == null || typeof sec !== 'number' || sec < 0) return null;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDateShort(created_at, created_timestamp) {
  if (created_timestamp != null && typeof created_timestamp === 'number') {
    const d = new Date(created_timestamp * 1000);
    return `${d.getDate()} ${d.toLocaleString('en', { month: 'short' })} ${d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  }
  if (typeof created_at === 'string') {
    try {
      const d = new Date(created_at);
      if (!isNaN(d.getTime())) return `${d.getDate()} ${d.toLocaleString('en', { month: 'short' })} ${d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
    } catch (_) {}
  }
  return null;
}

export default function MetadataIcons({ durationSec, likes, retweets, views, created_at, created_timestamp, className = '' }) {
  const items = [];
  if (durationSec != null && durationSec > 0) items.push({ icon: '⏱️', value: formatDuration(durationSec) });
  if (likes != null && likes >= 0) items.push({ icon: '❤️', value: formatCompact(likes) });
  if (retweets != null && retweets >= 0) items.push({ icon: '🔄', value: formatCompact(retweets) });
  if (views != null && views >= 0) items.push({ icon: '👁️', value: formatCompact(views) });
  const dateStr = formatDateShort(created_at, created_timestamp);
  if (dateStr) items.push({ icon: '🕐', value: dateStr });

  if (items.length === 0) return <span className="text-gray-400 text-[12px]">—</span>;

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-gray-600 ${className}`}>
      {items.map(({ icon, value }, i) => (
        <span key={i} className="flex items-center gap-1" title={value}>
          <span aria-hidden>{icon}</span>
          <span>{value}</span>
        </span>
      ))}
    </div>
  );
}
