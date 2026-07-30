import { NextResponse } from 'next/server';
import { fetchFixTweetRaw, parseFixTweetMetadata } from '@/lib/fixtweet.js';

const TWITTER_URL_REGEX = /https?:\/\/(?:www\.|mobile\.)?(?:x\.com|twitter\.com)\/[^/]+\/status\/(\d+)/;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ metadata: null }, { status: 400 });
    }
    const m = String(url).match(TWITTER_URL_REGEX);
    if (!m) return NextResponse.json({ metadata: null }, { status: 400 });
    const clean = url.trim().split('?')[0];
    const data = await fetchFixTweetRaw(clean);
    const metadata = parseFixTweetMetadata(data);
    return NextResponse.json(
      { metadata },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
    );
  } catch (_) {
    return NextResponse.json({ metadata: null }, { status: 500 });
  }
}
