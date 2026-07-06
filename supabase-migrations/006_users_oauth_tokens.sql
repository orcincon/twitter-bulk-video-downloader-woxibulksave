-- Users tablosuna OAuth token kolonları (havuz için)
-- Supabase SQL Editor'da çalıştırın

ALTER TABLE users ADD COLUMN IF NOT EXISTS access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_is_valid BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_users_token_valid ON users (token_is_valid) WHERE access_token IS NOT NULL AND (token_is_valid IS NULL OR token_is_valid = true);
