import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { requireRole } from '../worker/middleware/auth';

describe('auth middleware role guard', () => {
  it('blocks role mismatch', async () => {
    const app = new Hono();
    app.use('/admin/*', async (c, next) => {
      c.set('sessionUser', {
        id: 2,
        username: 'judge1',
        role: 'JUDGE',
        judgeNumber: 1,
        displayName: 'Judge 1',
      });
      await next();
    });
    app.use('/admin/*', requireRole('ADMIN'));
    app.get('/admin/ping', (c) => c.json({ ok: true }));

    const res = await app.request('/admin/ping');
    expect(res.status).toBe(403);
  });

  it('allows required role', async () => {
    const app = new Hono();
    app.use('/admin/*', async (c, next) => {
      c.set('sessionUser', {
        id: 1,
        username: 'admin',
        role: 'ADMIN',
        judgeNumber: null,
        displayName: 'Admin',
      });
      await next();
    });
    app.use('/admin/*', requireRole('ADMIN'));
    app.get('/admin/ping', (c) => c.json({ ok: true }));

    const res = await app.request('/admin/ping');
    expect(res.status).toBe(200);
  });
});
