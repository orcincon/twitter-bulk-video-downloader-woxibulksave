-- Users table: X (Twitter) ile giriş yapan kullanıcıları Supabase'e kaydet
-- Supabase SQL Editor'da çalıştırın

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  name TEXT,
  image TEXT,
  preferred_language TEXT DEFAULT 'en',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- RLS (service role bypasses)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service can manage users"
  ON users FOR ALL
  USING (true)
  WITH CHECK (true);
