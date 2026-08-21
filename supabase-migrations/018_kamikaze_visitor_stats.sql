-- Kamikaze ziyaretçi özeti: satırları API'ye çekmeden DB'de say.
-- Her sayfa görüntüleme site_visits'te ayrı satır durur; bu fonksiyon toplamı COUNT ile verir.

CREATE OR REPLACE FUNCTION kamikaze_visitor_stats(p_daily_days integer DEFAULT 15)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH totals AS (
  SELECT
    COUNT(*)::bigint AS total_visits,
    COUNT(DISTINCT visitor_key)::bigint AS unique_visitors
  FROM site_visits
),
normalized AS (
  SELECT
    visitor_key,
    COALESCE(
      NULLIF(regexp_replace(split_part(btrim(COALESCE(path, '')), '?', 1), '/+$', ''), ''),
      '/'
    ) AS path,
    NULLIF(btrim(COALESCE(referrer, '')), '') AS referrer,
    created_at
  FROM site_visits
),
pages AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.visits DESC, p.path ASC), '[]'::jsonb) AS data
  FROM (
    SELECT
      path,
      COUNT(*)::int AS visits,
      COUNT(DISTINCT visitor_key)::int AS "uniqueVisitors"
    FROM normalized
    GROUP BY path
  ) p
),
referrers AS (
  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.visits DESC), '[]'::jsonb) AS data
  FROM (
    SELECT
      referrer,
      COUNT(*)::int AS visits,
      COUNT(DISTINCT visitor_key)::int AS "uniqueVisitors"
    FROM normalized
    GROUP BY referrer
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
      COUNT(n.created_at)::int AS "totalVisits",
      COUNT(DISTINCT n.visitor_key)::int AS "uniqueVisitors"
    FROM days
    LEFT JOIN normalized n
      ON (timezone('Europe/Istanbul', n.created_at))::date = days.period
    GROUP BY days.period
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

REVOKE ALL ON FUNCTION kamikaze_visitor_stats(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kamikaze_visitor_stats(integer) TO service_role;

COMMENT ON FUNCTION kamikaze_visitor_stats(integer) IS 'WBS Kamikaze: site_visits toplam/tekil/sayfa/referans/günlük özeti.';
