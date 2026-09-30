CREATE TABLE registration_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_address TEXT NOT NULL,
  attempted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  success INTEGER NOT NULL CHECK (success IN (0, 1))
);

CREATE INDEX idx_registration_attempts_ip_time ON registration_attempts(ip_address, attempted_at);
