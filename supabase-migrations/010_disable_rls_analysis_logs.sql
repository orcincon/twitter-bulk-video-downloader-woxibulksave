-- Ensure analysis_logs is always writable by the API (guest + authenticated).
-- RLS "Service only" (007) blocks anon; disabling RLS here allows backend to write.
-- Run in Supabase SQL Editor after 007. If dashboard shows "Table has RLS policies but RLS is not enabled", run 011 next.

ALTER TABLE analysis_logs DISABLE ROW LEVEL SECURITY;
