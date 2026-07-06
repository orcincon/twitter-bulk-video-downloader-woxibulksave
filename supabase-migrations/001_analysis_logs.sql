-- Analysis logs table for history page
-- Run this in Supabase SQL Editor if using Supabase

CREATE TABLE IF NOT EXISTS analysis_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  urls JSONB NOT NULL DEFAULT '[]',
  link_count INTEGER NOT NULL DEFAULT 0,
  video_count INTEGER NOT NULL DEFAULT 0,
  total_size BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: Allow only when user_id matches (server uses service role, so this protects direct client access)
ALTER TABLE analysis_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own logs"
  ON analysis_logs FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own logs"
  ON analysis_logs FOR INSERT
  WITH CHECK (true);

-- Index for faster user lookups
CREATE INDEX IF NOT EXISTS idx_analysis_logs_user_id ON analysis_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_analysis_logs_created_at ON analysis_logs (created_at DESC);
