import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { initDatabase, type AppDatabase } from './db/index.js';
import { createAuthRoutes } from './routes/auth.js';
import { createPortalRoutes } from './routes/portal.js';
import { createAdminRoutes } from './routes/admin.js';
import { createSubRoutes } from './routes/sub.js';
import { createDownloadRoutes } from './routes/downloads.js';

export interface CreateAppOptions {
  dataDir?: string;
  webDistDir?: string;
}

export function createApp(options: CreateAppOptions = {}): {
  app: Hono;
  appDb: AppDatabase;
} {
  const appDb = initDatabase(options.dataDir);
  const app = new Hono();

  app.get('/api/health', (c) => c.json({ ok: true }));

  // API Routes
  app.route('/api/auth', createAuthRoutes(appDb));
  app.route('/api/portal', createPortalRoutes(appDb));
  app.route('/api/admin', createAdminRoutes(appDb));

  // Subscription proxy & internal template delivery
  app.route('/', createSubRoutes(appDb));

  // Installer downloads
  app.route('/downloads', createDownloadRoutes(appDb));

  // Serve built Vite SPA in production
  const webDistDir = path.resolve(options.webDistDir || path.join(process.cwd(), 'dist/web'));
  if (fs.existsSync(webDistDir)) {
    const relativeRoot = path.relative(process.cwd(), webDistDir) || '.';
    app.use('/assets/*', serveStatic({ root: relativeRoot }));
    app.use('/favicon.svg', serveStatic({ root: relativeRoot }));

    const indexHtmlPath = path.join(webDistDir, 'index.html');
    app.get('*', (c) => {
      if (
        c.req.path.startsWith('/api/') ||
        c.req.path.startsWith('/s/') ||
        c.req.path.startsWith('/internal/') ||
        c.req.path.startsWith('/downloads/')
      ) {
        return c.json({ error: 'Not Found' }, 404);
      }
      if (fs.existsSync(indexHtmlPath)) {
        return c.html(fs.readFileSync(indexHtmlPath, 'utf-8'));
      }
      return c.text('Frontend build not found', 404);
    });
  }

  app.onError((err, c) => {
    console.error('[runway] Unhandled error:', err);
    return c.json({ error: '服务器内部错误' }, 500);
  });

  return { app, appDb };
}
