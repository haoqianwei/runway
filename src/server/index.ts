import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const port = Number(process.env.PORT || 3000);
const { app, appDb } = createApp();

const server = serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`[runway] Server listening on http://0.0.0.0:${info.port}`);
    console.log(`[runway] Data directory: ${appDb.dataDir}`);
  },
);

const shutdown = () => {
  console.log('[runway] Shutting down...');
  server.close(() => {
    appDb.sqlite.close();
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
