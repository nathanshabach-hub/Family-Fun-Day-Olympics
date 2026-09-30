import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import { requireAuth, requireRole } from '../middleware/auth';
import { logAudit } from '../services/teams';

const activitySchema = z.object({
  name: z.string().trim().min(1, 'Activity name is required.').max(120),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  displayOrder: z.number({ invalid_type_error: 'Display order must be a number.' }).int().min(0),
  active: z.boolean().optional(),
});

export const activitiesRoutes = new Hono<{ Bindings: Env }>();

activitiesRoutes.get('/', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, name, description, display_order, active, created_at, updated_at
     FROM activities
     ORDER BY display_order ASC, id ASC`
  ).all();

  return c.json({ activities: rows.results ?? [] });
});

activitiesRoutes.post('/', requireAuth, requireRole('ADMIN'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = activitySchema.safeParse({
    ...body,
    displayOrder: Number(body?.displayOrder),
    active: body?.active ?? true,
  });

  if (!parsed.success) {
    return c.json({ message: parsed.error.issues[0]?.message ?? 'Invalid activity input.' }, 400);
  }

  await c.env.DB
    .prepare(
      `INSERT INTO activities (name, description, display_order, active)
       VALUES (?, ?, ?, ?)`
    )
    .bind(
      parsed.data.name.trim(),
      parsed.data.description?.trim() || null,
      parsed.data.displayOrder,
      parsed.data.active ? 1 : 0
    )
    .run();

  const inserted = await c.env.DB
    .prepare('SELECT id, name, description, display_order, active FROM activities ORDER BY id DESC LIMIT 1')
    .first();

  const user = c.get('sessionUser');
  await logAudit(c.env.DB, user.id, 'ACTIVITY_CREATED', 'ACTIVITY', String((inserted as { id?: number } | null)?.id ?? ''), null, inserted, true);

  return c.json({ message: 'Activity created successfully.', activity: inserted }, 201);
});

activitiesRoutes.put('/:id', requireAuth, requireRole('ADMIN'), async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ message: 'Invalid activity id.' }, 400);
  }

  const existing = await c.env.DB
    .prepare(
      `SELECT id, name, description, display_order, active
       FROM activities
       WHERE id = ?
       LIMIT 1`
    )
    .bind(id)
    .first();

  if (!existing) {
    return c.json({ message: 'This activity does not exist.' }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = activitySchema.safeParse({
    ...body,
    displayOrder: Number(body?.displayOrder),
    active: body?.active,
  });

  if (!parsed.success) {
    return c.json({ message: parsed.error.issues[0]?.message ?? 'Invalid activity input.' }, 400);
  }

  const nextActive = parsed.data.active ?? Boolean((existing as { active: number }).active);

  await c.env.DB
    .prepare(
      `UPDATE activities
       SET name = ?,
           description = ?,
           display_order = ?,
           active = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`
    )
    .bind(
      parsed.data.name.trim(),
      parsed.data.description?.trim() || null,
      parsed.data.displayOrder,
      nextActive ? 1 : 0,
      id
    )
    .run();

  const updated = await c.env.DB
    .prepare('SELECT id, name, description, display_order, active FROM activities WHERE id = ? LIMIT 1')
    .bind(id)
    .first();

  const user = c.get('sessionUser');
  await logAudit(c.env.DB, user.id, 'ACTIVITY_UPDATED', 'ACTIVITY', String(id), existing, updated, true);

  return c.json({ message: 'Activity updated successfully.', activity: updated });
});

activitiesRoutes.delete('/:id', requireAuth, requireRole('ADMIN'), async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ message: 'Invalid activity id.' }, 400);
  }

  const existing = await c.env.DB
    .prepare('SELECT id, name, active FROM activities WHERE id = ? LIMIT 1')
    .bind(id)
    .first();

  if (!existing) {
    return c.json({ message: 'This activity does not exist.' }, 404);
  }

  const scoreCount = await c.env.DB
    .prepare('SELECT COUNT(*) AS score_count FROM scores WHERE activity_id = ?')
    .bind(id)
    .first<{ score_count: number }>();

  if ((scoreCount?.score_count ?? 0) > 0) {
    return c.json({ message: 'This activity has scores. Disable it or reset scores before deleting.' }, 400);
  }

  await c.env.DB.prepare('DELETE FROM activities WHERE id = ?').bind(id).run();

  const user = c.get('sessionUser');
  await logAudit(c.env.DB, user.id, 'ACTIVITY_DELETED', 'ACTIVITY', String(id), existing, null, true);

  return c.json({ message: 'Activity deleted successfully.' });
});

activitiesRoutes.put('/:id/enable', requireAuth, requireRole('ADMIN'), async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ message: 'Invalid activity id.' }, 400);
  }

  const existing = await c.env.DB
    .prepare('SELECT id, active FROM activities WHERE id = ? LIMIT 1')
    .bind(id)
    .first();

  if (!existing) {
    return c.json({ message: 'This activity does not exist.' }, 404);
  }

  await c.env.DB
    .prepare("UPDATE activities SET active = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
    .bind(id)
    .run();

  const user = c.get('sessionUser');
  await logAudit(c.env.DB, user.id, 'ACTIVITY_ENABLED', 'ACTIVITY', String(id), existing, { id, active: 1 }, true);

  return c.json({ message: 'Activity enabled.' });
});

activitiesRoutes.put('/:id/disable', requireAuth, requireRole('ADMIN'), async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ message: 'Invalid activity id.' }, 400);
  }

  const existing = await c.env.DB
    .prepare('SELECT id, active FROM activities WHERE id = ? LIMIT 1')
    .bind(id)
    .first();

  if (!existing) {
    return c.json({ message: 'This activity does not exist.' }, 404);
  }

  await c.env.DB
    .prepare("UPDATE activities SET active = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
    .bind(id)
    .run();

  const user = c.get('sessionUser');
  await logAudit(c.env.DB, user.id, 'ACTIVITY_DISABLED', 'ACTIVITY', String(id), existing, { id, active: 0 }, true);

  return c.json({ message: 'Activity disabled.' });
});
