export function formatBytesLabel(bytes, locale = 'en') {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return null;
  const mb = bytes / (1024 * 1024);
  let raw;
  if (mb >= 100) raw = String(Math.round(mb));
  else if (mb >= 10) raw = mb.toFixed(1);
  else raw = mb.toFixed(2);
  if (locale !== 'en') raw = raw.replace('.', ',');
  return `${raw} MB`;
}

export function formatTotalSizeLabel(bytes, { probing = false, locale = 'en' } = {}) {
  const prefix = locale === 'tr' ? 'Toplam' : locale === 'de' ? 'Gesamt' : 'Total';
  const size = formatBytesLabel(bytes, locale);
  if (probing && !size) return `${prefix}: …`;
  if (!size) return null;
  return probing ? `${prefix}: ${size}…` : `${prefix}: ${size}`;
}
