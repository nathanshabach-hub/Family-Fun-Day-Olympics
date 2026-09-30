import { setCookie, deleteCookie } from 'hono/cookie';
import type { Context } from 'hono';
import { createSessionToken, sha256Hex } from './crypto';
import type { Env } from '../types';

const SESSION_COOKIE = 'ffdo_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12;

export type SessionUser = {
  id: number;
  username: string;
  role: 'ADMIN' | 'JUDGE';
  judgeNumber: number | null;
  displayName: string;
};

export async function createSession(c: Context<{ Bindings: Env }>, userId: number): Promise<void> {
  const token = createSessionToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

  await c.env.DB.prepare(
    `INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)`
  )
    .bind(userId, tokenHash, expiresAt)
    .run();

  setCookie(c, SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'Strict',
    secure: true,
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSession(c: Context<{ Bindings: Env }>): Promise<void> {
  const cookie = c.req.header('Cookie') ?? '';
  const token = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);

  if (token) {
    const tokenHash = await sha256Hex(token);
    await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
  }

  deleteCookie(c, SESSION_COOKIE, {
    path: '/',
    httpOnly: true,
    sameSite: 'Strict',
    secure: true,
  });
}

export async function getSessionUser(c: Context<{ Bindings: Env }>): Promise<SessionUser | null> {
  const cookie = c.req.header('Cookie') ?? '';
  const token = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);

  if (!token) {
    return null;
  }

  const tokenHash = await sha256Hex(token);
  const result = (await c.env.DB.prepare(
    `SELECT u.id, u.username, u.role, u.judge_number, u.display_name
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?
     LIMIT 1`
  )
    .bind(tokenHash, new Date().toISOString())
    .first()) as { id: number; username: string; role: 'ADMIN' | 'JUDGE'; judge_number: number | null; display_name: string } | null;

  if (!result) {
    return null;
  }

  return {
    id: result.id,
    username: result.username,
    role: result.role,
    judgeNumber: result.judge_number,
    displayName: result.display_name,
  };
}
