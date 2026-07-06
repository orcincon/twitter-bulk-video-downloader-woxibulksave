-- RLS güvenlik düzeltmesi: anon rolüne erişimi kapat
-- Service role (API) RLS'i bypass eder, çalışmaya devam eder
-- Supabase SQL Editor'da çalıştırın

-- Tüm tablolarda RLS açık olmalı
ALTER TABLE analysis_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own logs" ON analysis_logs;
DROP POLICY IF EXISTS "Users can insert own logs" ON analysis_logs;
DROP POLICY IF EXISTS "Service only" ON analysis_logs;
CREATE POLICY "Service only"
  ON analysis_logs FOR ALL
  USING (false)
  WITH CHECK (false);

-- users (RLS kapalıysa policy oluşamaz - önce ENABLE)
DROP POLICY IF EXISTS "Service can manage users" ON users;
DROP POLICY IF EXISTS "Service only" ON users;
CREATE POLICY "Service only"
  ON users FOR ALL
  USING (false)
  WITH CHECK (false);

-- auth_tokens
DROP POLICY IF EXISTS "Service can manage auth_tokens" ON auth_tokens;
DROP POLICY IF EXISTS "Service only" ON auth_tokens;
CREATE POLICY "Service only"
  ON auth_tokens FOR ALL
  USING (false)
  WITH CHECK (false);
