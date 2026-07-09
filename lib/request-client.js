/** İstekten istemci IP ve User-Agent okur (Vercel / proxy uyumlu). */

export function getClientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return null;
}

export function getUserAgent(request) {
  return request.headers.get('user-agent')?.trim() || null;
}
