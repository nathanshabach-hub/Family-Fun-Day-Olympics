INSERT INTO event_settings (
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
  team_code_counter
) VALUES (
  1,
  'OPEN',
  'REGISTRATION',
  6,
  0,
  10,
  'INTEGER',
  1,
  1,
  0,
  0,
  0
);
