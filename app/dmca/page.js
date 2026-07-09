import Link from 'next/link';
import { headers } from 'next/headers';
import { getSessionSafe } from '@/lib/auth.js';
import { getLayoutTranslations, getResolvedLangWithPreference } from '../../lib/layout-translations.js';
import { buildSeoMetadata, getBaseUrl, resolveLang } from '../../lib/seo.js';
import SiteHeader from '../../components/SiteHeader.js';
import Footer from '../../components/Footer.js';
import SecurityBanner from '../../components/SecurityBanner.js';
import AuthButton from '../../components/AuthButton.js';

export async function generateMetadata({ searchParams }) {
  const params = searchParams ? (await searchParams) || {} : {};
  const acceptLang = (await headers()).get('accept-language') || '';
  const layout = getLayoutTranslations(params?.lang, acceptLang);
  const lang = resolveLang(params?.lang, acceptLang);
  const pageTitle = layout.pages?.dmca?.title || 'DMCA Notice';
  return buildSeoMetadata(getBaseUrl(), {
    title: pageTitle,
    description: 'DMCA copyright notice for WBS. Media analysis tool — no files hosted on our servers.',
    path: '/dmca',
    lang,
  });
}

export default async function DmcaPage({ searchParams }) {
  const headersList = await headers();
  const params = searchParams ? (await searchParams) || {} : {};
  const acceptLang = headersList.get('accept-language') || '';
  const layout = getLayoutTranslations(params?.lang, acceptLang);
  const session = await getSessionSafe();
  const lang = await getResolvedLangWithPreference(params?.lang, acceptLang, session);
  const t = layout.pages?.dmca || {};

  return (
    <div className="min-h-screen flex flex-col bg-[#E7F3FF]">
      <SiteHeader layout={layout} lang={lang} isLoggedIn={!!session?.user} accentClass="bg-[#1d9bf0] hover:bg-[#1686d4] text-white border border-[#1d9bf0]">
        <div className="flex flex-col items-end">
          <AuthButton theme="dark" signInLabel={layout.header?.signIn} signOutLabel={layout.header?.signOut} historyHref={lang && lang !== 'en' ? `/gecmis?lang=${lang}` : '/gecmis'} historyLabel={layout.header?.history} faqLabel={layout.footer?.faq} lang={lang} iconOnly />
        </div>
      </SiteHeader>

      <main className="flex-grow max-w-4xl mx-auto w-full px-3 sm:px-4 py-8 sm:py-12">
        <div className="bg-[#D1EBFF] backdrop-blur-xl border border-[#1d9bf0]/40 rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-lg">
          <h1 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-gray-900">{t.title || 'DMCA Notice'}</h1>
          <p className="text-gray-600 text-sm mb-4">{t.subtitle || 'Digital Millennium Copyright Act (DMCA) compliance'}</p>

          <div className="prose prose-sm max-w-none space-y-4 text-gray-700">
            <p>{t.intro}</p>
            <h2 className="text-lg font-semibold text-gray-900 mt-6">{t.s1Title}</h2>
            <p>{t.s1Text}</p>
            <h2 className="text-lg font-semibold text-gray-900 mt-6">{t.s2Title}</h2>
            <p>{t.s2Text} <a href="mailto:support@woxibulksave.com" className="text-[#1d9bf0] hover:underline">support@woxibulksave.com</a></p>
          </div>

          <Link href={lang !== 'en' ? `/?lang=${lang}` : '/'} className="inline-block mt-8 text-[#1d9bf0] hover:text-[#1686d4] text-sm font-medium">
            {layout.pages?.backToHome || '← Back to home'}
          </Link>
        </div>
      </main>

      <div className="max-w-4xl mx-auto w-full px-3 sm:px-4 pb-4 sm:pb-6">
        <SecurityBanner layout={layout} />
      </div>
      <Footer theme="dark" layout={layout} lang={lang} />
    </div>
  );
}
