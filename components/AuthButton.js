'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { signIn, signOut, useSession } from 'next-auth/react';

export default function AuthButton({ accentClass = 'bg-[#1d9bf0] hover:bg-[#1686d4] text-white border border-[#1d9bf0]', theme = 'dark', signInLabel = 'X Kullanıcı Girişi Yap', signOutLabel = 'Çıkış', historyHref = '/gecmis', historyLabel = 'Arşivim', signInClass }) {
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
      <div className="min-h-[44px] min-w-[120px] rounded-lg bg-gray-200 animate-pulse" aria-hidden />
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
          aria-label={historyLabel}
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
          <div className="absolute right-0 top-full mt-2 w-48 py-1 bg-white rounded-xl border border-gray-200 shadow-lg z-50 min-w-[160px]">
            <Link
              href={historyHref}
              onClick={() => setDropdownOpen(false)}
              className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 transition first:rounded-t-xl"
            >
              {historyLabel}
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
  const btnClass = signInClass || `inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 sm:py-2.5 min-h-[44px] text-sm font-medium transition-colors hover:opacity-90 ${accentClass}`;
  return (
    <button
      type="button"
      onClick={() => signIn('twitter', { callbackUrl: '/' })}
      className={btnClass}
    >
      {xLogo}
      <span>{signInLabel}</span>
    </button>
  );
}
