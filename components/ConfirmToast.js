'use client';

export default function ConfirmToast({
  open,
  message,
  detail,
  onConfirm,
  onCancel,
  confirmLabel = 'Sil',
  cancelLabel = 'İptal',
  confirming = false,
  onSoftConfirm,
  onHardConfirm,
  softLabel = 'Soft sil',
  hardLabel = 'Kalıcı sil',
}) {
  if (!open || !message) return null;

  const dual = typeof onSoftConfirm === 'function' && typeof onHardConfirm === 'function';

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-live="assertive"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="bg-white border-2 border-[#1d9bf0] rounded-2xl shadow-2xl overflow-hidden w-[min(480px,calc(100vw-2rem))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-end bg-[#1d9bf0] h-10 px-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/90 hover:bg-white/15 hover:text-white transition disabled:opacity-50"
            aria-label={cancelLabel}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="p-4 sm:p-6 text-center">
          <p className="text-[#1686d4] font-semibold text-sm sm:text-[15px] leading-snug whitespace-pre-line">{message}</p>
          {detail ? (
            <p className="mt-3 text-xs sm:text-sm text-gray-600 leading-relaxed whitespace-pre-line">{detail}</p>
          ) : null}
          {dual ? (
            <div className="mt-5 flex flex-col items-stretch gap-2">
              <button
                type="button"
                onClick={onSoftConfirm}
                disabled={confirming}
                className="inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-bold bg-[#1d9bf0] hover:bg-[#1686d4] text-white transition disabled:opacity-50"
              >
                {confirming ? 'Siliniyor…' : softLabel}
              </button>
              <button
                type="button"
                onClick={onHardConfirm}
                disabled={confirming}
                className="inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-bold bg-red-600 hover:bg-red-700 text-white transition disabled:opacity-50"
              >
                {confirming ? 'Siliniyor…' : hardLabel}
              </button>
              <button
                type="button"
                onClick={onCancel}
                disabled={confirming}
                className="inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
              >
                {cancelLabel}
              </button>
            </div>
          ) : (
            <div className="mt-5 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={confirming}
                className="inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={confirming}
                className="inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-bold bg-[#1d9bf0] hover:bg-[#1686d4] text-white transition disabled:opacity-50"
              >
                {confirming ? 'İşleniyor…' : confirmLabel}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
