import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { drizzle } from 'drizzle-orm/d1';
import { api } from './server/routes/api.js';
import { subRouter } from './server/routes/sub.js';
import { dbContext, schema } from './server/db/index.js';
import { runScheduledMaintenance } from './server/scheduler/cron.js';
import { APP_VERSION } from './core/version.js';

type Bindings = {
  DB: D1Database;
  ASSETS?: Fetcher;
  ADMIN_PASSWORD?: string;
  ENABLE_TCP_PING?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', logger());
app.use('*', cors());

// Attach D1 Database via AsyncLocalStorage for every request
app.use('*', async (c, next) => {
  if (c.env?.DB) {
    const d1Db = drizzle(c.env.DB, { schema });
    return dbContext.run(d1Db, () => next());
  }
  return next();
});

// API and Sub endpoints
app.route('/api', api);
app.route('/sub', subRouter);

// Health check. D1 has no long-lived connection, so a cheap SELECT 1 is enough
// to prove the database binding actually works.
app.get('/health', async (c) => {
  const startedAt = Date.now();
  let dbOk = false;
  try {
    if (c.env?.DB) {
      await c.env.DB.prepare('SELECT 1').first();
      dbOk = true;
    }
  } catch (err) {
    console.error('[health] D1 probe failed:', (err as Error).message);
  }

  const payload = {
    version: APP_VERSION,
    build: (c.env as any)?.SUBHUB_BUILD_ID || 'dev',
    platform: 'cloudflare',
    db: dbOk,
    latencyMs: Date.now() - startedAt,
    time: new Date().toISOString(),
  };

  return dbOk
    ? c.json({ status: 'ok', ...payload }, 200)
    : c.json({ status: 'degraded', ...payload }, 503);
});

// Static Assets fallback (Workers Static Assets with smart caching)
app.all('*', async (c) => {
  if (c.env?.ASSETS) {
    const res = await c.env.ASSETS.fetch(c.req.raw);
    const contentType = res.headers.get('content-type') || '';
    const pathname = new URL(c.req.url).pathname;

    const newHeaders = new Headers(res.headers);

    // 1. Ensure charset=utf-8 for text/js/json to avoid browser character encoding issues
    if (
      contentType &&
      !contentType.includes('charset=') &&
      (contentType.includes('javascript') ||
        contentType.includes('text/') ||
        contentType.includes('application/json'))
    ) {
      newHeaders.set('content-type', `${contentType}; charset=utf-8`);
    }

    // 2. Cache-Control policy:
    // - Hashed static assets in /assets/ or /_nuxt/ -> Immutable long-term cache (1 year)
    // - HTML files -> no-cache, always revalidate to fetch newest app version
    if (
      pathname.startsWith('/assets/') ||
      pathname.startsWith('/ui/_nuxt/') ||
      /\.(?:woff2?|ttf|eot|png|jpg|jpeg|svg|ico|webp)$/i.test(pathname)
    ) {
      newHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (contentType.includes('text/html') || pathname.endsWith('.html') || pathname === '/') {
      newHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    }

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: newHeaders,
    });
  }
  return c.text('Not Found', 404);
});

export default {
  fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    if (env.DB) {
      const d1Db = drizzle(env.DB, { schema });
      await dbContext.run(d1Db, async () => {
        await runScheduledMaintenance();
      });
    }
  },
};
