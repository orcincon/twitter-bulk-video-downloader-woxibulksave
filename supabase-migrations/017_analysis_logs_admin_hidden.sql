-- Kamikaze soft-delete: admin listesinden gizle, kullanıcının arşivi kalır.
-- Hard delete satırı siler; soft delete yalnızca admin_hidden = true yapar.

ALTER TABLE analysis_logs
  ADD COLUMN IF NOT EXISTS admin_hidden BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_analysis_logs_admin_hidden
  ON analysis_logs (created_at DESC)
  WHERE admin_hidden = false;

COMMENT ON COLUMN analysis_logs.admin_hidden IS 'WBS: true = Kamikaze listesinden gizlendi (soft-delete), kullanıcı arşivinde kalır.';
