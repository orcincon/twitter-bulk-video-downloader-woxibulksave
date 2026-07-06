import Link from 'next/link';
import { headers } from 'next/headers';
import { getSessionSafe } from '@/lib/auth.js';
import { getLayoutTranslations, getResolvedLangWithPreference } from '../../lib/layout-translations.js';
import { buildSeoMetadata, getBaseUrl, resolveLang } from '../../lib/seo.js';
import { getSssContent } from '../../lib/sss-content.js';
import SiteHeader from '../../components/SiteHeader.js';
import Footer from '../../components/Footer.js';
import AuthButton from '../../components/AuthButton.js';
import SssAccordion from '../../components/SssAccordion.js';

export async function generateMetadata({ searchParams }) {
  const params = searchParams ? (await searchParams) || {} : {};
  const acceptLang = (await headers()).get('accept-language') || '';
  const lang = resolveLang(params?.lang, acceptLang);
  const { meta } = getSssContent(lang);
  return buildSeoMetadata(getBaseUrl(), {
    title: meta.title,
    description: meta.description,
    path: '/sss',
    lang,
  });
}

export default async function SSSPage({ searchParams }) {
  const headersList = await headers();
  const params = searchParams ? (await searchParams) || {} : {};
  const acceptLang = headersList.get('accept-language') || '';
  const layout = getLayoutTranslations(params?.lang, acceptLang);
  const session = await getSessionSafe();
  const lang = await getResolvedLangWithPreference(params?.lang, acceptLang, session);
  const { page, items } = getSssContent(lang);
  const historyHref = lang && lang !== 'en' ? `/gecmis?lang=${lang}` : '/gecmis';
  const homeHref = lang !== 'en' ? `/?lang=${lang}` : '/';

  return (
    <div className="min-h-screen flex flex-col bg-[#E7F3FF]">
      <SiteHeader layout={layout} lang={lang} accentClass="bg-[#1d9bf0] hover:bg-[#1686d4] text-white border border-[#1d9bf0]" isLoggedIn={!!session?.user}>
        <div className="flex flex-col items-end">
          <AuthButton
            accentClass="bg-[#1d9bf0] hover:bg-[#1686d4] text-white px-5 py-2 rounded-full text-sm font-bold border border-[#1d9bf0] transition"
            theme="dark"
            signInLabel={layout.header?.signIn}
            signOutLabel={layout.header?.signOut}
            historyHref={historyHref}
            historyLabel={layout.header?.history}
          />
        </div>
      </SiteHeader>

      <main className="flex-grow max-w-4xl mx-auto w-full px-3 sm:px-4 py-8 sm:py-12">
        <div className="bg-[#D1EBFF] backdrop-blur-xl border border-[#1d9bf0]/40 rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-lg">
          <h1 className="text-xl sm:text-2xl font-bold mb-2 text-gray-900">{page.title}</h1>
          <p className="text-gray-600 text-sm mb-6">{page.subtitle}</p>

          <SssAccordion items={items} lang={lang} />

          <div className="mt-8 pt-6 border-t border-gray-200">
            <Link href={homeHref} className="text-[#1d9bf0] hover:text-[#1686d4] text-sm font-medium">
              {page.backToHome}
            </Link>
          </div>
        </div>
      </main>

      <Footer theme="dark" layout={layout} lang={lang} />
    </div>
  );
}
