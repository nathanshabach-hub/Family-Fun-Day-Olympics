import { Hono } from 'hono';
import type { Env } from '../types';
import { requireAuth, requireRole } from '../middleware/auth';

export const adminRoutes = new Hono<{ Bindings: Env }>();

adminRoutes.get('/overview', requireAuth, requireRole('ADMIN'), async (c) => {
  const [teams, activities, settings, scoreCount, latestScores, missingByActivity] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM teams WHERE status != 'DELETED'").first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM activities').first<{ count: number }>(),
    c.env.DB
      .prepare(
        `SELECT registration_status, event_status, scoring_locked
         FROM event_settings
         WHERE id = 1`
      )
      .first<{ registration_status: string; event_status: string; scoring_locked: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM scores').first<{ count: number }>(),
    c.env.DB
      .prepare(
        `SELECT s.id, s.team_id, s.activity_id, s.judge_id, s.score, s.updated_at,
                t.display_name AS team_name, a.name AS activity_name
         FROM scores s
         JOIN teams t ON t.id = s.team_id
         JOIN activities a ON a.id = s.activity_id
         ORDER BY s.updated_at DESC
         LIMIT 10`
      )
      .all(),
    c.env.DB
      .prepare(
        `SELECT a.id, a.name,
                SUM(CASE WHEN s.id IS NULL THEN 1 ELSE 0 END) AS missing_count
         FROM activities a
         JOIN teams t ON t.status != 'DELETED'
         LEFT JOIN scores s ON s.activity_id = a.id AND s.team_id = t.id
         GROUP BY a.id, a.name
         ORDER BY a.display_order, a.id`
      )
      .all(),
  ]);

  return c.json({
    teamsCount: teams?.count ?? 0,
    activitiesCount: activities?.count ?? 0,
    registrationStatus: settings?.registration_status ?? 'CLOSED',
    eventStatus: settings?.event_status ?? 'REGISTRATION',
    scoringLocked: Boolean(settings?.scoring_locked ?? 0),
    scoreCount: scoreCount?.count ?? 0,
    latestScores: latestScores.results ?? [],
    missingByActivity: missingByActivity.results ?? [],
  });
});

adminRoutes.get('/audit', requireAuth, requireRole('ADMIN'), async (c) => {
  const limitRaw = c.req.query('limit');
  const limit = Math.min(Math.max(Number(limitRaw ?? 100), 1), 500);

  const rows = await c.env.DB
    .prepare(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.old_value, a.new_value,
              a.is_admin_change, a.created_at, u.username, u.display_name
       FROM audit_log a
       JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC
       LIMIT ?`
    )
    .bind(limit)
    .all();

  return c.json({ entries: rows.results ?? [] });
});
