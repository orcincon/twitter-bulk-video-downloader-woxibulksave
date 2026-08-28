'use client';

function formatMb(bytes, lang = 'en') {
  const mb = Math.max(0, Number(bytes) || 0) / (1024 * 1024);
  const digits = mb < 1 ? 2 : 1;
  const locale = lang === 'tr' ? 'tr-TR' : lang === 'de' ? 'de-DE' : lang === 'es' ? 'es-ES' : 'en-US';
  return `${mb.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })} MB`;
}

export default function SaveProgressModal({
  open,
  title,
  percent,
  loadedBytes,
  totalBytes,
  currentFile = 0,
  fileCount = 0,
  lang,
  paused = false,
  onPause,
  onResume,
  onCancel,
}) {
  if (!open) return null;
  const clamped = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  const loadedLabel = lang === 'tr' ? 'İnen' : lang === 'de' ? 'Geladen' : lang === 'es' ? 'Descargado' : 'Downloaded';
  const totalLabel = lang === 'tr' ? 'Toplam' : lang === 'de' ? 'Gesamt' : lang === 'es' ? 'Total' : 'Total';
  const pauseLabel = lang === 'tr' ? 'Durdur' : lang === 'de' ? 'Pause' : lang === 'es' ? 'Pausar' : 'Pause';
  const resumeLabel = lang === 'tr' ? 'Devam et' : lang === 'de' ? 'Fortsetzen' : lang === 'es' ? 'Reanudar' : 'Resume';
  const cancelLabel = lang === 'tr' ? 'İptal' : lang === 'de' ? 'Abbrechen' : lang === 'es' ? 'Cancelar' : 'Cancel';
  const filesLabel = lang === 'tr' ? 'dosya' : lang === 'de' ? 'Dateien' : lang === 'es' ? 'archivos' : 'files';
  const showFileCount = fileCount > 1;
  const showControls = typeof onPause === 'function' || typeof onCancel === 'function';
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-progress-title"
      aria-busy={!paused}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
    >
      <div className="bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full border-2 border-[#1d9bf0]/40">
        <p id="save-progress-title" className={`text-gray-800 text-base font-semibold text-center ${showFileCount ? 'mb-1' : 'mb-4'}`}>
          {title}
        </p>
        {showFileCount ? (
          <p className="text-sm text-gray-500 tabular-nums text-center mb-4">
            {currentFile} / {fileCount} {filesLabel}
          </p>
        ) : null}
        <div className="flex items-end justify-between gap-3 mb-3">
          <span className="text-3xl font-bold tabular-nums text-[#1d9bf0]">{clamped}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden mb-4" aria-hidden>
          <div
            className="h-full rounded-full bg-green-600 transition-[width] duration-200 ease-out"
            style={{ width: `${clamped}%` }}
          />
        </div>
        <div className={`flex items-center justify-between gap-3 text-sm ${showControls ? 'mb-5' : ''}`}>
          <div>
            <p className="text-gray-500 text-xs mb-0.5">{loadedLabel}</p>
            <p className="font-semibold tabular-nums text-gray-800">{formatMb(loadedBytes, lang)}</p>
          </div>
          <div className="text-right">
            <p className="text-gray-500 text-xs mb-0.5">{totalLabel}</p>
            <p className="font-semibold tabular-nums text-gray-800">
              {totalBytes > 0 ? formatMb(totalBytes, lang) : '—'}
            </p>
          </div>
        </div>
        {showControls ? (
          <div className="flex gap-2">
            {typeof onPause === 'function' ? (
              paused ? (
                <button
                  type="button"
                  onClick={onResume}
                  className="flex-1 min-h-[44px] px-3 rounded-lg text-sm font-semibold bg-green-600 hover:bg-green-700 text-white transition"
                >
                  {resumeLabel}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onPause}
                  className="flex-1 min-h-[44px] px-3 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
                >
                  {pauseLabel}
                </button>
              )
            ) : null}
            {typeof onCancel === 'function' ? (
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 min-h-[44px] px-3 rounded-lg text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition"
              >
                {cancelLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
