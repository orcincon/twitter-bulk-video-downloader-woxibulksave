'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { isKamikazePath } from '@/lib/record-site-visit.js';

function getOrCreateVisitorId() {
  if (typeof window === 'undefined') return null;
  const key = 'wbs_vid';
  try {
    let id = window.localStorage.getItem(key);
    if (!id) {
      id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `v-${Date.now()}`;
      window.localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return null;
  }
}

export default function VisitTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (!pathname || isKamikazePath(pathname)) return;

    // İlk tam sayfa yüklemesi middleware'de kaydedilir; çift sayımı önle.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const qs = searchParams?.toString();
    const path = qs ? `${pathname}?${qs}` : pathname;
    const referrer = typeof document !== 'undefined' ? document.referrer || null : null;
    const clientVisitorId = getOrCreateVisitorId();

    fetch('/api/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, referrer, clientVisitorId }),
      credentials: 'include',
      keepalive: true,
    }).catch(() => {});
  }, [pathname, searchParams]);

  return null;
}
