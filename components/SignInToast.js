'use client';

import { signIn } from 'next-auth/react';

const FALLBACK = {
  limit: {
    tr: 'Ücretsiz indirme hakkınız doldu. İndirmek için X kullanıcı girişi yapmanız gerekiyor.',
    en: 'Free download limit reached. Sign in with your X account to download.',
    de: 'Kostenloses Download-Limit erreicht. Melden Sie sich mit Ihrem X-Konto an, um herunterzuladen.',
    es: 'Límite de descargas gratuitas alcanzado. Inicie sesión con su cuenta de X para descargar.',
  },
  multi: {
    tr: 'Toplu analiz yapabilmeniz için X girişi yapmanız gerekiyor.',
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
    tr: 'ile giriş yap',
    en: 'Sign in',
    de: 'anmelden',
    es: 'Iniciar sesión',
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
  const signInLabel = common.signInWithXAccountButton || FALLBACK.signIn[l] || FALLBACK.signIn.en;
  const closeLabel = common.close || FALLBACK.close[l] || FALLBACK.close.en;

  const handleSignIn = () => {
    signIn('twitter', { callbackUrl: typeof window !== 'undefined' ? window.location.href : '/' });
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-live="assertive"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white border-2 border-[#1d9bf0] rounded-2xl shadow-2xl overflow-hidden w-[min(440px,calc(100vw-2rem))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-end bg-[#1d9bf0] h-10 px-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/90 hover:bg-white/15 hover:text-white transition"
            aria-label={closeLabel}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="p-4 sm:p-6 text-center">
          <p className="text-[#1686d4] font-semibold text-sm sm:text-[15px] leading-snug">{message}</p>
          <p className="text-gray-600 text-xs sm:text-sm mt-1.5">{hint}</p>
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={handleSignIn}
              aria-label={common.signInWithXAccount || (l === 'tr' ? 'X hesabı ile giriş yap' : l === 'de' ? 'Mit X-Konto anmelden' : l === 'es' ? 'Iniciar sesión con X' : 'Sign in with X')}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-bold bg-[#1d9bf0] hover:bg-[#1686d4] text-white transition"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              {signInLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
