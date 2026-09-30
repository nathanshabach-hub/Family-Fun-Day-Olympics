import { createMiddleware } from 'hono/factory';

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

const normalizeHostName = (hostName: string): string => hostName.trim().toLowerCase();

const hostHeaderToUrl = (host: string): URL | null => {
  try {
    return new URL(`http://${host}`);
  } catch {
    return null;
  }
};

const extractOriginFromReferer = (referer: string | undefined): string | null => {
  if (!referer) {
    return null;
  }

  try {
    const refererUrl = new URL(referer);
    return `${refererUrl.protocol}//${refererUrl.host}`;
  } catch {
    return null;
  }
};

const isHostEquivalent = (originUrl: URL, host: string): boolean => {
  const hostUrl = hostHeaderToUrl(host);
  if (!hostUrl) {
    return false;
  }

  if (originUrl.host === hostUrl.host) {
    return true;
  }

  const originHostName = normalizeHostName(originUrl.hostname);
  const requestHostName = normalizeHostName(hostUrl.hostname);
  const originPort = originUrl.port || (originUrl.protocol === 'https:' ? '443' : '80');
  const requestPort = hostUrl.port || '80';

  const bothLoopback = LOOPBACK_HOSTS.has(originHostName) && LOOPBACK_HOSTS.has(requestHostName);
  return bothLoopback && originPort === requestPort;
};

const isSameTrustedOrigin = (
  origin: string | undefined,
  host: string | undefined,
  forwardedHost: string | undefined,
  requestUrl: string,
  referer: string | undefined
): boolean => {
  const trustedOrigin = origin ?? extractOriginFromReferer(referer);
  if (!trustedOrigin) {
    return false;
  }

  let originUrl: URL;
  try {
    originUrl = new URL(trustedOrigin);
  } catch {
    return false;
  }

  const urlHost = new URL(requestUrl).host;
  const candidates = [host, forwardedHost, urlHost].filter((value): value is string => Boolean(value));
  return candidates.some((candidate) => isHostEquivalent(originUrl, candidate));
};

export const securityHeaders = createMiddleware(async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('X-Frame-Options', 'DENY');
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  c.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
});

export const csrfGuard = createMiddleware(async (c, next) => {
  if (!STATE_CHANGING.has(c.req.method)) {
    await next();
    return;
  }

  const origin = c.req.header('Origin');
  const host = c.req.header('Host');
  const forwardedHost = c.req.header('x-forwarded-host');
  const referer = c.req.header('Referer');
  const csrfHeader = c.req.header('x-ffdo-csrf');

  if (!isSameTrustedOrigin(origin, host, forwardedHost, c.req.url, referer) || csrfHeader !== '1') {
    return c.json({ message: 'Invalid request origin.' }, 403);
  }

  await next();
});
