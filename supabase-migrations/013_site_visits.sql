-- Site ziyaret kayıtları (Kamikaze ziyaretçi sekmesi)
CREATE TABLE IF NOT EXISTS site_visits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  visitor_key TEXT NOT NULL,
  client_ip TEXT,
  user_id TEXT,
  path TEXT,
  referrer TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_visits_created_at ON site_visits (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_visits_visitor_key ON site_visits (visitor_key);

CREATE INDEX IF NOT EXISTS idx_site_visits_referrer ON site_visits (referrer) WHERE referrer IS NOT NULL;

-- Yeni kurulumlarda RLS açık başlar (015 ile aynı). Mevcut DB: 015 migration'ını çalıştırın.
ALTER TABLE site_visits ENABLE ROW LEVEL SECURITY;
