'use client';

export default function ConfirmToast({
  open,
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Sil',
  cancelLabel = 'İptal',
  confirming = false,
}) {
  if (!open || !message) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-live="assertive"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="bg-white border-2 border-[#1d9bf0] rounded-2xl shadow-2xl overflow-hidden w-[min(440px,calc(100vw-2rem))]"
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
          <p className="text-[#1686d4] font-semibold text-sm sm:text-[15px] leading-snug">{message}</p>
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
              {confirming ? 'Siliniyor…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
