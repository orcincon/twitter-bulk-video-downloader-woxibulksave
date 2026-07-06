-- RLS'i kapat - API zaten session kontrolü yapıyor
-- Supabase SQL Editor'da çalıştırın

ALTER TABLE analysis_logs DISABLE ROW LEVEL SECURITY;
