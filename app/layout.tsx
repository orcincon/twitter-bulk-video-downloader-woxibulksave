import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter } from "next/font/google";
import "./globals.css";
import SessionProvider from "../components/SessionProvider.js";
import DevMobilePreview from "../components/DevMobilePreview.js";
import VisitTracker from "../components/VisitTracker.js";
import { JsonLd } from "../components/JsonLd.js";
import FontAwesomeAsync from "../components/FontAwesomeAsync.js";
import { BRAND, SEO_BY_LANG, buildRootJsonLd, getBaseUrl } from "../lib/seo.js";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
  display: "swap",
});

const baseUrl = getBaseUrl();
const googleVerification = process.env.GOOGLE_SITE_VERIFICATION || "";
const bingVerification = process.env.BING_SITE_VERIFICATION || "";
const defaultSeo = SEO_BY_LANG.en;

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  ...((googleVerification || bingVerification) && {
    verification: {
      ...(googleVerification && { google: googleVerification }),
      ...(bingVerification && { other: { "msvalidate.01": bingVerification } }),
    },
  }),
  title: {
    default: defaultSeo.title,
    template: `%s | ${BRAND.name}`,
  },
  description: defaultSeo.description,
  keywords: defaultSeo.keywords,
  authors: [{ name: BRAND.name, url: baseUrl }],
  creator: BRAND.name,
  publisher: BRAND.name,
  applicationName: BRAND.shortName,
  referrer: "origin-when-cross-origin",
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: BRAND.name,
    title: defaultSeo.title,
    description: defaultSeo.description,
    url: baseUrl,
    images: [{ url: `${baseUrl}/logo.png`, width: 1200, height: 630, alt: BRAND.name }],
  },
  twitter: {
    card: "summary_large_image",
    title: defaultSeo.title,
    description: defaultSeo.description,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "48x48" },
    ],
    shortcut: "/favicon.ico",
    apple: "/logo.png",
  },
  manifest: "/manifest.webmanifest",
  category: "technology",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = buildRootJsonLd(baseUrl);

  return (
    <html lang="tr" className="scroll-smooth">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/icon.png" type="image/png" sizes="48x48" />
        <link rel="apple-touch-icon" href="/logo.png" />
        <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossOrigin="anonymous" />
        <noscript>
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" />
        </noscript>
      </head>
      <body className={`${inter.variable} font-sans antialiased text-slate-900`} style={{ backgroundColor: '#f4f9ff' }}>
        <SessionProvider>
          <FontAwesomeAsync />
          <Suspense fallback={null}>
            <VisitTracker />
          </Suspense>
          <JsonLd data={jsonLd} />
          {children}
          {process.env.NODE_ENV === "development" ? (
            <Suspense fallback={null}>
              <DevMobilePreview />
            </Suspense>
          ) : null}
        </SessionProvider>
      </body>
    </html>
  );
}
