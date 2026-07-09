'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const STORAGE_KEY = 'wbs-dev-mobile-preview';
const EMBED_PARAM = '__mobile_preview';

const DEVICES = [
  { id: 'iphone-se', label: 'iPhone SE', width: 375 },
  { id: 'iphone-14', label: 'iPhone 14', width: 390 },
  { id: 'iphone-14-pro-max', label: 'iPhone 14 Pro Max', width: 430 },
];

function readStoredState() {
  if (typeof window === 'undefined') return { open: false, deviceId: 'iphone-14' };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { open: false, deviceId: 'iphone-14' };
    const parsed = JSON.parse(raw);
    return {
      open: Boolean(parsed.open),
      deviceId: DEVICES.some((d) => d.id === parsed.deviceId) ? parsed.deviceId : 'iphone-14',
    };
  } catch {
    return { open: false, deviceId: 'iphone-14' };
  }
}

export default function DevMobilePreview() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [deviceId, setDeviceId] = useState('iphone-14');

  const isEmbed = searchParams.get(EMBED_PARAM) === '1';

  useEffect(() => {
    const stored = readStoredState();
    setOpen(stored.open);
    setDeviceId(stored.deviceId);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ open, deviceId }));
  }, [open, deviceId, ready]);

  const device = useMemo(
    () => DEVICES.find((d) => d.id === deviceId) || DEVICES[1],
    [deviceId]
  );

  const iframeSrc = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(EMBED_PARAM, '1');
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : `${pathname}?${EMBED_PARAM}=1`;
  }, [pathname, searchParams]);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  if (process.env.NODE_ENV !== 'development' || isEmbed) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        className="fixed bottom-4 left-4 z-[10000] flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-lg ring-1 ring-white/10 transition hover:bg-slate-800"
        aria-expanded={open}
        aria-controls="wbs-dev-mobile-preview-panel"
        title="Mobil tasarım önizlemesini aç/kapat"
      >
        <span aria-hidden>📱</span>
        {open ? 'Mobil önizlemeyi kapat' : 'Mobil önizleme'}
      </button>

      {open ? (
        <aside
          id="wbs-dev-mobile-preview-panel"
          className="fixed right-4 top-4 bottom-4 z-[9999] flex w-[min(100vw-2rem,28rem)] flex-col rounded-[2rem] border border-slate-300 bg-slate-100 p-3 shadow-2xl"
          aria-label="Mobil tasarım önizlemesi"
        >
          <div className="mb-3 flex items-center justify-between gap-2 px-1">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Dev only</p>
              <p className="text-sm font-semibold text-slate-800">Mobil önizleme</p>
            </div>
            <button
              type="button"
              onClick={toggle}
              className="rounded-lg px-2 py-1 text-sm font-medium text-slate-600 hover:bg-white"
              aria-label="Mobil önizlemeyi kapat"
            >
              ✕
            </button>
          </div>

          <label className="mb-3 px-1 text-xs font-medium text-slate-600">
            Cihaz
            <select
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
            >
              {DEVICES.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label} ({d.width}px)
                </option>
              ))}
            </select>
          </label>

          <div className="flex min-h-0 flex-1 items-start justify-center overflow-hidden rounded-[1.5rem] border border-slate-300 bg-white p-2">
            <div
              className="h-full overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white shadow-inner"
              style={{ width: device.width, maxWidth: '100%' }}
            >
              <iframe
                key={`${iframeSrc}-${device.width}`}
                title={`Mobil önizleme - ${device.label}`}
                src={iframeSrc}
                className="h-full w-full border-0 bg-white"
                style={{ width: device.width, maxWidth: '100%' }}
              />
            </div>
          </div>

          <p className="mt-3 px-1 text-center text-[11px] leading-snug text-slate-500">
            Gerçek mobil breakpoint&apos;leri için iframe kullanılır. Sayfa değiştikçe önizleme senkron kalır.
          </p>
        </aside>
      ) : null}
    </>
  );
}
