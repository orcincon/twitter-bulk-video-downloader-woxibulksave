-- site_visits: RLS açık, public policy yok.
-- Sonuç: Supabase panelde "Restricted" görünür; anon/authenticated doğrudan erişemez.
-- API (SUPABASE_SERVICE_ROLE_KEY) RLS'i bypass eder — /api/visit ve Kamikaze okuması çalışmaya devam eder.

ALTER TABLE site_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service only" ON site_visits;
DROP POLICY IF EXISTS "Users can read own logs" ON site_visits;
DROP POLICY IF EXISTS "Public read" ON site_visits;
DROP POLICY IF EXISTS "Public insert" ON site_visits;

-- Bilinçli olarak yeni policy eklenmiyor (anon key ile doğrudan erişim kapalı).
