-- Audit logs are append-only (spec §22.4): reject UPDATE and DELETE at
-- the database level so no application bug or compromised account with
-- table access can rewrite history.

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs;
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

-- Same protection for file access logs and login logs (evidence trails).
DROP TRIGGER IF EXISTS file_access_logs_append_only ON file_access_logs;
CREATE TRIGGER file_access_logs_append_only
  BEFORE UPDATE OR DELETE ON file_access_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

DROP TRIGGER IF EXISTS login_logs_append_only ON login_logs;
CREATE TRIGGER login_logs_append_only
  BEFORE UPDATE OR DELETE ON login_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
