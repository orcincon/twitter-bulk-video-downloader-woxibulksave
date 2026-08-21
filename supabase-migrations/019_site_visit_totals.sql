-- Ziyaretçi özeti: tek tek sayfa görüntüleme satırı tutulmaz.
-- Toplam / tekil / sayfa / referans / günlük sayaçlar kalır; ham site_visits boşaltılır.

CREATE TABLE IF NOT EXISTS site_visit_visitors (
  visitor_key TEXT PRIMARY KEY,
  visit_count INTEGER NOT NULL DEFAULT 1,
  last_seen_on DATE NOT NULL DEFAULT ((timezone('Europe/Istanbul', now()))::date)
);

CREATE TABLE IF NOT EXISTS site_visit_daily (
  day DATE PRIMARY KEY,
  visits INTEGER NOT NULL DEFAULT 0,
  unique_visitors INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS site_visit_pages (
  path TEXT PRIMARY KEY,
  visits INTEGER NOT NULL DEFAULT 0,
  unique_visitors INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS site_visit_referrers (
  referrer_key TEXT PRIMARY KEY,
  referrer TEXT,
  visits INTEGER NOT NULL DEFAULT 0,
  unique_visitors INTEGER NOT NULL DEFAULT 0
);

-- Günlük tekil için kısa ömürlü; sayaç daily tablosuna yazıldıktan sonra eski günler silinir.
CREATE TABLE IF NOT EXISTS site_visit_daily_uniques (
  day DATE NOT NULL,
  visitor_key TEXT NOT NULL,
  PRIMARY KEY (day, visitor_key)
);

CREATE TABLE IF NOT EXISTS site_visit_page_uniques (
  path TEXT NOT NULL,
  visitor_key TEXT NOT NULL,
  PRIMARY KEY (path, visitor_key)
);

CREATE TABLE IF NOT EXISTS site_visit_referrer_uniques (
  referrer_key TEXT NOT NULL,
  visitor_key TEXT NOT NULL,
  PRIMARY KEY (referrer_key, visitor_key)
);

ALTER TABLE site_visit_visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_visit_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_visit_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_visit_referrers ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_visit_daily_uniques ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_visit_page_uniques ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_visit_referrer_uniques ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION kamikaze_normalize_visit_path(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(regexp_replace(split_part(btrim(COALESCE(p, '')), '?', 1), '/+$', ''), ''),
    '/'
  );
$$;

CREATE OR REPLACE FUNCTION record_site_visit(
  p_visitor_key text,
  p_path text DEFAULT '/',
  p_referrer text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day date := (timezone('Europe/Istanbul', now()))::date;
  v_path text;
  v_ref text;
  v_ref_key text;
  v_key text;
BEGIN
  v_key := NULLIF(btrim(COALESCE(p_visitor_key, '')), '');
  IF v_key IS NULL THEN
    v_key := 'anon:unknown';
  END IF;

  v_path := left(kamikaze_normalize_visit_path(p_path), 200);
  v_ref := NULLIF(left(btrim(COALESCE(p_referrer, '')), 500), '');
  v_ref_key := COALESCE(v_ref, '');

  INSERT INTO site_visit_visitors (visitor_key, visit_count, last_seen_on)
  VALUES (v_key, 1, v_day)
  ON CONFLICT (visitor_key) DO UPDATE
    SET visit_count = site_visit_visitors.visit_count + 1,
        last_seen_on = EXCLUDED.last_seen_on;

  INSERT INTO site_visit_daily (day, visits, unique_visitors)
  VALUES (v_day, 1, 0)
  ON CONFLICT (day) DO UPDATE
    SET visits = site_visit_daily.visits + 1;

  INSERT INTO site_visit_daily_uniques (day, visitor_key)
  VALUES (v_day, v_key)
  ON CONFLICT DO NOTHING;
  IF FOUND THEN
    UPDATE site_visit_daily
    SET unique_visitors = unique_visitors + 1
    WHERE day = v_day;
  END IF;

  INSERT INTO site_visit_pages (path, visits, unique_visitors)
  VALUES (v_path, 1, 0)
  ON CONFLICT (path) DO UPDATE
    SET visits = site_visit_pages.visits + 1;

  INSERT INTO site_visit_page_uniques (path, visitor_key)
  VALUES (v_path, v_key)
  ON CONFLICT DO NOTHING;
  IF FOUND THEN
    UPDATE site_visit_pages
    SET unique_visitors = unique_visitors + 1
    WHERE path = v_path;
  END IF;

  INSERT INTO site_visit_referrers (referrer_key, referrer, visits, unique_visitors)
  VALUES (v_ref_key, v_ref, 1, 0)
  ON CONFLICT (referrer_key) DO UPDATE
    SET visits = site_visit_referrers.visits + 1;

  INSERT INTO site_visit_referrer_uniques (referrer_key, visitor_key)
  VALUES (v_ref_key, v_key)
  ON CONFLICT DO NOTHING;
  IF FOUND THEN
    UPDATE site_visit_referrers
    SET unique_visitors = unique_visitors + 1
    WHERE referrer_key = v_ref_key;
  END IF;

  DELETE FROM site_visit_daily_uniques WHERE day < v_day - 2;
END;
$$;

REVOKE ALL ON FUNCTION record_site_visit(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_site_visit(text, text, text) TO service_role;

-- Mevcut ham kayıtları sayaçlara aktar, sonra tek tek satırları sil.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'site_visits'
  ) AND EXISTS (SELECT 1 FROM site_visits LIMIT 1) THEN
    INSERT INTO site_visit_visitors (visitor_key, visit_count, last_seen_on)
    SELECT
      COALESCE(NULLIF(btrim(visitor_key), ''), 'anon:unknown'),
      COUNT(*)::int,
      MAX((timezone('Europe/Istanbul', created_at))::date)
    FROM site_visits
    GROUP BY 1
    ON CONFLICT (visitor_key) DO UPDATE
      SET visit_count = site_visit_visitors.visit_count + EXCLUDED.visit_count,
          last_seen_on = GREATEST(site_visit_visitors.last_seen_on, EXCLUDED.last_seen_on);

    INSERT INTO site_visit_daily (day, visits, unique_visitors)
    SELECT
      (timezone('Europe/Istanbul', created_at))::date,
      COUNT(*)::int,
      COUNT(DISTINCT visitor_key)::int
    FROM site_visits
    GROUP BY 1
    ON CONFLICT (day) DO UPDATE
      SET visits = site_visit_daily.visits + EXCLUDED.visits;

    INSERT INTO site_visit_pages (path, visits, unique_visitors)
    SELECT
      kamikaze_normalize_visit_path(path),
      COUNT(*)::int,
      COUNT(DISTINCT visitor_key)::int
    FROM site_visits
    GROUP BY 1
    ON CONFLICT (path) DO UPDATE
      SET visits = site_visit_pages.visits + EXCLUDED.visits,
          unique_visitors = GREATEST(site_visit_pages.unique_visitors, EXCLUDED.unique_visitors);

    INSERT INTO site_visit_page_uniques (path, visitor_key)
    SELECT DISTINCT
      kamikaze_normalize_visit_path(path),
      COALESCE(NULLIF(btrim(visitor_key), ''), 'anon:unknown')
    FROM site_visits
    ON CONFLICT DO NOTHING;

    INSERT INTO site_visit_referrers (referrer_key, referrer, visits, unique_visitors)
    SELECT
      COALESCE(NULLIF(btrim(referrer), ''), ''),
      NULLIF(btrim(referrer), ''),
      COUNT(*)::int,
      COUNT(DISTINCT visitor_key)::int
    FROM site_visits
    GROUP BY 1, 2
    ON CONFLICT (referrer_key) DO UPDATE
      SET visits = site_visit_referrers.visits + EXCLUDED.visits,
          unique_visitors = GREATEST(site_visit_referrers.unique_visitors, EXCLUDED.unique_visitors);

    INSERT INTO site_visit_referrer_uniques (referrer_key, visitor_key)
    SELECT DISTINCT
      COALESCE(NULLIF(btrim(referrer), ''), ''),
      COALESCE(NULLIF(btrim(visitor_key), ''), 'anon:unknown')
    FROM site_visits
    ON CONFLICT DO NOTHING;

    INSERT INTO site_visit_daily_uniques (day, visitor_key)
    SELECT DISTINCT
      (timezone('Europe/Istanbul', created_at))::date,
      COALESCE(NULLIF(btrim(visitor_key), ''), 'anon:unknown')
    FROM site_visits
    WHERE (timezone('Europe/Istanbul', created_at))::date >= (timezone('Europe/Istanbul', now()))::date - 2
    ON CONFLICT DO NOTHING;

    TRUNCATE site_visits;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION kamikaze_visitor_stats(p_daily_days integer DEFAULT 15)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH totals AS (
  SELECT
    COALESCE((SELECT SUM(visits)::bigint FROM site_visit_daily), 0) AS total_visits,
    COALESCE((SELECT COUNT(*)::bigint FROM site_visit_visitors), 0) AS unique_visitors
),
pages AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.visits DESC, p.path ASC), '[]'::jsonb) AS data
  FROM (
    SELECT
      path,
      visits,
      unique_visitors AS "uniqueVisitors"
    FROM site_visit_pages
  ) p
),
referrers AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.visits DESC), '[]'::jsonb) AS data
  FROM (
    SELECT
      referrer,
      visits,
      unique_visitors AS "uniqueVisitors"
    FROM site_visit_referrers
  ) r
),
day_bounds AS (
  SELECT (timezone('Europe/Istanbul', now()))::date AS today
),
days AS (
  SELECT generate_series(
    (SELECT today FROM day_bounds) - (GREATEST(COALESCE(p_daily_days, 15), 1) - 1),
    (SELECT today FROM day_bounds),
    interval '1 day'
  )::date AS period
),
daily AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.period DESC), '[]'::jsonb) AS data
  FROM (
    SELECT
      days.period::text AS period,
      COALESCE(s.visits, 0)::int AS "totalVisits",
      COALESCE(s.unique_visitors, 0)::int AS "uniqueVisitors"
    FROM days
    LEFT JOIN site_visit_daily s ON s.day = days.period
  ) d
)
SELECT jsonb_build_object(
  'totalVisits', (SELECT total_visits FROM totals),
  'uniqueVisitors', (SELECT unique_visitors FROM totals),
  'pages', (SELECT data FROM pages),
  'referrers', (SELECT data FROM referrers),
  'daily', (SELECT data FROM daily)
);
$$;

REVOKE ALL ON FUNCTION kamikaze_visitor_stats(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION kamikaze_visitor_stats(integer) TO service_role;
REVOKE ALL ON FUNCTION kamikaze_normalize_visit_path(text) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION record_site_visit(text, text, text) IS 'WBS: sayfa görüntülemeyi sayaçlara yazar, ham satır tutmaz.';
COMMENT ON FUNCTION kamikaze_visitor_stats(integer) IS 'WBS Kamikaze: özet tablolardan toplam/tekil/sayfa/referans/günlük.';
