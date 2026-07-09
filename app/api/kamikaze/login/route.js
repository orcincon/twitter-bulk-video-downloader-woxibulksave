import { NextResponse } from 'next/server';
import { makeKamikazeToken } from '@/lib/kamikaze-session.js';

const COOKIE_NAME = 'kamikaze';
const COOKIE_OPTIONS = { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 7 }; // 7 days — path / so API receives cookie

export async function POST(request) {
  const allowedEmail = (process.env.KAMIKAZE_EMAIL || '').trim().toLowerCase();
  const allowedSecret = (process.env.KAMIKAZE_SECRET || '').trim();
  if (!allowedSecret) {
    return NextResponse.json({ ok: false, error: 'NOT_CONFIGURED' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const email = (typeof body?.email === 'string' ? body.email.trim() : '').toLowerCase();
    const password = (typeof body?.password === 'string' ? body.password : '').trim();

    if (allowedEmail) {
      if (email !== allowedEmail || password !== allowedSecret) {
        return NextResponse.json({ ok: false, error: 'INVALID_CREDENTIALS' }, { status: 401 });
      }
    } else {
      if (password !== allowedSecret) {
        return NextResponse.json({ ok: false, error: 'INVALID_CREDENTIALS' }, { status: 401 });
      }
    }

    const token = await makeKamikazeToken(allowedEmail, allowedSecret);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, token, {
      ...COOKIE_OPTIONS,
      secure: process.env.NODE_ENV === 'production',
    });
    return res;
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'BAD_REQUEST' }, { status: 400 });
  }
}
