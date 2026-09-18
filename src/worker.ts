import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { drizzle } from 'drizzle-orm/d1';
import { api } from './server/routes/api.js';
import { subRouter } from './server/routes/sub.js';
import { dbContext, schema } from './server/db/index.js';
import { runScheduledMaintenance } from './server/scheduler/cron.js';

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

// Health check
app.get('/health', (c) => c.json({ status: 'ok', time: new Date().toISOString(), platform: 'cloudflare' }));

// Static Assets fallback (Workers Static Assets)
app.all('*', async (c) => {
  if (c.env?.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
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
