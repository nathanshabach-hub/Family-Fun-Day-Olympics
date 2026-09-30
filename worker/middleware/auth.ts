import { createMiddleware } from 'hono/factory';
import { getSessionUser, type SessionUser } from '../auth/session';

declare module 'hono' {
  interface ContextVariableMap {
    sessionUser: SessionUser;
  }
}

export const requireAuth = createMiddleware(async (c, next) => {
  const user = await getSessionUser(c);
  if (!user) {
    return c.json({ message: 'You are not authorised to perform this action.' }, 401);
  }
  c.set('sessionUser', user);
  await next();
});

export function requireRole(role: 'ADMIN' | 'JUDGE') {
  return createMiddleware(async (c, next) => {
    const user = c.get('sessionUser');
    if (user.role !== role) {
      return c.json({ message: 'You are not authorised to perform this action.' }, 403);
    }
    await next();
  });
}
