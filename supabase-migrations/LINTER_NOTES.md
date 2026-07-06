# Supabase Linter Uyarıları ve Çözümleri

## 1. RLS Policy Always True (`rls_policy_always_true`)

**Uyarı:** `public.reports` tablosunda `reports_insert_all` policy'si `WITH CHECK (true)` ile sınırsız INSERT'e izin veriyor.

**Çözüm:**
- `008_fix_reports_rls_and_linter_notes.sql` dosyasını Supabase SQL Editor'da çalıştırın.
- Bu projede `reports` tablosu yoksa, tabloyu sizin oluşturduğunuz yerde (başka migration veya dashboard) aynı mantıkla policy'yi değiştirin: `INSERT` için sadece `authenticated` (veya gerekirse `anon`) rolüne izin veren bir policy kullanın.

**Referans:** https://supabase.com/docs/guides/database/database-linter?lint=0024_permissive_rls_policy

---

## 2. Leaked Password Protection Disabled (`auth_leaked_password_protection`)

**Uyarı:** Supabase Auth'ta "leaked password protection" kapalı; HaveIBeenPwned ile sızıntıya uğramış şifreler engellenmiyor.

**Çözüm (kod değil, panel):**
1. Supabase Dashboard → **Authentication** → **Providers** veya **Settings**
2. **Password** / **Security** bölümünde **"Leaked password protection"** veya **"Check passwords against HaveIBeenPwned"** seçeneğini açın.

**Referans:** https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Bu proje X (Twitter) OAuth kullanıyor; e-posta/şifre ile kayıt yoksa bu ayar yine de Auth ayarlarında açık tutulabilir (ileride email auth eklerseniz faydalı olur).
