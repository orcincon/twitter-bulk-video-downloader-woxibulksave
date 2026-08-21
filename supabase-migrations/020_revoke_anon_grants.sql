-- Linter 0011 / 0026 / 0027 / 0028 / 0029:
-- Anon key tarayıcıda olduğu için SECURITY DEFINER fonksiyonlar ve SELECT grant'leri kapatılmalı.
-- API service_role ile çalışır; bu REVOKE onu bozmaz.

ALTER FUNCTION public.kamikaze_normalize_visit_path(text) SET search_path = public;

REVOKE ALL ON FUNCTION public.kamikaze_normalize_visit_path(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_site_visit(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kamikaze_visitor_stats(integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_site_visit(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.kamikaze_visitor_stats(integer) TO service_role;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'analysis_history',
    'analysis_logs',
    'auth_tokens',
    'email_verifications',
    'site_visit_daily',
    'site_visit_daily_uniques',
    'site_visit_page_uniques',
    'site_visit_pages',
    'site_visit_referrer_uniques',
    'site_visit_referrers',
    'site_visit_visitors',
    'site_visits',
    'users'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    END IF;
  END LOOP;
END $$;
