'use client';

import { useEffect } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { isKamikazePath } from '@/lib/record-site-visit.js';

const GA_ID = 'G-W5QRH3W5VV';

export default function GoogleAnalytics() {
  const pathname = usePathname();
  const isKamikaze = isKamikazePath(pathname);

  useEffect(() => {
    window[`ga-disable-${GA_ID}`] = isKamikaze;
  }, [isKamikaze]);

  if (isKamikaze) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}');
        `}
      </Script>
    </>
  );
}
