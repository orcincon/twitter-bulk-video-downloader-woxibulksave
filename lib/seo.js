/**
 * SEO metadata helper: Open Graph, Twitter Card, alternates (canonical + hreflang).
 * Brand: WBS (primary) — WoxiBulkSave kept as alternate for entity recognition.
 */

export const SUPPORTED_LANGS = ['en', 'tr', 'de', 'es'];
const OG_LOCALES = { en: 'en_US', tr: 'tr_TR', de: 'de_DE', es: 'es_ES' };

export const BRAND = {
  name: 'WBS',
  shortName: 'WBS',
  legalName: 'WoxiBulkSave',
  alternateNames: ['WoxiBulkSave', 'WBS Tool', 'WBS Analiz'],
};

/** Per-language SEO copy — titles lead with WBS for branded search */
export const SEO_BY_LANG = {
  en: {
    title: 'WBS - Twitter/X Bulk Video Analysis Tool',
    description:
      'With WBS, analyze X (Twitter) post videos one by one or in bulk. Free, fast and secure media analysis.',
    keywords: [
      'WBS',
      'WBS Twitter',
      'WBS X video',
      'WBS bulk analysis',
      'WBS video analyzer',
      'Twitter video analysis',
      'X media analysis tool',
      'bulk tweet video analysis',
      'WoxiBulkSave',
    ],
  },
  tr: {
    title: 'WBS - Twitter/X Toplu Video Analiz Aracı',
    description:
      'WBS ile X (Twitter) gönderi videolarını ister tek tek isterseniz toplu olarak analiz edin. Ücretsiz, hızlı ve güvenli medya analiz aracı.',
    keywords: [
      'WBS',
      'WBS analiz',
      'WBS Twitter',
      'WBS X video',
      'WBS toplu analiz',
      'Twitter video analiz',
      'X video analiz aracı',
      'toplu tweet analizi',
      'WoxiBulkSave',
    ],
  },
  de: {
    title: 'WBS - Twitter/X Massen-Videoanalyse',
    description:
      'Mit WBS X (Twitter)-Beitragsvideos einzeln oder in Masse analysieren. Kostenloses, schnelles und sicheres Medienanalyse-Tool.',
    keywords: [
      'WBS',
      'WBS Twitter',
      'WBS X Video',
      'WBS Massenanalyse',
      'Twitter Videoanalyse',
      'X Medienanalyse',
      'WoxiBulkSave',
    ],
  },
  es: {
    title: 'WBS - Análisis masivo de videos X/Twitter',
    description:
      'Con WBS, analice vídeos de publicaciones de X (Twitter) uno a uno o en masa. Herramienta gratuita, rápida y segura de análisis de medios.',
    keywords: [
      'WBS',
      'WBS Twitter',
      'WBS X video',
      'WBS análisis masivo',
      'análisis de video Twitter',
      'herramienta X análisis',
      'WoxiBulkSave',
    ],
  },
};

export function getSeoForLang(lang) {
  const l = SUPPORTED_LANGS.includes(lang) ? lang : 'en';
  return SEO_BY_LANG[l] || SEO_BY_LANG.en;
}

/** Resolve lang from URL param and Accept-Language header. */
export function resolveLang(urlLang, acceptLanguage) {
  if (urlLang && SUPPORTED_LANGS.includes(urlLang)) return urlLang;
  if (!acceptLanguage) return 'en';
  const parts = acceptLanguage.split(',').map((s) => s.split(';')[0].trim().slice(0, 2).toLowerCase());
  return parts.find((l) => SUPPORTED_LANGS.includes(l)) || 'en';
}

/**
 * @param {string} baseUrl - Full origin e.g. https://www.woxibulksave.com
 * @param {object} opts
 * @param {string} opts.title - Page title
 * @param {string} opts.description - Meta description
 * @param {string} [opts.path='/'] - Path (no leading slash or with)
 * @param {string} [opts.lang] - Current page lang (en, tr, de, es)
 * @param {string} [opts.imagePath='/logo.png'] - OG image path
 * @param {boolean} [opts.noindex=false] - Set noindex,nofollow
 * @param {string} [opts.type='website'] - openGraph type
 * @param {string[]} [opts.keywords] - Meta keywords (merged with lang defaults)
 * @param {boolean} [opts.absoluteTitle=false] - Skip layout title template (homepage)
 * @returns {import('next').Metadata}
 */
export function buildSeoMetadata(baseUrl, opts = {}) {
  const {
    title,
    description,
    path = '/',
    lang,
    imagePath = '/logo.png',
    noindex = false,
    type = 'website',
    keywords: extraKeywords,
    absoluteTitle = false,
  } = opts;

  const base = baseUrl.replace(/\/$/, '');
  const pathNorm = path.startsWith('/') ? path : `/${path}`;
  const query = lang && lang !== 'en' ? `?lang=${lang}` : '';
  const canonical = `${base}${pathNorm}${query}`;

  const imageUrl = imagePath.startsWith('http') ? imagePath : `${base}${imagePath}`;
  const langSeo = lang ? getSeoForLang(lang) : getSeoForLang('en');
  const keywords = [...new Set([...(extraKeywords || []), ...langSeo.keywords])];

  const metadata = {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    keywords,
    robots: noindex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: BRAND.name,
      type,
      locale: lang ? OG_LOCALES[lang] || 'en_US' : undefined,
      images: [{ url: imageUrl, width: 1200, height: 630, alt: `${BRAND.name} - ${title}` }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
    alternates: {
      canonical,
      languages: {},
    },
  };

  SUPPORTED_LANGS.forEach((l) => {
    const q = l === 'en' ? '' : `?lang=${l}`;
    metadata.alternates.languages[l] = `${base}${pathNorm}${q}`;
  });

  return metadata;
}

/**
 * Base URL from env (used in sitemap/robots).
 */
export function getBaseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://www.woxibulksave.com';
}

/** JSON-LD @graph for root layout */
export function buildRootJsonLd(baseUrl) {
  const base = baseUrl.replace(/\/$/, '');
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${base}/#website`,
        url: base,
        name: BRAND.name,
        alternateName: BRAND.alternateNames,
        description: SEO_BY_LANG.en.description,
        inLanguage: SUPPORTED_LANGS,
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: `${base}/?urls={search_term_string}` },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'WebApplication',
        '@id': `${base}/#webapp`,
        name: BRAND.name,
        alternateName: [BRAND.legalName, ...BRAND.alternateNames],
        url: base,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Any',
        description: SEO_BY_LANG.en.description,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
      },
      {
        '@type': 'Organization',
        '@id': `${base}/#organization`,
        name: BRAND.name,
        alternateName: BRAND.alternateNames,
        url: base,
        logo: `${base}/logo.png`,
      },
    ],
  };
}
