import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import { requireAuth, requireRole } from '../middleware/auth';
import { logAudit } from '../services/teams';

const judgeSubmitSchema = z.object({
  activityId: z.number().int().positive(),
  scores: z.array(
    z.object({
      teamId: z.number().int().positive(),
      score: z.number(),
    })
  ),
});

const scoreUpdateSchema = z.object({
  score: z.number(),
});

type EventSettings = {
  event_status: 'REGISTRATION' | 'READY' | 'LIVE' | 'FINISHED';
  minimum_score: number;
  maximum_score: number;
  score_step: 'INTEGER' | 'DECIMAL';
  scoring_locked: number;
  judges_can_edit: number;
};

async function loadSettings(db: D1Database): Promise<EventSettings> {
  const row = (await db
    .prepare(
      `SELECT event_status, minimum_score, maximum_score, score_step, scoring_locked, judges_can_edit
       FROM event_settings
       WHERE id = 1`
    )
    .first()) as EventSettings | null;

  if (!row) {
    throw new Error('Event settings not found.');
  }
  return row;
}

export function validateScoreValue(score: number, settings: EventSettings): string | null {
  if (score < settings.minimum_score || score > settings.maximum_score) {
    return `Your score must be between ${settings.minimum_score} and ${settings.maximum_score}.`;
  }

  if (settings.score_step === 'INTEGER' && !Number.isInteger(score)) {
    return `Your score must be between ${settings.minimum_score} and ${settings.maximum_score}.`;
  }

  return null;
}

export function canJudgeEdit(settings: EventSettings): boolean {
  return settings.event_status === 'LIVE' && settings.scoring_locked === 0 && settings.judges_can_edit === 1;
}

export const scoresRoutes = new Hono<{ Bindings: Env }>();

scoresRoutes.get('/', requireAuth, async (c) => {
  const user = c.get('sessionUser');
  const activityIdRaw = c.req.query('activityId');
  const activityId = activityIdRaw ? Number(activityIdRaw) : null;

  if (activityIdRaw && (!Number.isInteger(activityId) || (activityId ?? 0) <= 0)) {
    return c.json({ message: 'Invalid activity id.' }, 400);
  }

  if (user.role === 'ADMIN') {
    const rows = activityId
      ? await c.env.DB
          .prepare(
            `SELECT s.id, s.team_id, s.activity_id, s.judge_id, s.score, s.previous_score, s.last_updated_by, s.updated_at
             FROM scores s
             WHERE s.activity_id = ?
             ORDER BY s.activity_id, s.team_id, s.judge_id`
          )
          .bind(activityId)
          .all()
      : await c.env.DB
          .prepare(
            `SELECT s.id, s.team_id, s.activity_id, s.judge_id, s.score, s.previous_score, s.last_updated_by, s.updated_at
             FROM scores s
             ORDER BY s.activity_id, s.team_id, s.judge_id`
          )
          .all();

    return c.json({ scores: rows.results ?? [] });
  }

  const rows = activityId
    ? await c.env.DB
        .prepare(
          `SELECT s.id, s.team_id, s.activity_id, s.judge_id, s.score, s.previous_score, s.last_updated_by, s.updated_at
           FROM scores s
           WHERE s.judge_id = ? AND s.activity_id = ?
           ORDER BY s.team_id`
        )
        .bind(user.id, activityId)
        .all()
    : await c.env.DB
        .prepare(
          `SELECT s.id, s.team_id, s.activity_id, s.judge_id, s.score, s.previous_score, s.last_updated_by, s.updated_at
           FROM scores s
           WHERE s.judge_id = ?
           ORDER BY s.activity_id, s.team_id`
        )
        .bind(user.id)
        .all();

  return c.json({ scores: rows.results ?? [] });
});

scoresRoutes.post('/', requireAuth, requireRole('JUDGE'), async (c) => {
  const user = c.get('sessionUser');
  const body = await c.req.json().catch(() => null);
  const parsed = judgeSubmitSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ message: 'Invalid score payload.' }, 400);
  }

  const settings = await loadSettings(c.env.DB);
  if (!canJudgeEdit(settings)) {
    return c.json({ message: 'Scoring is currently locked.' }, 400);
  }

  const activity = await c.env.DB
    .prepare('SELECT id, active FROM activities WHERE id = ? LIMIT 1')
    .bind(parsed.data.activityId)
    .first<{ id: number; active: number }>();

  if (!activity) {
    return c.json({ message: 'This activity does not exist.' }, 404);
  }
  if (activity.active !== 1) {
    return c.json({ message: 'This activity is currently disabled.' }, 400);
  }

  const teamIds = parsed.data.scores.map((item) => item.teamId);
  if (teamIds.length === 0) {
    return c.json({ message: 'No scores were submitted.' }, 400);
  }

  const placeholders = teamIds.map(() => '?').join(',');
  const teamRows = await c.env.DB
    .prepare(`SELECT id FROM teams WHERE status != 'DELETED' AND id IN (${placeholders})`)
    .bind(...teamIds)
    .all<{ id: number }>();

  const validTeamIds = new Set((teamRows.results ?? []).map((t) => t.id));
  for (const item of parsed.data.scores) {
    if (!validTeamIds.has(item.teamId)) {
      return c.json({ message: 'One or more teams are invalid.' }, 400);
    }
    const scoreError = validateScoreValue(item.score, settings);
    if (scoreError) {
      return c.json({ message: scoreError }, 400);
    }
  }

  for (const item of parsed.data.scores) {
    const existing = await c.env.DB
      .prepare('SELECT id, score FROM scores WHERE team_id = ? AND activity_id = ? AND judge_id = ? LIMIT 1')
      .bind(item.teamId, parsed.data.activityId, user.id)
      .first<{ id: number; score: number }>();

    if (!existing) {
      await c.env.DB
        .prepare(
          `INSERT INTO scores (team_id, activity_id, judge_id, score, previous_score, last_updated_by)
           VALUES (?, ?, ?, ?, NULL, ?)`
        )
        .bind(item.teamId, parsed.data.activityId, user.id, item.score, user.id)
        .run();

      await logAudit(
        c.env.DB,
        user.id,
        'SCORE_CREATED',
        'SCORE',
        `${item.teamId}:${parsed.data.activityId}:${user.id}`,
        null,
        { teamId: item.teamId, activityId: parsed.data.activityId, judgeId: user.id, score: item.score },
        false
      );
    } else {
      await c.env.DB
        .prepare(
          `UPDATE scores
           SET previous_score = score,
               score = ?,
               last_updated_by = ?,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?`
        )
        .bind(item.score, user.id, existing.id)
        .run();

      await logAudit(
        c.env.DB,
        user.id,
        'SCORE_UPDATED',
        'SCORE',
        String(existing.id),
        { score: existing.score },
        { score: item.score },
        false
      );
    }
  }

  return c.json({ message: 'Scores saved successfully.' });
});

scoresRoutes.put('/:id', requireAuth, async (c) => {
  const user = c.get('sessionUser');
  const scoreId = Number(c.req.param('id'));

  if (!Number.isInteger(scoreId) || scoreId <= 0) {
    return c.json({ message: 'Invalid score id.' }, 400);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = scoreUpdateSchema.safeParse({ score: Number(body?.score) });
  if (!parsed.success) {
    return c.json({ message: 'Invalid score payload.' }, 400);
  }

  const settings = await loadSettings(c.env.DB);
  const scoreError = validateScoreValue(parsed.data.score, settings);
  if (scoreError) {
    return c.json({ message: scoreError }, 400);
  }

  const existing = await c.env.DB
    .prepare(
      `SELECT id, team_id, activity_id, judge_id, score
       FROM scores
       WHERE id = ?
       LIMIT 1`
    )
    .bind(scoreId)
    .first<{ id: number; team_id: number; activity_id: number; judge_id: number; score: number }>();

  if (!existing) {
    return c.json({ message: 'Score not found.' }, 404);
  }

  if (user.role === 'JUDGE') {
    if (existing.judge_id !== user.id) {
      return c.json({ message: 'You are not authorised to perform this action.' }, 403);
    }
    if (!canJudgeEdit(settings)) {
      return c.json({ message: 'Scoring is currently locked.' }, 400);
    }
  }

  await c.env.DB
    .prepare(
      `UPDATE scores
       SET previous_score = score,
           score = ?,
           last_updated_by = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`
    )
    .bind(parsed.data.score, user.id, scoreId)
    .run();

  await logAudit(
    c.env.DB,
    user.id,
    user.role === 'ADMIN' ? 'SCORE_CORRECTED_ADMIN' : 'SCORE_UPDATED',
    'SCORE',
    String(scoreId),
    { score: existing.score },
    { score: parsed.data.score },
    user.role === 'ADMIN'
  );

  return c.json({
    message: user.role === 'ADMIN' ? 'Score corrected successfully.' : 'Score updated successfully.',
  });
});
