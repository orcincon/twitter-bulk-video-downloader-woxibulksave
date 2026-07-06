'use client';

import { useRef, useEffect } from 'react';
import { signIn } from 'next-auth/react';

const MODAL_TEXT = {
  default: {
    tr: 'Misafir olarak tek tek 3 gönderi linki analiz edebilirsiniz. Daha fazlası ve arşiv için lütfen X kullanıcı girişi yapınız.',
    en: 'As a guest you can analyze 3 post links one at a time. For more and to save your archive, please sign in with X.',
    de: 'Als Gast können Sie 3 Beitragslinks einzeln analysieren. Für mehr und Ihren Archivverlauf melden Sie sich bitte mit X an.',
    es: 'Como invitado puede analizar 3 enlaces de publicaciones uno a uno. Para más y su archivo, inicie sesión con X.',
  },
  multi: {
    tr: 'Çoklu link analizi ve toplu indirme için X kullanıcı girişi yapmanız gerekiyor.',
    en: 'To analyze or download multiple links, please sign in with your X account.',
    de: 'Für Mehrfach-Analyse und Sammeldownload melden Sie sich bitte mit Ihrem X-Konto an.',
    es: 'Para analizar o descargar varios enlaces, inicie sesión con su cuenta de X.',
  },
};

export default function SignInModal({ open, onClose, lang = 'en', accentClass, layout, variant = 'default' }) {
  const dialogRef = useRef(null);
  const bundle = MODAL_TEXT[variant] || MODAL_TEXT.default;
  const text = bundle[lang] || bundle.en;
  const common = layout?.common || {};
  const cancelLabel = common.cancel || (lang === 'tr' ? 'İptal' : lang === 'de' ? 'Abbrechen' : lang === 'es' ? 'Cancelar' : 'Cancel');
  const signInLabel = common.signInWithX || (lang === 'tr' ? 'X Kullanıcı Girişi Yap' : lang === 'de' ? 'X-Benutzeranmeldung' : lang === 'es' ? 'Inicio de sesión con X' : 'X User Sign-in');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [open]);

  const handleSignIn = () => {
    signIn('twitter', { callbackUrl: typeof window !== 'undefined' ? window.location.href : '/' });
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      onClick={(e) => e.target === dialogRef.current && onClose()}
      className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl p-0 w-[min(400px,90vw)] border border-gray-200 shadow-xl backdrop:bg-black/30"
    >
      <div className="p-6">
        <p className="text-gray-700 text-sm mb-6">{text}</p>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleSignIn}
            className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition ${accentClass}`}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            {signInLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
