import Link from 'next/link';
import { Suspense } from 'react';
import LanguageSwitcher from './LanguageSwitcher.js';

const FAQ_LABELS = { en: 'FAQ', tr: 'SSS', de: 'FAQ', es: 'FAQ' };

export default function SiteHeader({ accentClass, layout = {}, lang = 'en', isLoggedIn = false, children }) {
  const faqHref = lang && lang !== 'en' ? `/sss?lang=${lang}` : '/sss';
  const faqLabel = layout.footer?.faq || FAQ_LABELS[lang] || FAQ_LABELS.en;

  return (
    <nav className="bg-white/90 backdrop-blur-md border-b border-blue-50 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-14 sm:h-16 flex justify-between items-center">
        <Link href={lang && lang !== 'en' ? `/?lang=${lang}` : '/'} className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 wbs-gradient rounded-lg flex items-center justify-center text-white font-black text-xs shadow-md shrink-0" aria-hidden>WBS</div>
          <span className="text-lg font-black tracking-tight text-slate-800 truncate">WoxiBulkSave</span>
        </Link>
        <div className="flex items-center gap-2 shrink-0">
          {!isLoggedIn ? (
            <Link
              href={faqHref}
              className="flex items-center justify-center min-w-[44px] min-h-[44px] px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              {faqLabel}
            </Link>
          ) : null}
          <Suspense fallback={<div className="w-11 h-11 rounded-lg bg-slate-100 animate-pulse" aria-hidden />}>
            <LanguageSwitcher currentLang={lang} variant="dropdown" placement="header" />
          </Suspense>
          {children}
        </div>
      </div>
    </nav>
  );
}
