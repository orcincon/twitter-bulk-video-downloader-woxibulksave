'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';

const LANG_LABELS = { en: 'English', tr: 'Türkçe', de: 'Deutsch', es: 'Español' };
const LANG_SHORT = { en: 'EN', tr: 'TR', de: 'DE', es: 'ES' };

export default function LanguageSwitcher({ currentLang, theme = 'dark', variant = 'dropdown', lightText = false, placement = 'default' }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const setLang = (lang) => {
    const params = new URLSearchParams(searchParams?.toString() || '');
    params.set('lang', lang);
    return `${pathname || '/'}?${params.toString()}`;
  };

  const textClass = lightText ? 'text-white/90 hover:text-white' : 'text-gray-600 hover:text-gray-900';
  const bgClass = placement === 'header'
    ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
    : 'bg-white border-gray-300';
  const triggerClass = placement === 'header'
    ? `flex items-center justify-center gap-1 min-w-[44px] min-h-[44px] px-2.5 rounded-lg border text-xs font-bold transition ${bgClass}`
    : `flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] sm:min-h-0 sm:py-1.5 rounded-lg border text-xs font-medium transition ${bgClass} ${textClass}`;

  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-1 text-xs">
        {Object.entries(LANG_SHORT).map(([code, label]) => (
          <Link
            key={code}
            href={setLang(code)}
            className={`px-2 py-1 rounded transition-colors ${currentLang === code ? (lightText ? 'font-semibold text-white' : 'font-semibold text-gray-900') : textClass}`}
            aria-label={`Switch to ${label}`}
          >
            {label}
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={triggerClass}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Dil seçin"
      >
        <span>{LANG_SHORT[currentLang] || 'EN'}</span>
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 top-full mt-2 min-w-[148px] py-1 rounded-xl border border-slate-200 bg-white shadow-xl z-[60] overflow-hidden"
        >
          {Object.entries(LANG_LABELS).map(([code, label]) => (
            <li key={code} role="option" aria-selected={currentLang === code}>
              <Link
                href={setLang(code)}
                className={`block px-4 py-3 sm:py-2.5 min-h-[44px] sm:min-h-0 flex items-center text-sm transition ${currentLang === code ? 'bg-blue-50 font-semibold text-[#1686d4]' : 'text-slate-700 hover:bg-slate-50'}`}
                onClick={() => {
                  setOpen(false);
                  fetch('/api/user-preferences', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ language: code }),
                    credentials: 'include',
                  }).catch(() => {});
                }}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
