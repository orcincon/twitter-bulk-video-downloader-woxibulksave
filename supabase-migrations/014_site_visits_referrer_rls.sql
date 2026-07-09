-- site_visits: referrer kolonu + RLS açık (Restricted)
ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS referrer TEXT;

ALTER TABLE site_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service only" ON site_visits;
DROP POLICY IF EXISTS "Users can read own logs" ON site_visits;
DROP POLICY IF EXISTS "Public read" ON site_visits;
DROP POLICY IF EXISTS "Public insert" ON site_visits;

CREATE INDEX IF NOT EXISTS idx_site_visits_referrer ON site_visits (referrer) WHERE referrer IS NOT NULL;

COMMENT ON TABLE site_visits IS 'WBS sayfa ziyaretleri. RLS açık — erişim yalnızca service_role (API) üzerinden.';
