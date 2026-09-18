// In-memory sliding window / fixed-window rate limiter
interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitStores = new Map<string, Map<string, RateLimitRecord>>();
let lastCleanupTime = Date.now();

function lazyCleanupStaleEntries() {
  const now = Date.now();
  // Cleanup at most once every 2 minutes when requests arrive
  if (now - lastCleanupTime < 2 * 60 * 1000) return;
  lastCleanupTime = now;

  for (const [, store] of rateLimitStores) {
    for (const [key, record] of store.entries()) {
      if (now > record.resetAt) {
        store.delete(key);
      }
    }
  }
}

export function getClientIpFromContext(c: any): string {
  // If TRUST_PROXY is enabled or running behind Cloudflare / standard reverse proxy
  const trustProxy = process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1';

  if (trustProxy) {
    const cfIp = c.req.header('cf-connecting-ip');
    if (cfIp) return cfIp.trim();
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    const realIp = c.req.header('x-real-ip');
    if (realIp) return realIp.trim();
  } else {
    // When direct exposure (default), prefer Cloudflare header if present, otherwise fallback to standard proxy or socket
    const cfIp = c.req.header('cf-connecting-ip');
    if (cfIp) return cfIp.trim();
    const realIp = c.req.header('x-real-ip');
    if (realIp) return realIp.trim();
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
  }

  // Attempt to get remote socket IP if available from Hono node-server
  const incomingReq = c.env?.incoming;
  if (incomingReq?.socket?.remoteAddress) {
    return incomingReq.socket.remoteAddress;
  }

  return '127.0.0.1';
}

export function checkRateLimit(
  bucket: string,
  key: string,
  options: { maxRequests: number; windowMs: number }
): { allowed: boolean; remaining: number; retryAfterSec: number } {
  lazyCleanupStaleEntries();

  let store = rateLimitStores.get(bucket);
  if (!store) {
    store = new Map();
    rateLimitStores.set(bucket, store);
  }

  const now = Date.now();
  const record = store.get(key);

  if (!record || now > record.resetAt) {
    store.set(key, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return {
      allowed: true,
      remaining: options.maxRequests - 1,
      retryAfterSec: Math.ceil(options.windowMs / 1000),
    };
  }

  if (record.count >= options.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((record.resetAt - now) / 1000)),
    };
  }

  record.count += 1;
  return {
    allowed: true,
    remaining: options.maxRequests - record.count,
    retryAfterSec: Math.ceil((record.resetAt - now) / 1000),
  };
}

export function resetRateLimits(): void {
  rateLimitStores.clear();
}
