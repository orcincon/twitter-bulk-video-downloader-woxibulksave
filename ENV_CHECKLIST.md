# .env.local ve NextAuth uyum kontrolü

`.env.local` dosyası repoda yok (güvenlik). Aşağıdakileri kendi ortamınızda kontrol edin.

## 1. NEXTAUTH_URL (kod: `lib/auth.js`)

- **Production (Vercel):** Tam site adresi, **sonda slash olmamalı**
  - Doğru: `https://www.woxibulksave.com`
  - Yanlış: `https://www.woxibulksave.com/`
- **Local:** `http://localhost:3000`
- Kod önceliği: `NEXTAUTH_URL` → `NEXT_PUBLIC_SITE_URL` → `http://localhost:3000`
- Twitter OAuth callback bu URL üzerinden döner; yanlışsa giriş sonrası yönlendirme bozulur.

## 2. NEXT_PUBLIC_SITE_URL (kod: `lib/seo.js`, `app/layout.tsx`)

- **Production:** NEXTAUTH_URL ile aynı olmalı: `https://www.woxibulksave.com`
- **Local:** `http://localhost:3000`
- SEO, sitemap, metadata ve auth fallback için kullanılır.

## 3. NEXTAUTH_SECRET (kod: `lib/auth.js`)

- **Production:** Mutlaka dolu ve güçlü rastgele string (örn. `openssl rand -base64 32`).
- Boş bırakılırsa kod `fallback-dev-secret-change-in-production` kullanır (güvensiz).
- Secret değiştirilirse tüm mevcut oturumlar geçersiz olur; kullanıcılar tekrar giriş yapmalı.

## 4. Hızlı kontrol

| Ortam      | NEXTAUTH_URL                      | NEXT_PUBLIC_SITE_URL               | NEXTAUTH_SECRET   |
|-----------|------------------------------------|-------------------------------------|-------------------|
| Production| `https://www.woxibulksave.com`    | `https://www.woxibulksave.com`      | Dolu, güçlü       |
| Local     | `http://localhost:3000`           | `http://localhost:3000`            | Dolu veya fallback|

Vercel’de bu üç değişkenin de tanımlı ve production satırındaki gibi olduğundan emin olun.

## 5. Supabase (veritabanı yazma)

.env.local ve kod (lib/supabase.js) aynı isimleri kullanmalı: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY veya NEXT_PUBLIC_SUPABASE_ANON_KEY. Tablo: analysis_logs. Konsol: `New record added: <uuid>` veya `Error: ...`
