import Link from 'next/link';
import dynamic from 'next/dynamic';
import { headers } from 'next/headers';
import { getSessionSafe } from '@/lib/auth.js';
import { sites } from '../wbs-config.js';
import { getLayoutTranslations, getResolvedLangWithPreference } from '../lib/layout-translations.js';
import Footer from '../components/Footer.js';
import AuthButton from '../components/AuthButton.js';

const BulkDownloadSection = dynamic(() => import('../components/BulkDownloadSection.js'), {
  loading: () => (
    <div className="animate-pulse rounded-xl bg-white/60 border border-blue-200 p-6 min-h-[200px] flex items-center justify-center" aria-hidden>
      <span className="text-slate-500 text-[18px]">Yükleniyor…</span>
    </div>
  ),
});
import SiteHeader from '../components/SiteHeader.js';
import SecurityBanner from '../components/SecurityBanner.js';
import { buildSeoMetadata, getBaseUrl, getSeoForLang } from '../lib/seo.js';

const SUPPORTED_LANGS = ['en', 'tr', 'de', 'es'];

function resolveLang(urlLang, acceptLanguage) {
  if (urlLang && SUPPORTED_LANGS.includes(urlLang)) return urlLang;
  if (!acceptLanguage) return 'en';
  const parts = acceptLanguage.split(',').map((s) => s.split(';')[0].trim().slice(0, 2).toLowerCase());
  return parts.find((l) => SUPPORTED_LANGS.includes(l)) || 'en';
}

export async function generateMetadata({ searchParams }) {
  const headersList = await headers();
  const siteId = headersList.get('x-site-id') || 'woxibulksave.com';
  const site = sites[siteId] || sites['woxibulksave.com'];
  const params = searchParams ? (await searchParams) || {} : {};
  const urlLang = params?.lang;
  const acceptLang = headersList.get('accept-language') || '';
  const lang = resolveLang(urlLang, acceptLang);
  const seo = getSeoForLang(lang);
  const baseUrl = getBaseUrl();

  const verification = {};
  if (site.verification?.google) verification.google = site.verification.google;
  if (site.verification?.bing) verification.other = { 'msvalidate.01': site.verification.bing };

  return {
    ...buildSeoMetadata(baseUrl, { title: seo.title, description: seo.description, path: '/', lang, absoluteTitle: true }),
    ...(Object.keys(verification).length > 0 && { verification }),
  };
}

const accentStyles = {
  dark: 'bg-[#1d9bf0] hover:bg-[#1686d4] text-white border-0',
  blue: 'bg-[#1d9bf0] hover:bg-[#1686d4] text-white border-0',
  ocean: 'bg-[#1d9bf0] hover:bg-[#1686d4] text-white border-0',
};

export default async function Home({ searchParams }) {
  const headersList = await headers();
  const siteId = headersList.get('x-site-id') || 'woxibulksave.com';
  const site = sites[siteId] || sites['woxibulksave.com'];
  const params = searchParams ? (await searchParams) || {} : {};
  const urlLang = params?.lang;
  const acceptLang = headersList.get('accept-language') || '';
  const session = await getSessionSafe();
  const lang = await getResolvedLangWithPreference(urlLang, acceptLang, session);
  const t = site.translations?.[lang] || site.translations?.en || site;

  const theme = site.theme || 'dark';
  const accentClass = accentStyles[theme] || accentStyles.dark;
  const layout = getLayoutTranslations(lang, '');
  const logId = typeof params?.logId === 'string' && params.logId.length > 10 ? params.logId : null;

  const signInClass = 'x-button text-white px-3 py-1.5 rounded-full text-[18px] font-bold flex items-center justify-center gap-1.5 hover:opacity-90 transition shadow-lg min-h-[44px]';
  const historyHref = lang && lang !== 'en' ? `/gecmis?lang=${lang}` : '/gecmis';
  const h = layout.pages?.home || {};

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#f4f9ff' }}>
      <SiteHeader accentClass={accentClass} layout={layout} lang={lang} isLoggedIn={!!session?.user}>
        <AuthButton
          accentClass={accentClass}
          theme={theme}
          signInLabel={layout.header?.signIn ?? 'X Kullanıcı Girişi Yap'}
          signOutLabel={layout.header?.signOut}
          historyHref={historyHref}
          historyLabel={layout.header?.history}
          signInClass={signInClass}
        />
      </SiteHeader>

      <main className="flex-grow w-full">
        <header className="wbs-gradient text-white pt-10 pb-24 px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="text-[20px] sm:text-[20px] font-black mb-4 leading-tight">
              {h.heroTitle1 || 'X (Twitter) Videolarını'} <br />{h.heroTitle2 || 'Toplu Analiz Edin'}
            </h1>
            <p className="text-blue-100 text-[18px] mb-8 opacity-90 italic">
              {t.description || h.whySubtitle || 'Floodları ve medya içeriklerini saniyeler içinde analiz edin.'}
            </p>
            <div className="max-w-2xl mx-auto">
              <BulkDownloadSection
                variant="wbs"
                theme={theme}
                lang={lang}
                accentClass="wbs-gradient text-white font-bold shadow-lg shadow-blue-200"
                ui={t.ui || {}}
                layout={layout}
                isLoggedIn={!!session?.user}
                initialLogId={logId}
              />
            </div>
          </div>
        </header>

        <section className="max-w-5xl mx-auto px-4 -mt-12 relative z-10">
          <div className="bg-white rounded-3xl shadow-lg border border-blue-50 p-6 sm:p-10">
            <h2 className="text-[20px] font-black text-center mb-10 text-slate-800">
              {h.howToTitle || 'WBS ile nasıl video analiz edilir?'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center text-2xl shadow-inner">
                  <i className="fa-solid fa-link" aria-hidden />
                </div>
                <div className="flex items-center gap-2">
                  <span className="step-number">1</span>
                  <h3 className="font-bold text-[20px] text-slate-800">{h.step1Title || 'Link kopyalayın'}</h3>
                </div>
                <p className="text-slate-500 text-[18px] leading-snug">
                  {h.step1Text || 'X üzerinde beğendiğiniz videonun paylaş butonuna basarak "Bağlantıyı Kopyala" seçeneğine tıklayın.'}
                </p>
              </div>
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center text-2xl shadow-inner">
                  <i className="fa-solid fa-paste" aria-hidden />
                </div>
                <div className="flex items-center gap-2">
                  <span className="step-number">2</span>
                  <h3 className="font-bold text-[20px] text-slate-800">{h.step2Title || "WBS'ye yapıştırın"}</h3>
                </div>
                <p className="text-slate-500 text-[18px] leading-snug">
                  {h.step2Text || 'Kopyaladığınız linki giriş alanına yapıştırın. Sistemimiz linki metin içinden otomatik ayıklayacaktır.'}
                </p>
              </div>
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center text-2xl shadow-inner">
                  <i className="fa-solid fa-bolt" aria-hidden />
                </div>
                <div className="flex items-center gap-2">
                  <span className="step-number">3</span>
                  <h3 className="font-bold text-[20px] text-slate-800">{h.step3Title || 'Analiz edin'}</h3>
                </div>
                <p className="text-slate-500 text-[18px] leading-snug">
                  {h.step3Text || '"Analiz Et" butonuna basın; sistemimiz videonun teknik detaylarını ve en yüksek kalitesini hazırlasın.'}
                </p>
              </div>
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center text-2xl shadow-inner">
                  <i className="fa-solid fa-download" aria-hidden />
                </div>
                <div className="flex items-center gap-2">
                  <span className="step-number">4</span>
                  <h3 className="font-bold text-[20px] text-slate-800">{h.step4Title || 'Güvenle analiz edin'}</h3>
                </div>
                <p className="text-slate-500 text-[18px] leading-snug">
                  {h.step4Text || 'Güvenle analiz edin — isterseniz ZIP olarak toplu, isterseniz videoları tek tek analiz edin.'}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-xl mx-auto px-4 py-16 sm:py-20">
          <div className="bg-black text-white p-8 rounded-[2rem] text-center shadow-2xl">
            <i className="fa-brands fa-x-twitter text-4xl mb-4" aria-hidden />
            <h2 className="text-[20px] font-black mb-3 italic">{h.historyBoxTitle || 'Analiz Arşiviniz'}</h2>
            <p className="text-slate-400 text-[18px] mb-8 leading-relaxed">
              {h.historyBoxText || 'X kullanıcı girişi yapan kullanıcılarımızın analiz geçmişi profillerine otomatik eklenir. Arşivim sayfasından takip edebilirsiniz.'}
            </p>
            {session?.user ? (
              <Link href={historyHref} className="bg-white text-black w-full touch-target rounded-xl font-black text-[18px] hover:bg-slate-100 transition flex items-center justify-center gap-3 min-h-[48px] inline-flex">
                <i className="fa-solid fa-clock-rotate-left" aria-hidden />
                {layout.header?.history ?? h.mySavedLabel ?? 'Arşivim'}
              </Link>
            ) : (
              <AuthButton
                accentClass="bg-white text-black hover:bg-slate-100"
                theme={theme}
                signInLabel={layout.common?.signInShort ?? 'ile Kullanıcı Girişi'}
                signOutLabel={layout.header?.signOut}
                historyHref={historyHref}
                historyLabel={layout.header?.history}
                signInClass="bg-white text-black w-full touch-target rounded-xl font-black text-[18px] hover:bg-slate-100 transition flex items-center justify-center gap-3 min-h-[48px]"
              />
            )}
          </div>
        </section>

        <div className="max-w-4xl mx-auto w-full px-4 pb-4">
          <SecurityBanner layout={layout} />
        </div>
      </main>

      <Footer theme={theme} layout={layout} lang={lang} />
    </div>
  );
}
