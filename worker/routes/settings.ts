import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import { requireAuth, requireRole } from '../middleware/auth';
import { logAudit } from '../services/teams';

const settingsSchema = z.object({
  registrationStatus: z.enum(['OPEN', 'CLOSED']).optional(),
  eventStatus: z.enum(['REGISTRATION', 'READY', 'LIVE', 'FINISHED']).optional(),
  maximumTeams: z.number().int().min(1).optional(),
  minimumScore: z.number().optional(),
  maximumScore: z.number().optional(),
  scoreboardPublic: z.boolean().optional(),
  judgesCanEdit: z.boolean().optional(),
  scoringLocked: z.boolean().optional(),
  participantNamesEnabled: z.boolean().optional(),
});

export const settingsRoutes = new Hono<{ Bindings: Env }>();

settingsRoutes.get('/', requireAuth, async (c) => {
  const row = await c.env.DB
    .prepare(
      `SELECT registration_status, event_status, maximum_teams, minimum_score, maximum_score,
              scoreboard_public, judges_can_edit, scoring_locked, participant_names_enabled,
              team_code_counter, updated_at
       FROM event_settings
       WHERE id = 1`
    )
    .first();

  if (!row) {
    return c.json({ message: 'Settings not found.' }, 404);
  }

  return c.json({
    settings: {
      registrationStatus: (row as { registration_status: string }).registration_status,
      eventStatus: (row as { event_status: string }).event_status,
      maximumTeams: (row as { maximum_teams: number }).maximum_teams,
      minimumScore: (row as { minimum_score: number }).minimum_score,
      maximumScore: (row as { maximum_score: number }).maximum_score,
      scoreboardPublic: Boolean((row as { scoreboard_public: number }).scoreboard_public),
      judgesCanEdit: Boolean((row as { judges_can_edit: number }).judges_can_edit),
      scoringLocked: Boolean((row as { scoring_locked: number }).scoring_locked),
      participantNamesEnabled: Boolean((row as { participant_names_enabled: number }).participant_names_enabled),
      teamCodeCounter: (row as { team_code_counter: number }).team_code_counter,
      updatedAt: (row as { updated_at: string }).updated_at,
    },
  });
});

settingsRoutes.put('/', requireAuth, requireRole('ADMIN'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = settingsSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ message: 'Invalid settings payload.' }, 400);
  }

  const current = await c.env.DB.prepare('SELECT * FROM event_settings WHERE id = 1').first();
  if (!current) {
    return c.json({ message: 'Settings not found.' }, 404);
  }

  const data = parsed.data;

  const maximumTeams = data.maximumTeams ?? (current as { maximum_teams: number }).maximum_teams;
  const minimumScore = data.minimumScore ?? (current as { minimum_score: number }).minimum_score;
  const maximumScore = data.maximumScore ?? (current as { maximum_score: number }).maximum_score;

  if (minimumScore > maximumScore) {
    return c.json({ message: 'Minimum score cannot exceed maximum score.' }, 400);
  }

  await c.env.DB
    .prepare(
      `UPDATE event_settings
       SET registration_status = ?,
           event_status = ?,
           maximum_teams = ?,
           minimum_score = ?,
           maximum_score = ?,
           scoreboard_public = ?,
           judges_can_edit = ?,
           scoring_locked = ?,
           participant_names_enabled = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = 1`
    )
    .bind(
      data.registrationStatus ?? (current as { registration_status: string }).registration_status,
      data.eventStatus ?? (current as { event_status: string }).event_status,
      maximumTeams,
      minimumScore,
      maximumScore,
      data.scoreboardPublic === undefined ? (current as { scoreboard_public: number }).scoreboard_public : data.scoreboardPublic ? 1 : 0,
      data.judgesCanEdit === undefined ? (current as { judges_can_edit: number }).judges_can_edit : data.judgesCanEdit ? 1 : 0,
      data.scoringLocked === undefined ? (current as { scoring_locked: number }).scoring_locked : data.scoringLocked ? 1 : 0,
      data.participantNamesEnabled === undefined
        ? (current as { participant_names_enabled: number }).participant_names_enabled
        : data.participantNamesEnabled
        ? 1
        : 0
    )
    .run();

  const user = c.get('sessionUser');
  const updated = await c.env.DB.prepare('SELECT * FROM event_settings WHERE id = 1').first();
  await logAudit(c.env.DB, user.id, 'SETTINGS_UPDATED', 'SETTINGS', '1', current, updated, true);

  return c.json({ message: 'Settings updated successfully.' });
});
