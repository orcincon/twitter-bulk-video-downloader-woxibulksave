import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'enc:v1:';
const IV_LEN = 12;
const TAG_LEN = 16;

function deriveKey() {
  const secret = (process.env.TOKEN_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || '').trim();
  if (!secret) return null;
  return scryptSync(secret, 'wbs-oauth-token-v1', 32);
}

/** OAuth token'ı DB'ye yazmadan önce şifreler. Anahtar yoksa düz metin (geliştirme). */
export function encryptToken(plaintext) {
  if (plaintext == null || plaintext === '') return null;
  const text = String(plaintext);
  const key = deriveKey();
  if (!key) return text;
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64url');
}

/** DB'den okunan değeri çözer; eski düz metin kayıtlarla uyumludur. */
export function decryptToken(stored) {
  if (stored == null || stored === '') return null;
  const text = String(stored).trim();
  if (!text.startsWith(PREFIX)) return text;
  const key = deriveKey();
  if (!key) return null;
  try {
    const raw = Buffer.from(text.slice(PREFIX.length), 'base64url');
    if (raw.length < IV_LEN + TAG_LEN + 1) return null;
    const iv = raw.subarray(0, IV_LEN);
    const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ciphertext = raw.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(ciphertext) + decipher.final('utf8');
  } catch (_) {
    return null;
  }
}
