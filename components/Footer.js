import Link from 'next/link';

export default function Footer({ theme = 'dark', layout = {}, lang = 'en' }) {
  const f = layout.footer || {};
  return (
    <footer className="mt-auto border-t border-[#0d6bb8] bg-[#1686d4] py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap justify-center gap-6 mb-6 text-white/90">
          <Link href={lang !== 'en' ? `/terms?lang=${lang}` : '/terms'} className="hover:text-white text-xs transition">
            {f.terms || 'Kullanım Koşulları'}
          </Link>
          <Link href={lang !== 'en' ? `/dmca?lang=${lang}` : '/dmca'} className="hover:text-white text-xs transition">
            {f.dmca || 'DMCA'}
          </Link>
          <Link href={lang !== 'en' ? `/sss?lang=${lang}` : '/sss'} className="hover:text-white text-xs transition">
            {f.faq || 'SSS'}
          </Link>
        </div>
        <p className="text-white/90 text-[11px] text-center font-medium italic">{f.copyright || '© 2026 WoxiBulkSave'}</p>
      </div>
    </footer>
  );
}
