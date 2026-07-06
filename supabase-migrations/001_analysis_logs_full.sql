-- Analysis logs table - tam kurulum (tablo yoksa çalıştır)
-- Supabase SQL Editor'da bu dosyayı çalıştırın

CREATE TABLE IF NOT EXISTS analysis_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  urls JSONB NOT NULL DEFAULT '[]',
  results_json JSONB,
  link_count INTEGER NOT NULL DEFAULT 0,
  video_count INTEGER NOT NULL DEFAULT 0,
  total_size BIGINT,
  total_size_display TEXT,
  language TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE analysis_logs ENABLE ROW LEVEL SECURITY;

-- Policy'ler tablo ilk kez oluşturuluyorsa eklenir (zaten varsa hata verir, tekrar çalıştırma gerekmez)
CREATE POLICY "Users can read own logs"
  ON analysis_logs FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own logs"
  ON analysis_logs FOR INSERT
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_analysis_logs_user_id ON analysis_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_analysis_logs_created_at ON analysis_logs (created_at DESC);
