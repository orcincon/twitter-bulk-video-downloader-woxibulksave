-- Store client IP and User-Agent for each analysis (guest and registered) for Kamikaze user management
ALTER TABLE analysis_logs ADD COLUMN IF NOT EXISTS client_ip TEXT;
ALTER TABLE analysis_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;

CREATE INDEX IF NOT EXISTS idx_analysis_logs_client_ip ON analysis_logs (client_ip) WHERE client_ip IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analysis_logs_user_id_guest ON analysis_logs (user_id) WHERE user_id = 'guest';
