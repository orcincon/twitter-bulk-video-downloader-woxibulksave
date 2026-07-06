import { headers } from 'next/headers';
import { Suspense } from 'react';
import { getSessionSafe } from '@/lib/auth.js';
import { sites } from '../../wbs-config.js';
import { getLayoutTranslations, getResolvedLangWithPreference } from '../../lib/layout-translations.js';
import SiteHeader from '../../components/SiteHeader.js';
import Footer from '../../components/Footer.js';
import SecurityBanner from '../../components/SecurityBanner.js';
import AuthButton from '../../components/AuthButton.js';
import HistoryContent from '../../components/HistoryContent.js';
import { buildSeoMetadata, getBaseUrl } from '../../lib/seo.js';

const SUPPORTED_LANGS = ['en', 'tr', 'de', 'es'];

function resolveLang(urlLang, acceptLanguage) {
  if (urlLang && SUPPORTED_LANGS.includes(urlLang)) return urlLang;
  if (!acceptLanguage) return 'en';
  const parts = acceptLanguage.split(',').map((s) => s.split(';')[0].trim().slice(0, 2).toLowerCase());
  return parts.find((l) => SUPPORTED_LANGS.includes(l)) || 'en';
}

const accentStyles = {
  dark: 'bg-[#1d9bf0] hover:bg-[#1686d4] text-white border border-[#1d9bf0]',
  blue: 'bg-[#1d9bf0] hover:bg-[#1686d4] text-white border border-[#1d9bf0]',
  ocean: 'bg-[#1d9bf0] hover:bg-[#1686d4] text-white border border-[#1d9bf0]',
};

export async function generateMetadata({ searchParams }) {
  const params = searchParams ? (await searchParams) || {} : {};
  const acceptLang = (await headers()).get('accept-language') || '';
  const layout = getLayoutTranslations(params?.lang, acceptLang);
  const lang = resolveLang(params?.lang, acceptLang);
  const pageTitle = layout.pages?.gecmis?.title || 'My Archive';
  return buildSeoMetadata(getBaseUrl(), {
    title: pageTitle,
    description: 'WBS analiz arşivinizi görüntüleyin ve yönetin. Twitter/X video analiz geçmişi.',
    path: '/gecmis',
    lang,
  });
}

export default async function GecmisPage({ searchParams }) {
  const headersList = await headers();
  const siteId = headersList.get('x-site-id') || 'woxibulksave.com';
  const site = sites[siteId] || sites['woxibulksave.com'];
  const params = searchParams ? (await searchParams) || {} : {};
  const urlLang = params?.lang;
  const acceptLang = headersList.get('accept-language') || '';
  const session = await getSessionSafe();
  const lang = await getResolvedLangWithPreference(urlLang, acceptLang, session);
  const layout = getLayoutTranslations(lang, '');

  const theme = site.theme || 'dark';
  const accentClass = accentStyles[theme] || accentStyles.dark;

  return (
    <div className="min-h-screen flex flex-col bg-[#E7F3FF]">
      <SiteHeader accentClass={accentClass} layout={layout} lang={lang} isLoggedIn={!!session?.user}>
        <div className="flex flex-col items-end">
          <AuthButton accentClass={`${accentClass} px-5 py-2 rounded-full text-sm font-bold border transition`} theme={theme} signInLabel={layout.header?.signIn} signOutLabel={layout.header?.signOut} historyHref={lang && lang !== 'en' ? `/gecmis?lang=${lang}` : '/gecmis'} historyLabel={layout.header?.history} />
        </div>
      </SiteHeader>

      <main className="flex-grow max-w-4xl mx-auto w-full px-3 sm:px-4 py-6 sm:py-8 pb-12 sm:pb-16">
        <Suspense fallback={<div className="animate-pulse py-12 text-gray-600">Loading...</div>}>
          <HistoryContent lang={lang} layout={layout} accentClass={accentClass} theme={theme} isLoggedIn={!!session?.user} />
        </Suspense>
      </main>

      <div className="max-w-4xl mx-auto w-full px-3 sm:px-4 pb-4 sm:pb-6">
        <SecurityBanner layout={layout} />
      </div>
      <Footer theme={theme} layout={layout} lang={lang} />
    </div>
  );
}
