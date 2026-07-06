'use client';

/**
 * WBS: Geçmiş temizleme onay modalı. window.confirm yerine kullanılır.
 * Beyaz arka plan, kırmızı Sil/Temizle, gri İptal.
 */
export default function ConfirmHistoryModal({
  open,
  onClose,
  onConfirm,
  message = 'Bu işlem geçmişinizi temizleyecektir, onaylıyor musunuz?',
  confirmLabel = 'Sil',
  cancelLabel = 'İptal',
}) {
  if (!open) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-history-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 sm:p-8 max-w-sm w-full text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="confirm-history-modal-title" className="text-slate-800 text-sm sm:text-base mb-6 leading-relaxed">
          {message}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
