import { Hono } from 'hono';
import { z } from 'zod';
import { createSession, clearSession, getSessionUser } from '../auth/session';
import { verifyPassword } from '../auth/crypto';
import { requireAuth } from '../middleware/auth';
import type { Env } from '../types';

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

async function loginBlocked(db: D1Database, attemptKey: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS fail_count
       FROM login_attempts
       WHERE attempt_key = ? AND success = 0 AND attempted_at >= ?`
    )
    .bind(attemptKey, windowStart)
    .first<{ fail_count: number }>();

  return (row?.fail_count ?? 0) >= 5;
}

async function recordAttempt(db: D1Database, attemptKey: string, success: boolean): Promise<void> {
  await db
    .prepare('INSERT INTO login_attempts (attempt_key, success) VALUES (?, ?)')
    .bind(attemptKey, success ? 1 : 0)
    .run();
}

export const authRoutes = new Hono<{ Bindings: Env }>();

authRoutes.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ message: 'Invalid username or password.' }, 400);
  }

  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
  const username = parsed.data.username.toLowerCase();
  const attemptKey = `${username}:${ip}`;

  if (await loginBlocked(c.env.DB, attemptKey)) {
    return c.json({ message: 'Invalid username or password.' }, 429);
  }

  const user = (await c.env.DB
    .prepare(
      `SELECT id, username, password_hash, password_salt
       FROM users
       WHERE username = ?
       LIMIT 1`
    )
    .bind(username)
    .first()) as { id: number; username: string; password_hash: string; password_salt: string } | null;

  if (!user) {
    await recordAttempt(c.env.DB, attemptKey, false);
    return c.json({ message: 'Invalid username or password.' }, 401);
  }

  const ok = await verifyPassword(parsed.data.password, user.password_salt, user.password_hash);
  if (!ok) {
    await recordAttempt(c.env.DB, attemptKey, false);
    return c.json({ message: 'Invalid username or password.' }, 401);
  }

  await recordAttempt(c.env.DB, attemptKey, true);
  await createSession(c, user.id);
  return c.json({ message: 'Login successful.' });
});

authRoutes.post('/logout', requireAuth, async (c) => {
  await clearSession(c);
  return c.json({ message: 'Logged out.' });
});

authRoutes.get('/me', async (c) => {
  const user = await getSessionUser(c);
  if (!user) {
    return c.json({ authenticated: false, user: null });
  }

  return c.json({
    authenticated: true,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      judgeNumber: user.judgeNumber,
      displayName: user.displayName,
    },
  });
});
