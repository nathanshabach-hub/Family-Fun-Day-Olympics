PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'JUDGE')),
  judge_number INTEGER,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (role = 'ADMIN' AND judge_number IS NULL)
    OR
    (role = 'JUDGE' AND judge_number IN (1, 2, 3))
  )
);

CREATE UNIQUE INDEX idx_users_unique_judge_number
ON users (judge_number)
WHERE judge_number IS NOT NULL;

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_key TEXT NOT NULL,
  attempted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  success INTEGER NOT NULL CHECK (success IN (0, 1))
);

CREATE INDEX idx_login_attempts_key_time ON login_attempts(attempt_key, attempted_at);

CREATE TABLE teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  registration_type TEXT NOT NULL CHECK (registration_type IN ('SINGLE', 'COMBINED')),
  family_surname TEXT,
  combined_family_surname TEXT,
  participant_count INTEGER NOT NULL CHECK (participant_count >= 1 AND participant_count <= 30),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DELETED')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (registration_type = 'SINGLE' AND family_surname IS NOT NULL AND combined_family_surname IS NULL)
    OR
    (registration_type = 'COMBINED' AND family_surname IS NOT NULL AND combined_family_surname IS NOT NULL)
  )
);

CREATE INDEX idx_teams_status ON teams(status);

CREATE TABLE participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE INDEX idx_participants_team_id ON participants(team_id);

CREATE TABLE activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_activities_active_order ON activities(active, display_order);

CREATE TABLE scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  activity_id INTEGER NOT NULL,
  judge_id INTEGER NOT NULL,
  score INTEGER NOT NULL,
  previous_score INTEGER,
  last_updated_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE RESTRICT,
  FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE RESTRICT,
  FOREIGN KEY (judge_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (last_updated_by) REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (team_id, activity_id, judge_id)
);

CREATE INDEX idx_scores_activity_team ON scores(activity_id, team_id);
CREATE INDEX idx_scores_judge_id ON scores(judge_id);

CREATE TABLE event_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  registration_status TEXT NOT NULL CHECK (registration_status IN ('OPEN', 'CLOSED')),
  event_status TEXT NOT NULL CHECK (event_status IN ('REGISTRATION', 'READY', 'LIVE', 'FINISHED')),
  maximum_teams INTEGER NOT NULL CHECK (maximum_teams >= 1 AND maximum_teams <= 6),
  minimum_score INTEGER NOT NULL DEFAULT 0,
  maximum_score INTEGER NOT NULL DEFAULT 10,
  score_step TEXT NOT NULL DEFAULT 'INTEGER' CHECK (score_step IN ('INTEGER', 'DECIMAL')),
  scoreboard_public INTEGER NOT NULL DEFAULT 1 CHECK (scoreboard_public IN (0, 1)),
  judges_can_edit INTEGER NOT NULL DEFAULT 1 CHECK (judges_can_edit IN (0, 1)),
  scoring_locked INTEGER NOT NULL DEFAULT 0 CHECK (scoring_locked IN (0, 1)),
  participant_names_enabled INTEGER NOT NULL DEFAULT 0 CHECK (participant_names_enabled IN (0, 1)),
  team_code_counter INTEGER NOT NULL DEFAULT 0 CHECK (team_code_counter >= 0 AND team_code_counter <= 999),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (minimum_score <= maximum_score)
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  is_admin_change INTEGER NOT NULL DEFAULT 0 CHECK (is_admin_change IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
