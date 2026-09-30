import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { csrfGuard } from '../worker/middleware/security';

describe('csrf guard', () => {
  const makeApp = () => {
    const app = new Hono();
    app.use('/api/*', csrfGuard);
    app.post('/api/ping', (c) => c.json({ ok: true }));
    return app;
  };

  it('allows same origin host and csrf header', async () => {
    const app = makeApp();
    const res = await app.request('http://localhost:5173/api/ping', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
        Host: 'localhost:5173',
        'x-ffdo-csrf': '1',
      },
    });

    expect(res.status).toBe(200);
  });

  it('allows when Host header is missing but request URL host matches origin', async () => {
    const app = makeApp();
    const res = await app.request('http://localhost:5173/api/ping', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
        'x-ffdo-csrf': '1',
      },
    });

    expect(res.status).toBe(200);
  });

  it('allows Referer fallback when Origin header is missing', async () => {
    const app = makeApp();
    const res = await app.request('http://localhost:5173/api/ping', {
      method: 'POST',
      headers: {
        Referer: 'http://localhost:5173/register',
        Host: 'localhost:5173',
        'x-ffdo-csrf': '1',
      },
    });

    expect(res.status).toBe(200);
  });

  it('allows loopback alias host match in local dev', async () => {
    const app = makeApp();
    const res = await app.request('http://0.0.0.0:5173/api/ping', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
        Host: '0.0.0.0:5173',
        'x-ffdo-csrf': '1',
      },
    });

    expect(res.status).toBe(200);
  });

  it('blocks mismatched origin host', async () => {
    const app = makeApp();
    const res = await app.request('http://localhost:5173/api/ping', {
      method: 'POST',
      headers: {
        Origin: 'http://example.com',
        Host: 'localhost:5173',
        'x-ffdo-csrf': '1',
      },
    });

    expect(res.status).toBe(403);
  });
});
