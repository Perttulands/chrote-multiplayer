-- CHROTE Multiplayer Initial Schema
-- CMP-ev4.2: Database Schema & Migrations

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'operator', 'admin', 'owner')),
  github_id TEXT UNIQUE,
  google_id TEXT UNIQUE,
  invited_by TEXT REFERENCES users(id),
  invite_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen_at INTEGER
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE INDEX IF NOT EXISTS users_github_id_idx ON users(github_id);
CREATE INDEX IF NOT EXISTS users_google_id_idx ON users(google_id);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);

-- Sessions table (user login sessions, not tmux sessions)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent TEXT,
  ip_address TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  last_active_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

-- Invites table
CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'operator', 'admin')),
  note TEXT,
  uses INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER,
  revoked INTEGER NOT NULL DEFAULT 0,
  revoked_at INTEGER,
  revoked_by TEXT REFERENCES users(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER
);

CREATE INDEX IF NOT EXISTS invites_token_hash_idx ON invites(token_hash);
CREATE INDEX IF NOT EXISTS invites_created_by_idx ON invites(created_by);

-- Claims table (terminal session claims)
CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  session_name TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  claim_type TEXT NOT NULL DEFAULT 'view' CHECK (claim_type IN ('control', 'view')),
  claimed_at INTEGER NOT NULL DEFAULT (unixepoch()),
  released_at INTEGER,
  expires_at INTEGER
);

CREATE INDEX IF NOT EXISTS claims_session_name_idx ON claims(session_name);
CREATE INDEX IF NOT EXISTS claims_user_id_idx ON claims(user_id);
CREATE INDEX IF NOT EXISTS claims_active_idx ON claims(session_name, released_at);

-- Presence table
CREATE TABLE IF NOT EXISTS presence (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'away', 'offline')),
  current_session TEXT,
  current_view TEXT,
  connected_at INTEGER,
  last_heartbeat INTEGER
);

CREATE INDEX IF NOT EXISTS presence_status_idx ON presence(status);
CREATE INDEX IF NOT EXISTS presence_current_session_idx ON presence(current_session);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  details TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS audit_log_user_id_idx ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log(action);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS audit_log_resource_idx ON audit_log(resource_type, resource_id);

-- Add foreign key for invites.invite_id after users table exists
-- (handled by deferred FK checks in SQLite)
