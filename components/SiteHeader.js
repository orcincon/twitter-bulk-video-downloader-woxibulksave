import Link from 'next/link';

export default function SiteHeader({ accentClass, layout = {}, lang = 'en', isLoggedIn = false, children }) {
  const { history = 'Arşivim' } = layout.header || {};
  const historyHref = lang && lang !== 'en' ? `/gecmis?lang=${lang}` : '/gecmis';
  return (
    <nav className="bg-white/90 backdrop-blur-md border-b border-blue-50 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-14 sm:h-16 flex justify-between items-center">
        <Link href={lang && lang !== 'en' ? `/?lang=${lang}` : '/'} className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 wbs-gradient rounded-lg flex items-center justify-center text-white font-black text-xs shadow-md shrink-0" aria-hidden>WBS</div>
          <span className="text-lg font-black tracking-tight text-slate-800 truncate">WoxiBulkSave</span>
        </Link>
        <div className="flex items-center gap-2 shrink-0">
          {isLoggedIn ? (
            <Link href={historyHref} className="px-3 py-2 text-slate-700 hover:text-blue-500 font-bold text-sm sm:text-base transition min-h-[44px] flex items-center justify-center">
              {history}
            </Link>
          ) : null}
          {children}
        </div>
      </div>
    </nav>
  );
}
