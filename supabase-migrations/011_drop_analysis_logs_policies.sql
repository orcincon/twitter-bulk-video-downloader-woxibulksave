-- RLS kapalı (010) ama "Service only" policy hâlâ tanımlı olduğu için
-- Supabase uyarı veriyor: "Table has RLS policies but RLS is not enabled."
-- Policy'yi kaldırıyoruz; tablo RLS kapalı ve policy'siz tutarlı olur.

DROP POLICY IF EXISTS "Service only" ON analysis_logs;
DROP POLICY IF EXISTS "Users can read own logs" ON analysis_logs;
DROP POLICY IF EXISTS "Users can insert own logs" ON analysis_logs;
