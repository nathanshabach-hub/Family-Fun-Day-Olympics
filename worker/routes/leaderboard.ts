import { Hono } from 'hono';
import type { Env } from '../types';
import { getSessionUser } from '../auth/session';
import { calculateLeaderboard } from '../services/ranking';

export const leaderboardRoutes = new Hono<{ Bindings: Env }>();

async function makeEtag(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
  return `W/\"${hex}\"`;
}

leaderboardRoutes.get('/', async (c) => {
  const settings = (await c.env.DB
    .prepare('SELECT event_status, scoreboard_public FROM event_settings WHERE id = 1')
    .first()) as { event_status: 'REGISTRATION' | 'READY' | 'LIVE' | 'FINISHED'; scoreboard_public: number } | null;

  if (!settings) {
    return c.json({ message: 'Event settings not found.' }, 500);
  }

  const user = await getSessionUser(c);
  const isPrivilegedViewer = user?.role === 'ADMIN' || user?.role === 'JUDGE';

  if (settings.scoreboard_public !== 1 && !isPrivilegedViewer) {
    return c.json({ message: 'Scoreboard is not public.' }, 403);
  }

  const teamsRows = await c.env.DB
    .prepare(
      `SELECT id, team_code, display_name, colour
       FROM teams
       WHERE status != 'DELETED'
       ORDER BY id ASC`
    )
    .all<{ id: number; team_code: string; display_name: string; colour: string | null }>();

  const activitiesRows = await c.env.DB
    .prepare(
      `SELECT id, name
       FROM activities
       WHERE active = 1
       ORDER BY display_order ASC, id ASC`
    )
    .all<{ id: number; name: string }>();

  const scoresRows = await c.env.DB
    .prepare(
      `SELECT team_id, activity_id, judge_id, score
       FROM scores`
    )
    .all<{ team_id: number; activity_id: number; judge_id: number; score: number }>();

  const freshness = (await c.env.DB
    .prepare(
      `SELECT
         (SELECT COALESCE(MAX(updated_at), '') FROM scores) AS score_updated,
         (SELECT COALESCE(MAX(updated_at), '') FROM teams) AS team_updated,
         (SELECT COALESCE(MAX(updated_at), '') FROM activities) AS activity_updated,
         (SELECT COALESCE(updated_at, '') FROM event_settings WHERE id = 1) AS settings_updated`
    )
    .first()) as
    | {
        score_updated: string;
        team_updated: string;
        activity_updated: string;
        settings_updated: string;
      }
    | null;

  const result = calculateLeaderboard(
    (teamsRows.results ?? []).map((t) => ({ id: t.id, teamCode: t.team_code, displayName: t.display_name, colour: t.colour })),
    (activitiesRows.results ?? []).map((a) => ({ id: a.id, name: a.name })),
    (scoresRows.results ?? []).map((s) => ({
      teamId: s.team_id,
      activityId: s.activity_id,
      judgeId: s.judge_id,
      score: s.score,
    }))
  );

  const versionBasis = JSON.stringify({
    eventStatus: settings.event_status,
    scoreboardPublic: settings.scoreboard_public,
    freshness,
    leaderboard: result.rows,
    incomplete: result.incompleteActivities,
  });

  const etag = await makeEtag(versionBasis);
  const incomingEtag = c.req.header('if-none-match');

  if (incomingEtag && incomingEtag === etag) {
    return c.newResponse(null, 304, {
      ETag: etag,
      'Cache-Control': 'no-store',
    });
  }

  c.header('ETag', etag);
  c.header('Cache-Control', 'no-store');

  return c.json({
    eventStatus: settings.event_status,
    complete: result.incompleteActivities.length === 0,
    incompleteActivities: result.incompleteActivities,
    leaderboard: result.rows,
  });
});
