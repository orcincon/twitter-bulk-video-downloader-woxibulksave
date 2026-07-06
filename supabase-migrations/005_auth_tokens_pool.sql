-- Syndication auth_token havuzu (video çekmek için)
-- Supabase SQL Editor'da tek seferde çalıştırın

CREATE TABLE IF NOT EXISTS auth_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_active ON auth_tokens (is_active) WHERE is_active = true;

ALTER TABLE auth_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service can manage auth_tokens" ON auth_tokens;
CREATE POLICY "Service can manage auth_tokens"
  ON auth_tokens FOR ALL
  USING (true)
  WITH CHECK (true);

-- Tokenları ekle (zaten varsa atla)
INSERT INTO auth_tokens (token) VALUES ('eca466711e00b45cf82747f7916bf893360b284e')
ON CONFLICT (token) DO NOTHING;
INSERT INTO auth_tokens (token) VALUES ('7e08bb0e0f4dd47fd2135f62ffffb14594092ad4')
ON CONFLICT (token) DO NOTHING;
