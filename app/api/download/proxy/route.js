import { NextResponse } from 'next/server';
import { buildDownloadFileName } from '@/lib/download-filename.js';

const ALLOWED_HOSTS = [
  'video.twimg.com',
  'pbs.twimg.com',
  'abs.twimg.com',
  'cdn.video.pscp.tv',
  'v.redd.it',
  'i.redd.it',
];

function isAllowedVideoUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host.includes('twimg.com')) return true;
    return ALLOWED_HOSTS.some((h) => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const videoUrl = searchParams.get('url');

    if (!videoUrl) {
      return NextResponse.json({ error: 'URL parameter required' }, { status: 400 });
    }

    const decoded = decodeURIComponent(videoUrl);
    if (!isAllowedVideoUrl(decoded)) {
      return NextResponse.json({ error: 'Invalid or disallowed video URL' }, { status: 400 });
    }

    const res = await fetch(decoded, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: '*/*',
      },
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Download Failed</title></head><body style="font-family:sans-serif;padding:2rem;text-align:center;"><h2>Download link expired, please retry</h2><p><a href="javascript:window.close()">Close</a></p></body></html>';
      return new NextResponse(html, {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    const contentType = res.headers.get('content-type') || 'video/mp4';
    const contentLength = res.headers.get('content-length');
    let filename = searchParams.get('filename');
    if (filename && typeof filename === 'string') {
      filename = decodeURIComponent(filename).replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 100);
      const hasExt = /\.(mp4|webm|mov|jpg|jpeg|png|webp|gif)$/i.test(filename);
      if (!hasExt) filename += '.mp4';
    }
    const dispName = filename || buildDownloadFileName('mp4');
    const disposition = `attachment; filename="${dispName}"`;

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Content-Disposition', disposition);
    if (contentLength) headers.set('Content-Length', contentLength);

    return new NextResponse(res.body, {
      status: 200,
      headers,
    });
  } catch (err) {
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Download Failed</title></head><body style="font-family:sans-serif;padding:2rem;text-align:center;"><h2>Download link expired, please retry</h2><p><a href="javascript:window.close()">Close</a></p></body></html>';
    return new NextResponse(html, {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}
