export async function makeKamikazeToken(email, secret) {
  const data = new TextEncoder().encode(`${email || ''}:${secret}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function isKamikazeSession(cookieValue) {
  const secret = (process.env.KAMIKAZE_SECRET || '').trim();
  if (!secret || !cookieValue) return false;
  const email = (process.env.KAMIKAZE_EMAIL || '').trim().toLowerCase();
  const expected = await makeKamikazeToken(email, secret);
  return cookieValue === expected;
}
