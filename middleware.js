import { NextResponse } from 'next/server';
import { sites } from './wbs-config.js';

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
  if (STATIC_FILE_EXTENSIONS.test(pathname)) return false;
  return true;
}

export function middleware(request) {
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

  let siteId = HOST_ALIASES[hostname] ?? (hostname in sites && hostname !== 'localhost' ? hostname : DEFAULT_SITE);

  const response = NextResponse.next();
  response.headers.set('x-site-id', siteId);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
};
