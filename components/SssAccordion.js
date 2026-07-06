'use client';

import Link from 'next/link';

export default function SssAccordion({ items = [], lang = 'en' }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const question = item.question ?? item.soru ?? '';
        const answer = item.answer ?? item.cevap ?? '';
        const cevapWithLinks = item.links?.length
          ? (() => {
              const { phrase, href } = item.links[0];
              const parts = answer.split(phrase);
              const before = parts[0];
              const after = parts.slice(1).join(phrase);
              const isMailto = href.startsWith('mailto:');
              const linkHref = isMailto ? href : (lang && lang !== 'en' ? `${href}?lang=${lang}` : href);
              return (
                <>
                  {before}
                  {isMailto ? (
                    <a href={linkHref} className="text-[#1d9bf0] hover:text-[#1686d4] font-medium underline">
                      {phrase}
                    </a>
                  ) : (
                    <Link href={linkHref} className="text-[#1d9bf0] hover:text-[#1686d4] font-medium underline">
                      {phrase}
                    </Link>
                  )}
                  {after}
                </>
              );
            })()
          : answer;

        return (
          <details
            key={i}
            className="group rounded-xl border border-[#1d9bf0]/30 bg-white hover:bg-gray-50/80 overflow-hidden shadow-sm"
          >
            <summary className="flex items-center justify-between gap-3 cursor-pointer list-none px-4 py-3.5 sm:px-5 sm:py-4 text-left font-semibold text-gray-900 text-sm sm:text-base select-none">
              <span className="min-w-0 pr-2">{question}</span>
              <span className="shrink-0 w-8 h-8 rounded-full bg-[#1d9bf0]/15 text-[#1d9bf0] flex items-center justify-center group-open:rotate-180 transition-transform duration-200" aria-hidden>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </summary>
            <div className="px-4 pb-4 pt-0 sm:px-5 sm:pb-5 sm:pt-0 text-gray-600 text-sm leading-relaxed border-t border-gray-100">
              {cevapWithLinks}
            </div>
          </details>
        );
      })}
    </div>
  );
}
