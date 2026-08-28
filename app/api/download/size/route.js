import { NextResponse } from 'next/server';
import { probeRemoteMediaBytes, isAllowedVideoUrl } from '@/lib/probe-media-bytes.js';

export async function GET(request) {
  try {
    const videoUrl = new URL(request.url).searchParams.get('url');
    if (!videoUrl) {
      return NextResponse.json({ error: 'URL parameter required', bytes: 0 }, { status: 400 });
    }
    const decoded = decodeURIComponent(videoUrl);
    if (!isAllowedVideoUrl(decoded)) {
      return NextResponse.json({ error: 'Invalid or disallowed video URL', bytes: 0 }, { status: 400 });
    }
    return NextResponse.json({ bytes: await probeRemoteMediaBytes(decoded) });
  } catch {
    return NextResponse.json({ bytes: 0 }, { status: 200 });
  }
}
