import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { api } from './routes/api.js';
import { subRouter } from './routes/sub.js';
import { initNodeScheduler } from './scheduler/cron.node.js';
import { initNodeDatabase } from './db/node.js';
import { setDefaultDb } from './db/index.js';
import { APP_VERSION } from '../core/version.js';
import path from 'path';
import fs from 'fs';

// Initialize SQLite for Node.js
const { db: nodeDb, sqlite: nodeSqlite } = initNodeDatabase();
setDefaultDb(nodeDb);

const app = new Hono();

app.use('*', logger());
app.use('*', cors());

// API and Sub endpoints
app.route('/api', api);
app.route('/sub', subRouter);

// Health check (used by the Docker HEALTHCHECK and external monitoring).
// Performs a real SQLite round-trip so a broken/stuck database is reported
// as "degraded" instead of a misleading 200.
app.get('/health', (c) => {
  const startedAt = Date.now();
  let dbOk = false;
  try {
    nodeSqlite.prepare('SELECT 1').get();
    dbOk = true;
  } catch (err) {
    console.error('[health] SQLite probe failed:', (err as Error).message);
  }

  const payload = {
    version: APP_VERSION,
    build: process.env.SUBHUB_BUILD_ID || 'dev',
    platform: 'node',
    db: dbOk,
    latencyMs: Date.now() - startedAt,
    time: new Date().toISOString(),
  };

  return dbOk
    ? c.json({ status: 'ok', ...payload }, 200)
    : c.json({ status: 'degraded', ...payload }, 503);
});

// Production: Serve static React frontend if dist/client exists
const clientDist = path.resolve(process.cwd(), 'dist/client');
if (fs.existsSync(clientDist)) {
  app.get('*', async (c) => {
    // Sanitize path to prevent directory traversal attacks
    let cleanPath = c.req.path === '/' ? 'index.html' : c.req.path.replace(/^\/+/, '');
    try {
      cleanPath = decodeURIComponent(cleanPath);
    } catch {
      return c.text('Bad Request', 400);
    }

    let filePath = path.resolve(clientDist, cleanPath);

    // Verify filePath is strictly within clientDist directory
    if (!filePath.startsWith(clientDist + path.sep) && filePath !== clientDist) {
      return c.text('Forbidden', 403);
    }

    // Resolve directory paths to their index.html (e.g. /ui/ -> /ui/index.html)
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.ico': 'image/x-icon',
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      const fileContent = fs.readFileSync(filePath);
      return c.body(fileContent, 200, { 'Content-Type': contentType });
    }

    // Fallback to index.html for SPA routing
    const indexHtml = path.join(clientDist, 'index.html');
    if (fs.existsSync(indexHtml)) {
      return c.html(fs.readFileSync(indexHtml, 'utf-8'));
    }

    return c.text('Not Found', 404);
  });
}

// Start Scheduler
initNodeScheduler();

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

console.log(`🚀 SubHub Server starting at http://${HOST}:${PORT}`);
serve({
  fetch: app.fetch,
  port: PORT,
  hostname: HOST,
});

export default app;
