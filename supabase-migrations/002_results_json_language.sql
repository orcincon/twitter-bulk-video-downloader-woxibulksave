-- Add results_json, language, total_size_display for CRS requirements
-- Run in Supabase SQL Editor

ALTER TABLE analysis_logs ADD COLUMN IF NOT EXISTS results_json JSONB;
ALTER TABLE analysis_logs ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE analysis_logs ADD COLUMN IF NOT EXISTS total_size_display TEXT;

-- total_size (BIGINT) kept for backwards compat; total_size_display holds "156 MB" format
