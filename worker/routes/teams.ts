import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import { requireAuth, requireRole } from '../middleware/auth';
import { createTeamWithCap, logAudit } from '../services/teams';

const teamSchema = z
  .object({
    displayName: z.string().trim().min(1, 'Please enter a valid family name.').max(120),
    registrationType: z.enum(['SINGLE', 'COMBINED']),
    familySurname: z.string().trim().min(1, 'Please enter a valid family name.').max(60),
    combinedFamilySurname: z.string().trim().max(60).optional().or(z.literal('')),
    participantCount: z
      .number({ invalid_type_error: 'Please enter a valid participant count.' })
      .int('Please enter a valid participant count.')
      .min(1, 'Please enter a valid participant count.')
      .max(30, 'Please enter a valid participant count.'),
  })
  .superRefine((value, ctx) => {
    if (value.registrationType === 'COMBINED' && !value.combinedFamilySurname?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['combinedFamilySurname'], message: 'Please enter a valid family name.' });
    }
    if (value.registrationType === 'SINGLE' && value.combinedFamilySurname?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['combinedFamilySurname'], message: 'Please enter a valid family name.' });
    }
  });

export const teamsRoutes = new Hono<{ Bindings: Env }>();

teamsRoutes.get('/', requireAuth, async (c) => {
  const user = c.get('sessionUser');

  if (user.role === 'ADMIN') {
    const rows = await c.env.DB.prepare(
      `SELECT id, team_code, display_name, registration_type, family_surname,
              combined_family_surname, participant_count, status, created_at, updated_at
       FROM teams
       WHERE status != 'DELETED'
       ORDER BY id ASC`
    ).all();
    return c.json({ teams: rows.results ?? [] });
  }

  const rows = await c.env.DB.prepare(
    `SELECT id, team_code, display_name, registration_type, participant_count
     FROM teams
     WHERE status != 'DELETED'
     ORDER BY id ASC`
  ).all();

  return c.json({ teams: rows.results ?? [] });
});

teamsRoutes.get('/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ message: 'Invalid team id.' }, 400);
  }

  const team = await c.env.DB
    .prepare(
      `SELECT id, team_code, display_name, registration_type, family_surname,
              combined_family_surname, participant_count, status, created_at, updated_at
       FROM teams
       WHERE id = ?
       LIMIT 1`
    )
    .bind(id)
    .first();

  if (!team) {
    return c.json({ message: 'Team not found.' }, 404);
  }

  return c.json({ team });
});

teamsRoutes.post('/', requireAuth, requireRole('ADMIN'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = teamSchema.safeParse({
    ...body,
    participantCount: Number(body?.participantCount),
  });

  if (!parsed.success) {
    return c.json({ message: parsed.error.issues[0]?.message ?? 'Invalid team input.' }, 400);
  }

  const payload = {
    displayName: parsed.data.displayName.trim(),
    registrationType: parsed.data.registrationType,
    familySurname: parsed.data.familySurname.trim(),
    combinedFamilySurname:
      parsed.data.registrationType === 'COMBINED' ? parsed.data.combinedFamilySurname?.trim() ?? null : null,
    participantCount: parsed.data.participantCount,
  };

  try {
    const created = await createTeamWithCap(c.env.DB, payload);
    const user = c.get('sessionUser');

    const inserted = await c.env.DB
      .prepare('SELECT id, team_code, display_name, registration_type, participant_count, status FROM teams WHERE team_code = ? LIMIT 1')
      .bind(created.teamCode)
      .first();

    await logAudit(c.env.DB, user.id, 'TEAM_CREATED', 'TEAM', String((inserted as { id?: number } | null)?.id ?? ''), null, inserted, true);

    return c.json({ message: 'Team created successfully.', team: inserted }, 201);
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (text.startsWith('All ')) {
      return c.json({ message: text }, 400);
    }
    return c.json({ message: 'Unable to create team right now. Please try again.' }, 500);
  }
});

teamsRoutes.put('/:id', requireAuth, requireRole('ADMIN'), async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ message: 'Invalid team id.' }, 400);
  }

  const existing = await c.env.DB
    .prepare(
      `SELECT id, team_code, display_name, registration_type, family_surname,
              combined_family_surname, participant_count, status
       FROM teams
       WHERE id = ?
       LIMIT 1`
    )
    .bind(id)
    .first();

  if (!existing) {
    return c.json({ message: 'Team not found.' }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = teamSchema.safeParse({
    ...body,
    participantCount: Number(body?.participantCount),
  });

  if (!parsed.success) {
    return c.json({ message: parsed.error.issues[0]?.message ?? 'Invalid team input.' }, 400);
  }

  const displayName = parsed.data.displayName.trim();
  const familySurname = parsed.data.familySurname.trim();
  const combinedFamilySurname = parsed.data.registrationType === 'COMBINED' ? parsed.data.combinedFamilySurname?.trim() ?? null : null;

  await c.env.DB
    .prepare(
      `UPDATE teams
       SET display_name = ?,
           registration_type = ?,
           family_surname = ?,
           combined_family_surname = ?,
           participant_count = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`
    )
    .bind(displayName, parsed.data.registrationType, familySurname, combinedFamilySurname, parsed.data.participantCount, id)
    .run();

  const updated = await c.env.DB
    .prepare(
      `SELECT id, team_code, display_name, registration_type, family_surname,
              combined_family_surname, participant_count, status
       FROM teams
       WHERE id = ?
       LIMIT 1`
    )
    .bind(id)
    .first();

  const user = c.get('sessionUser');
  await logAudit(c.env.DB, user.id, 'TEAM_UPDATED', 'TEAM', String(id), existing, updated, true);

  return c.json({ message: 'Team updated successfully.', team: updated });
});

teamsRoutes.delete('/:id', requireAuth, requireRole('ADMIN'), async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ message: 'Invalid team id.' }, 400);
  }

  const existing = await c.env.DB
    .prepare('SELECT id, status FROM teams WHERE id = ? LIMIT 1')
    .bind(id)
    .first<{ id: number; status: 'ACTIVE' | 'DELETED' }>();

  if (!existing) {
    return c.json({ message: 'Team not found.' }, 404);
  }

  const scoreCount = await c.env.DB
    .prepare('SELECT COUNT(*) AS score_count FROM scores WHERE team_id = ?')
    .bind(id)
    .first<{ score_count: number }>();

  if ((scoreCount?.score_count ?? 0) > 0) {
    return c.json({ message: 'This team has scores. Reset scores before deleting this team.' }, 400);
  }

  await c.env.DB
    .prepare("UPDATE teams SET status = 'DELETED', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
    .bind(id)
    .run();

  const user = c.get('sessionUser');
  await logAudit(c.env.DB, user.id, 'TEAM_DELETED', 'TEAM', String(id), existing, { id, status: 'DELETED' }, true);

  return c.json({ message: 'Team deleted successfully.' });
});
