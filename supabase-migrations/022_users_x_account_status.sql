-- X hesabının güncel durumu (ok / deleted / suspended)
-- Supabase SQL Editor'da çalıştırın

ALTER TABLE users ADD COLUMN IF NOT EXISTS x_account_status TEXT;

CREATE INDEX IF NOT EXISTS idx_users_x_account_status
  ON users (x_account_status)
  WHERE x_account_status IS NOT NULL;
