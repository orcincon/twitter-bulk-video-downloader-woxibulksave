import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decode } from 'next-auth/jwt';

/** Sadece development'ta çalışır - JWT bilgisini döner (troubleshooting için) */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 });
  }
  const cookieStore = await cookies();
  const sessionToken =
    cookieStore.get('next-auth.session-token')?.value ||
    cookieStore.get('__Secure-next-auth.session-token')?.value;
  let decoded = null;
  if (sessionToken) {
    try {
      decoded = await decode({
        token: sessionToken,
        secret: process.env.NEXTAUTH_SECRET,
      });
    } catch (_) {}
  }
  const userId = decoded?.sub || decoded?.email || null;
  return NextResponse.json({
    hasCookie: !!sessionToken,
    hasToken: !!decoded,
    userId,
    userName: decoded?.name,
    userEmail: decoded?.email,
    tokenKeys: decoded ? Object.keys(decoded) : [],
  });
}
