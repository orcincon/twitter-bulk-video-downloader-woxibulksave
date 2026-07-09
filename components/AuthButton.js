'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { signIn, signOut, useSession } from 'next-auth/react';

const ICON_ONLY_CLASS =
  'x-button text-white inline-flex items-center justify-center rounded-full w-11 h-11 min-h-[44px] min-w-[44px] p-0 hover:opacity-90 transition shadow-lg';

export default function AuthButton({
  accentClass = 'bg-[#1d9bf0] hover:bg-[#1686d4] text-white border border-[#1d9bf0]',
  theme = 'dark',
  signInLabel = 'X Kullanıcı Girişi Yap',
  signOutLabel = 'Çıkış',
  historyHref = '/gecmis',
  historyLabel = 'Arşivim',
  faqLabel,
  lang = 'en',
  signInClass,
  iconOnly = false,
}) {
  const FAQ_LABELS = { en: 'FAQ', tr: 'SSS', de: 'FAQ', es: 'FAQ' };
  const faqHref = lang && lang !== 'en' ? `/sss?lang=${lang}` : '/sss';
  const resolvedFaqLabel = faqLabel || FAQ_LABELS[lang] || FAQ_LABELS.en;
  const { data: session, status } = useSession();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [dropdownOpen]);

  if (status === 'loading') {
    return (
      <div
        className={`bg-gray-200 animate-pulse ${iconOnly ? 'w-11 h-11 min-h-[44px] min-w-[44px] rounded-full' : 'min-h-[44px] min-w-[120px] rounded-lg'}`}
        aria-hidden
      />
    );
  }

  if (session?.user) {
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen((o) => !o)}
          className="rounded-full focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
          aria-expanded={dropdownOpen}
          aria-haspopup="true"
          aria-label="Profil menüsü"
        >
          {session.user.image ? (
            <img
              src={session.user.image}
              alt="Kullanıcı profil fotoğrafı"
              width={36}
              height={36}
              className="w-9 h-9 rounded-full ring-2 ring-gray-300 shrink-0 object-cover hover:ring-gray-400 transition"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gray-300 shrink-0 flex items-center justify-center text-gray-600 font-medium">
              {(session.user.name || session.user.email || '?')[0].toUpperCase()}
            </div>
          )}
        </button>
        {dropdownOpen && (
          <div className="absolute right-0 top-full mt-2 w-48 py-1 bg-white rounded-xl border border-slate-200 shadow-xl z-[60] min-w-[160px]">
            <Link
              href={historyHref}
              onClick={() => setDropdownOpen(false)}
              className="block px-4 py-3 sm:py-2.5 min-h-[44px] sm:min-h-0 text-sm font-semibold text-slate-700 hover:bg-blue-50 hover:text-[#1686d4] transition first:rounded-t-xl"
            >
              {historyLabel}
            </Link>
            <Link
              href={faqHref}
              onClick={() => setDropdownOpen(false)}
              className="block px-4 py-3 sm:py-2.5 min-h-[44px] sm:min-h-0 text-sm font-semibold text-slate-700 hover:bg-blue-50 hover:text-[#1686d4] transition"
            >
              {resolvedFaqLabel}
            </Link>
            <button
              type="button"
              onClick={() => {
                setDropdownOpen(false);
                signOut({ callbackUrl: '/', redirect: true });
              }}
              className="w-full text-left px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition last:rounded-b-xl"
            >
              {signOutLabel}
            </button>
          </div>
        )}
      </div>
    );
  }

  const xLogo = (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
  const btnClass = iconOnly
    ? signInClass || ICON_ONLY_CLASS
    : signInClass || `inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 sm:py-2.5 min-h-[44px] text-sm font-medium transition-colors hover:opacity-90 ${accentClass}`;
  return (
    <button
      type="button"
      onClick={() => signIn('twitter', { callbackUrl: '/' })}
      className={btnClass}
      aria-label={iconOnly ? signInLabel : undefined}
    >
      {xLogo}
      {!iconOnly ? <span>{signInLabel}</span> : null}
    </button>
  );
}
