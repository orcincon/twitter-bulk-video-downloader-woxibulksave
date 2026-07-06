-- Soft-delete: kullanıcı "sildiğinde" satır silinmez, sadece gizlenir.
-- GET sadece is_hidden = false döner; silme işlemi is_hidden = true yapar.

ALTER TABLE analysis_logs
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_analysis_logs_user_hidden
  ON analysis_logs (user_id, is_hidden)
  WHERE is_hidden = false;

COMMENT ON COLUMN analysis_logs.is_hidden IS 'WBS: true = kullanıcıya gizlendi (soft-delete), satır silinmez.';
