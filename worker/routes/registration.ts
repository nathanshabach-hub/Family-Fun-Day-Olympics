import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import { hasCapacity, summarizeRegistration } from '../services/registration';

const MAX_RATE_LIMIT_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

const registrationSchema = z
  .object({
    displayName: z.string().trim().min(1, 'Please enter a valid family name.').max(120),
    registrationType: z.enum(['SINGLE', 'COMBINED']),
    familySurname: z.string().trim().min(1, 'Please enter a valid family name.').max(60),
    combinedFamilySurname: z.string().trim().max(60).optional().or(z.literal('')),
    colour: z.string().trim().min(1, 'Please select a team colour.').max(30),
    participantCount: z
      .number({ invalid_type_error: 'Please enter a valid participant count.' })
      .int('Please enter a valid participant count.')
      .min(1, 'Please enter a valid participant count.')
      .max(30, 'Please enter a valid participant count.'),
    website: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.registrationType === 'COMBINED' && !value.combinedFamilySurname?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Please enter a valid family name.',
        path: ['combinedFamilySurname'],
      });
    }

    if (value.registrationType === 'SINGLE' && value.combinedFamilySurname?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Please enter a valid family name.',
        path: ['combinedFamilySurname'],
      });
    }
  });

type SettingsRow = {
  registration_status: 'OPEN' | 'CLOSED';
  maximum_teams: number;
};

async function getStatus(db: D1Database): Promise<{ settings: SettingsRow; activeCount: number }> {
  const settings = (await db
    .prepare('SELECT registration_status, maximum_teams FROM event_settings WHERE id = 1 LIMIT 1')
    .first()) as SettingsRow | null;

  if (!settings) {
    throw new Error('Event settings not found.');
  }

  const countRow = (await db
    .prepare("SELECT COUNT(*) AS active_count FROM teams WHERE status != 'DELETED'")
    .first()) as { active_count: number } | null;

  return {
    settings,
    activeCount: countRow?.active_count ?? 0,
  };
}

async function recordAttempt(db: D1Database, ipAddress: string, success: boolean): Promise<void> {
  await db
    .prepare('INSERT INTO registration_attempts (ip_address, success) VALUES (?, ?)')
    .bind(ipAddress, success ? 1 : 0)
    .run();
}

async function isRateLimited(db: D1Database, ipAddress: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const row = (await db
    .prepare(
      `SELECT COUNT(*) AS attempt_count
       FROM registration_attempts
       WHERE ip_address = ? AND attempted_at >= ?`
    )
    .bind(ipAddress, windowStart)
    .first()) as { attempt_count: number } | null;

  return (row?.attempt_count ?? 0) >= MAX_RATE_LIMIT_ATTEMPTS;
}

async function tryInsertTeam(
  db: D1Database,
  payload: {
    teamCode: string;
    displayName: string;
    registrationType: 'SINGLE' | 'COMBINED';
    familySurname: string;
    combinedFamilySurname: string | null;
    colour: string;
    participantCount: number;
  }
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO teams (
        team_code,
        display_name,
        registration_type,
        family_surname,
        combined_family_surname,
        colour,
        participant_count,
        status
      )
      SELECT
        ?, ?, ?, ?, ?, ?, ?, 'ACTIVE'
      FROM event_settings
      WHERE id = 1
        AND registration_status = 'OPEN'
        AND (SELECT COUNT(*) FROM teams WHERE status != 'DELETED') < maximum_teams`
    )
    .bind(
      payload.teamCode,
      payload.displayName,
      payload.registrationType,
      payload.familySurname,
      payload.combinedFamilySurname,
      payload.colour,
      payload.participantCount
    )
    .run();

  return (result.meta.changes ?? 0) > 0;
}

export const registrationRoutes = new Hono<{ Bindings: Env }>();

registrationRoutes.get('/status', async (c) => {
  const { settings, activeCount } = await getStatus(c.env.DB);
  const summary = summarizeRegistration(settings.maximum_teams, activeCount, settings.registration_status);

  if (summary.isFull && settings.registration_status !== 'CLOSED') {
    await c.env.DB.prepare("UPDATE event_settings SET registration_status = 'CLOSED' WHERE id = 1").run();
  }

  return c.json({
    maximumTeams: summary.maximumTeams,
    teamsRegistered: summary.teamsRegistered,
    spacesRemaining: summary.spacesRemaining,
    registrationOpen: summary.registrationOpen,
    registrationStatus: summary.registrationStatus,
    message: summary.message,
  });
});

registrationRoutes.post('/', async (c) => {
  const ipAddress = c.req.header('CF-Connecting-IP') ?? 'unknown';

  if (await isRateLimited(c.env.DB, ipAddress)) {
    return c.json({ message: 'Too many registration attempts. Please try again shortly.' }, 429);
  }

  const rawBody = await c.req.json().catch(() => null);
  const parsed = registrationSchema.safeParse({
    ...rawBody,
    participantCount: Number(rawBody?.participantCount),
  });

  if (!parsed.success) {
    await recordAttempt(c.env.DB, ipAddress, false);
    return c.json({ message: parsed.error.issues[0]?.message ?? 'Invalid registration input.' }, 400);
  }

  if ((parsed.data.website ?? '').trim().length > 0) {
    await recordAttempt(c.env.DB, ipAddress, false);
    return c.json({ message: 'Registration submitted.' });
  }

  const combinedFamilySurname =
    parsed.data.registrationType === 'COMBINED' ? parsed.data.combinedFamilySurname?.trim() ?? null : null;

  const displayName = parsed.data.displayName.trim();
  const familySurname = parsed.data.familySurname.trim();
  const colour = parsed.data.colour.trim();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const status = await getStatus(c.env.DB);

    if (status.settings.registration_status !== 'OPEN') {
      await recordAttempt(c.env.DB, ipAddress, false);
      return c.json({ message: 'Registration is currently closed.' }, 400);
    }

    if (!hasCapacity(status.settings.maximum_teams, status.activeCount)) {
      await c.env.DB.prepare("UPDATE event_settings SET registration_status = 'CLOSED' WHERE id = 1").run();
      await recordAttempt(c.env.DB, ipAddress, false);
      return c.json({ message: `All ${status.settings.maximum_teams} team places have already been filled.` }, 400);
    }

    const codeNumberRow = (await c.env.DB
      .prepare('SELECT team_code_counter FROM event_settings WHERE id = 1 LIMIT 1')
      .first()) as { team_code_counter: number } | null;

    if (!codeNumberRow) {
      throw new Error('Event settings not initialized.');
    }

    const codeNumber = codeNumberRow.team_code_counter + 1;
    const teamCode = `TEAM-${String(codeNumber).padStart(3, '0')}`;

    try {
      const inserted = await tryInsertTeam(c.env.DB, {
        teamCode,
        displayName,
        registrationType: parsed.data.registrationType,
        familySurname,
        combinedFamilySurname,
        colour,
        participantCount: parsed.data.participantCount,
      });

      if (!inserted) {
        continue;
      }

      await c.env.DB
        .prepare(
          `UPDATE event_settings
           SET team_code_counter = CASE WHEN team_code_counter < ? THEN ? ELSE team_code_counter END,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = 1`
        )
        .bind(codeNumber, codeNumber)
        .run();

      const updated = await getStatus(c.env.DB);
      if (updated.activeCount >= updated.settings.maximum_teams && updated.settings.registration_status !== 'CLOSED') {
        await c.env.DB.prepare("UPDATE event_settings SET registration_status = 'CLOSED' WHERE id = 1").run();
      }

      await recordAttempt(c.env.DB, ipAddress, true);
      return c.json({
        message: 'Registration submitted successfully.',
        teamCode,
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      if (text.includes('UNIQUE constraint failed: teams.team_code')) {
        continue;
      }
      throw error;
    }
  }

  await recordAttempt(c.env.DB, ipAddress, false);
  return c.json({ message: 'Unable to complete registration right now. Please try again.' }, 500);
});
