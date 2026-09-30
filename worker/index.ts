import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRoutes } from './routes/auth';
import { registrationRoutes } from './routes/registration';
import { teamsRoutes } from './routes/teams';
import { activitiesRoutes } from './routes/activities';
import { scoresRoutes } from './routes/scores';
import { judgeRoutes } from './routes/judge';
import { leaderboardRoutes } from './routes/leaderboard';
import { settingsRoutes } from './routes/settings';
import { adminRoutes } from './routes/admin';
import { calculateLeaderboard } from './services/ranking';
import { requireAuth, requireRole } from './middleware/auth';
import { csrfGuard, securityHeaders } from './middleware/security';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

app.use('*', securityHeaders);
app.use('/api/*', cors());
app.use('/api/*', csrfGuard);

app.route('/api/auth', authRoutes);
app.route('/api/registration', registrationRoutes);
app.route('/api/teams', teamsRoutes);
app.route('/api/activities', activitiesRoutes);
app.route('/api/scores', scoresRoutes);
app.route('/api/judge', judgeRoutes);
app.route('/api/leaderboard', leaderboardRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/admin', adminRoutes);

app.use('/api/admin/*', requireAuth, requireRole('ADMIN'));
app.use('/api/judge/*', requireAuth, requireRole('JUDGE'));

app.get('/api/health', (c) => {
  return c.json({ ok: true, service: 'family-fun-day-api' });
});

app.get('/api/admin/health', (c) => {
  const user = c.get('sessionUser');
  return c.json({ ok: true, role: user.role, username: user.username });
});

app.get('/api/admin/score-matrix', requireAuth, requireRole('ADMIN'), async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT
       t.id AS team_id,
       t.display_name AS team_name,
       a.id AS activity_id,
       a.name AS activity_name,
       s.id AS score_id,
       s.judge_id,
       s.score
     FROM teams t
     JOIN activities a ON 1 = 1
     LEFT JOIN scores s ON s.team_id = t.id AND s.activity_id = a.id
     WHERE t.status != 'DELETED'
     ORDER BY t.id, a.display_order, a.id, s.judge_id`
  ).all();

  return c.json({ rows: rows.results ?? [] });
});

app.get('/api/admin/export/results.csv', requireAuth, requireRole('ADMIN'), async (c) => {
  const teamsRows = await c.env.DB
    .prepare(
      `SELECT id, team_code, display_name
       FROM teams
       WHERE status != 'DELETED'
       ORDER BY id ASC`
    )
    .all<{ id: number; team_code: string; display_name: string; colour: string | null }>();

  const activitiesRows = await c.env.DB
    .prepare(
      `SELECT id, name
       FROM activities
       ORDER BY display_order ASC, id ASC`
    )
    .all<{ id: number; name: string }>();

  const scoresRows = await c.env.DB
    .prepare(
      `SELECT s.id, s.team_id, s.activity_id, s.judge_id, s.score, u.judge_number
       FROM scores s
       JOIN users u ON u.id = s.judge_id`
    )
    .all<{ id: number; team_id: number; activity_id: number; judge_id: number; score: number; judge_number: number | null }>();

  const leaderboard = calculateLeaderboard(
    (teamsRows.results ?? []).map((t) => ({ id: t.id, teamCode: t.team_code, displayName: t.display_name, colour: t.colour })),
    (activitiesRows.results ?? []).map((a) => ({ id: a.id, name: a.name })),
    (scoresRows.results ?? []).map((s) => ({
      teamId: s.team_id,
      activityId: s.activity_id,
      judgeId: s.judge_id,
      score: s.score,
    }))
  );

  const rankByTeam = new Map(leaderboard.rows.map((row) => [row.teamId, row.rank]));
  const overallByTeam = new Map(leaderboard.rows.map((row) => [row.teamId, row.overallTotal]));

  const scoreMap = new Map<string, number>();
  for (const s of scoresRows.results ?? []) {
    if (s.judge_number === 1 || s.judge_number === 2 || s.judge_number === 3) {
      scoreMap.set(`${s.team_id}:${s.activity_id}:${s.judge_number}`, s.score);
    }
  }

  const escapeCsv = (value: string | number): string => {
    const text = String(value);
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const lines: string[] = [];
  lines.push([
    'Team',
    'Activity',
    'Judge 1',
    'Judge 2',
    'Judge 3',
    'Activity Total',
    'Overall Total',
    'Position',
  ].join(','));

  for (const team of teamsRows.results ?? []) {
    for (const activity of activitiesRows.results ?? []) {
      const j1 = scoreMap.get(`${team.id}:${activity.id}:1`);
      const j2 = scoreMap.get(`${team.id}:${activity.id}:2`);
      const j3 = scoreMap.get(`${team.id}:${activity.id}:3`);
      const activityTotal = (j1 ?? 0) + (j2 ?? 0) + (j3 ?? 0);

      const row = [
        team.display_name,
        activity.name,
        j1 ?? '',
        j2 ?? '',
        j3 ?? '',
        activityTotal,
        overallByTeam.get(team.id) ?? 0,
        rankByTeam.get(team.id) ?? '',
      ].map(escapeCsv);

      lines.push(row.join(','));
    }
  }

  const csvText = `${lines.join('\n')}\n`;
  return c.body(csvText, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="family-fun-day-results.csv"',
  });
});

app.get('/api/admin/export/event.json', requireAuth, requireRole('ADMIN'), async (c) => {
  const [
    teams,
    participants,
    activities,
    scores,
    settings,
    audit,
  ] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM teams ORDER BY id ASC').all(),
    c.env.DB.prepare('SELECT * FROM participants ORDER BY id ASC').all(),
    c.env.DB.prepare('SELECT * FROM activities ORDER BY display_order ASC, id ASC').all(),
    c.env.DB.prepare('SELECT * FROM scores ORDER BY id ASC').all(),
    c.env.DB.prepare('SELECT * FROM event_settings WHERE id = 1').first(),
    c.env.DB.prepare('SELECT * FROM audit_log ORDER BY id ASC').all(),
  ]);

  return c.json(
    {
      exportedAt: new Date().toISOString(),
      teams: teams.results ?? [],
      participants: participants.results ?? [],
      activities: activities.results ?? [],
      scores: scores.results ?? [],
      settings,
      auditLog: audit.results ?? [],
    },
    200,
    {
      'Content-Disposition': 'attachment; filename="family-fun-day-event.json"',
    }
  );
});

app.get('/api/judge/health', (c) => {
  const user = c.get('sessionUser');
  return c.json({ ok: true, role: user.role, judgeNumber: user.judgeNumber });
});

app.all('/api/*', (c) => {
  return c.json({ message: 'API route not implemented yet.' }, 404);
});

export default app;
