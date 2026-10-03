PRAGMA foreign_keys = OFF;

CREATE TABLE event_settings_new (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  registration_status TEXT NOT NULL CHECK (registration_status IN ('OPEN', 'CLOSED')),
  event_status TEXT NOT NULL CHECK (event_status IN ('REGISTRATION', 'READY', 'LIVE', 'FINISHED')),
  maximum_teams INTEGER NOT NULL CHECK (maximum_teams >= 1),
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

INSERT INTO event_settings_new (
  id,
  registration_status,
  event_status,
  maximum_teams,
  minimum_score,
  maximum_score,
  score_step,
  scoreboard_public,
  judges_can_edit,
  scoring_locked,
  participant_names_enabled,
  team_code_counter,
  created_at,
  updated_at
)
SELECT
  id,
  registration_status,
  event_status,
  maximum_teams,
  minimum_score,
  maximum_score,
  score_step,
  scoreboard_public,
  judges_can_edit,
  scoring_locked,
  participant_names_enabled,
  team_code_counter,
  created_at,
  updated_at
FROM event_settings;

DROP TABLE event_settings;
ALTER TABLE event_settings_new RENAME TO event_settings;

PRAGMA foreign_keys = ON;
