import { Hono } from 'hono';
import type { Env } from '../types';
import { requireAuth, requireRole } from '../middleware/auth';

export const judgeRoutes = new Hono<{ Bindings: Env }>();

judgeRoutes.get('/dashboard', requireAuth, requireRole('JUDGE'), async (c) => {
  const user = c.get('sessionUser');

  const activitiesRows = await c.env.DB
    .prepare(
      `SELECT id, name, description, display_order, active
       FROM activities
       WHERE active = 1
       ORDER BY display_order ASC, id ASC`
    )
    .all<{
      id: number;
      name: string;
      description: string | null;
      display_order: number;
      active: number;
    }>();

  const teamsRows = await c.env.DB
    .prepare(
      `SELECT id, team_code, display_name, participant_count
       FROM teams
       WHERE status != 'DELETED'
       ORDER BY id ASC`
    )
    .all<{
      id: number;
      team_code: string;
      display_name: string;
      participant_count: number;
    }>();

  const progressRows = await c.env.DB
    .prepare(
      `SELECT activity_id, COUNT(*) AS score_count
       FROM scores
       WHERE judge_id = ?
       GROUP BY activity_id`
    )
    .bind(user.id)
    .all<{ activity_id: number; score_count: number }>();

  const teamCount = (teamsRows.results ?? []).length;
  const completedActivityIds = (progressRows.results ?? [])
    .filter((row) => row.score_count >= teamCount && teamCount > 0)
    .map((row) => row.activity_id);

  return c.json({
    judge: {
      id: user.id,
      displayName: user.displayName,
      judgeNumber: user.judgeNumber,
    },
    teams: teamsRows.results ?? [],
    activities: activitiesRows.results ?? [],
    completedActivityIds,
  });
});
