-- X (Twitter) username (@handle) for registered users
-- Supabase SQL Editor'da çalıştırın

ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;

CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
