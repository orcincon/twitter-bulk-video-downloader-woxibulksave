import { NextResponse } from 'next/server';
import { sites } from './wbs-config.js';
import { buildVisitRow, recordSiteVisit, shouldSkipVisit } from './lib/record-site-visit.js';
import { getClientIp, getUserAgent } from './lib/request-client.js';
import { isKamikazeSession } from './lib/kamikaze-session.js';

const DEFAULT_SITE = 'woxibulksave.com';
const HOST_ALIASES = { 'www.woxibulksave.com': DEFAULT_SITE };

const VALID_PAGE_PATHS = new Set([
  '/',
  '/gecmis',
  '/results',
  '/terms',
  '/dmca',
  '/sss',
  '/kamikaze',
]);

const VISIT_PAGE_PATHS = new Set(
  [...VALID_PAGE_PATHS].filter((p) => p.toLowerCase() !== '/kamikaze')
);

const STATIC_FILE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|ico|txt|xml|json|js|css|woff2?|ttf|map|webmanifest)$/i;

function normalizePath(pathname) {
  if (pathname !== '/' && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function isPageRequest(pathname) {
  if (pathname.startsWith('/api/')) return false;
  if (pathname.startsWith('/_next/')) return false;
  if (pathname === '/icon' || pathname === '/apple-icon') return false;
  if (STATIC_FILE_EXTENSIONS.test(pathname)) return false;
  return true;
}

function isPrefetchRequest(request) {
  const purpose = request.headers.get('purpose') || request.headers.get('sec-purpose') || '';
  if (purpose.includes('prefetch')) return true;
  if (request.headers.get('x-middleware-prefetch')) return true;
  return false;
}

function shouldRecordPageVisit(request, path, kamikazeSession) {
  if (request.method !== 'GET') return false;
  if (!VISIT_PAGE_PATHS.has(path)) return false;
  if (isPrefetchRequest(request)) return false;
  const referer = request.headers.get('referer');
  if (shouldSkipVisit({ path, referrer: referer, kamikazeSession })) return false;
  return true;
}

function queuePageVisit(request, path, event) {
  const referer = request.headers.get('referer');
  const row = buildVisitRow({
    path,
    referrer: referer,
    clientIp: getClientIp(request),
    userAgent: getUserAgent(request),
  });

  const task = recordSiteVisit(row).then((result) => {
    if (!result.ok && result.error !== 'NO_SERVICE_ROLE') {
      console.warn('[middleware/visit]', result.error);
    }
  });

  if (event?.waitUntil) {
    event.waitUntil(task);
  } else {
    void task;
  }
}

export async function middleware(request, event) {
  const { pathname } = request.nextUrl;
  const path = normalizePath(pathname);

  if (isPageRequest(path) && !VALID_PAGE_PATHS.has(path)) {
    const redirectUrl = new URL('/', request.url);
    const lang = request.nextUrl.searchParams.get('lang');
    if (lang) redirectUrl.searchParams.set('lang', lang);
    return NextResponse.redirect(redirectUrl, 301);
  }

  const hostHeader = request.headers.get('host') || '';
  const hostname = hostHeader.split(':')[0].toLowerCase();

  const siteId = HOST_ALIASES[hostname] ?? (hostname in sites && hostname !== 'localhost' ? hostname : DEFAULT_SITE);

  const response = NextResponse.next();
  response.headers.set('x-site-id', siteId);

  const kamikazeSession = await isKamikazeSession(request.cookies.get('kamikaze')?.value);
  if (shouldRecordPageVisit(request, path, kamikazeSession)) {
    queuePageVisit(request, path, event);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|api/auth).*)'],
};
