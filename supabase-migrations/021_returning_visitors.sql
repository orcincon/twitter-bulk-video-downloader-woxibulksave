-- Kamikaze: geri gelen ziyaretçi (visit_count >= 2) özet RPC'ye eklenir.
-- 019 zaten çalıştıysa yalnızca bu dosyayı çalıştırmak yeter.

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
    COALESCE((SELECT COUNT(*)::bigint FROM site_visit_visitors), 0) AS unique_visitors,
    COALESCE((SELECT COUNT(*)::bigint FROM site_visit_visitors WHERE visit_count >= 2), 0) AS returning_visitors
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
  'returningVisitors', (SELECT returning_visitors FROM totals),
  'pages', (SELECT data FROM pages),
  'referrers', (SELECT data FROM referrers),
  'daily', (SELECT data FROM daily)
);
$$;

REVOKE ALL ON FUNCTION kamikaze_visitor_stats(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION kamikaze_visitor_stats(integer) TO service_role;

COMMENT ON FUNCTION kamikaze_visitor_stats(integer) IS 'WBS Kamikaze: özet tablolardan toplam/tekil/geri gelen/sayfa/referans/günlük.';
