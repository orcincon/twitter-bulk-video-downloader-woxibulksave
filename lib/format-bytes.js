function formatNumber(value, locale) {
  let raw;
  if (value >= 100) raw = String(Math.round(value));
  else if (value >= 10) raw = value.toFixed(1);
  else raw = value.toFixed(2);
  if (locale !== 'en') raw = raw.replace('.', ',');
  return raw;
}

export function formatBytesLabel(bytes, locale = 'en') {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return null;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1000) {
    return `${formatNumber(mb / 1024, locale)} GB`;
  }
  return `${formatNumber(mb, locale)} MB`;
}

export function formatTotalSizeLabel(bytes, { probing = false, locale = 'en' } = {}) {
  const prefix = locale === 'tr' ? 'Toplam' : locale === 'de' ? 'Gesamt' : 'Total';
  const size = formatBytesLabel(bytes, locale);
  if (probing && !size) return `${prefix}: …`;
  if (!size) return null;
  return probing ? `${prefix}: ${size}…` : `${prefix}: ${size}`;
}
