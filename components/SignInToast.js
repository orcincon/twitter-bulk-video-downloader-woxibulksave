'use client';

import { signIn } from 'next-auth/react';

const FALLBACK = {
  limit: {
    tr: 'Daha fazla analiz yapabilmek için X kullanıcı girişi yapmanız gerekiyor.',
    en: 'To analyze more posts, please sign in with your X account.',
    de: 'Um weitere Analysen durchzuführen, melden Sie sich bitte mit Ihrem X-Konto an.',
    es: 'Para analizar más publicaciones, inicie sesión con su cuenta de X.',
  },
  multi: {
    tr: 'Toplu analiz yapabilmek için X kullanıcı girişi yapmanız gerekiyor.',
    en: 'To run bulk analysis, please sign in with your X account.',
    de: 'Für Sammelanalysen melden Sie sich bitte mit Ihrem X-Konto an.',
    es: 'Para análisis en lote, inicie sesión con su cuenta de X.',
  },
  hint: {
    tr: 'Merak etmeyin, şifre istemiyoruz.',
    en: "Don't worry — we never ask for your password.",
    de: 'Keine Sorge — wir fragen nie nach Ihrem Passwort.',
    es: 'No se preocupe — nunca pedimos su contraseña.',
  },
  signIn: {
    tr: 'X hesabı ile giriş yap',
    en: 'Sign in with X',
    de: 'Mit X-Konto anmelden',
    es: 'Iniciar sesión con X',
  },
  close: {
    tr: 'Kapat',
    en: 'Close',
    de: 'Schließen',
    es: 'Cerrar',
  },
};

export default function SignInToast({ open, variant, onClose, lang = 'tr', layout }) {
  if (!open || !variant) return null;

  const common = layout?.common || {};
  const l = lang || 'tr';
  const message =
    variant === 'multi'
      ? common.guestBulkToastMessage || FALLBACK.multi[l] || FALLBACK.multi.en
      : common.guestLimitToastMessage || FALLBACK.limit[l] || FALLBACK.limit.en;
  const hint = common.guestToastPasswordHint || FALLBACK.hint[l] || FALLBACK.hint.en;
  const signInLabel = common.signInWithXAccount || FALLBACK.signIn[l] || FALLBACK.signIn.en;
  const closeLabel = common.close || FALLBACK.close[l] || FALLBACK.close.en;

  const handleSignIn = () => {
    signIn('twitter', { callbackUrl: typeof window !== 'undefined' ? window.location.href : '/' });
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] w-[min(440px,calc(100vw-2rem))]"
    >
      <div className="bg-white border-2 border-red-500 rounded-2xl shadow-2xl overflow-hidden">
        <div className="h-1.5 bg-red-500 w-full" aria-hidden />
        <div className="p-4 sm:p-5">
          <p className="text-red-700 font-semibold text-sm sm:text-[15px] leading-snug">{message}</p>
          <p className="text-gray-600 text-xs sm:text-sm mt-1.5">{hint}</p>
          <div className="flex flex-col sm:flex-row gap-2 mt-4">
            <button
              type="button"
              onClick={handleSignIn}
              className="inline-flex flex-1 items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-bold bg-red-600 hover:bg-red-700 text-white transition"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              {signInLabel}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-medium text-red-700 border border-red-200 hover:bg-red-50 transition"
            >
              {closeLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
