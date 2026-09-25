ALTER TABLE accounts ADD COLUMN password_hash TEXT;
ALTER TABLE accounts ADD COLUMN password_salt TEXT;
ALTER TABLE accounts ADD COLUMN password_iterations INTEGER;
ALTER TABLE accounts ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'owner'));
ALTER TABLE accounts ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN created_at INTEGER;
CREATE TABLE IF NOT EXISTS login_attempts (
  key_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS login_attempts_key_created ON login_attempts(key_hash, created_at DESC);
