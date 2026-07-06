function formatDatePart(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/** 3, 4 veya 5 haneli rastgele sayı */
function randomDigits() {
  const len = 3 + Math.floor(Math.random() * 3);
  const min = 10 ** (len - 1);
  const max = 10 ** len - 1;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

/** Örnek: WBS-202607061482.mp4 */
export function buildDownloadFileName(ext = 'mp4') {
  const cleanExt = String(ext || 'mp4').replace(/^\./, '').toLowerCase();
  return `WBS-${formatDatePart()}${randomDigits()}.${cleanExt}`;
}

/** Örnek: WBS-202607061482.zip */
export function buildZipFileName() {
  return `WBS-${formatDatePart()}${randomDigits()}.zip`;
}
