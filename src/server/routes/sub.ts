import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { getSettingValue, getSystemSettings, type AppDatabase } from '../db/index.js';
import {
  buildSubConverterRequestUrl,
  getClientIp,
  resolveInternalBaseUrl,
  resolvePublicBaseUrl,
} from '../lib/sub.js';

function recordAccessLog(
  appDb: AppDatabase,
  entry: {
    userId: number;
    username: string;
    clientSlug: string;
    ip: string;
    userAgent: string;
    statusCode: number;
  },
) {
  try {
    appDb.db
      .insert(schema.subLogs)
      .values({
        ...entry,
        createdAt: new Date().toISOString(),
      })
      .run();

    // Keep latest 1000 rows to prevent unbounded growth
    appDb.sqlite.exec(`
      DELETE FROM sub_logs
      WHERE id NOT IN (
        SELECT id FROM sub_logs ORDER BY id DESC LIMIT 1000
      )
    `);
  } catch {
    // Logging should never break subscription delivery
  }
}

export function createSubRoutes(appDb: AppDatabase) {
  const router = new Hono();

  // Internal template endpoint consumed by SubConverter-Extended (&config=...)
  router.get('/internal/tpl/:slug', (c) => {
    const key = c.req.query('key') || '';
    const expected = getSettingValue(appDb.db, 'internal_secret');
    if (!expected || key !== expected) {
      return c.text('Forbidden', 403);
    }

    const slug = c.req.param('slug');
    const client = appDb.db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.slug, slug))
      .get();

    if (!client) {
      return c.text('Not Found', 404);
    }

    return c.text(client.templateContent, 200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    });
  });

  // Raw Sub-Store relay endpoint (hides real Sub-Store URL even when proxy-providers is used)
  router.get('/s/:token/raw', async (c) => {
    const token = c.req.param('token');
    const userRow = appDb.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.subToken, token))
      .get();

    if (!userRow || !userRow.enabled) {
      return c.text('Forbidden', 403);
    }
    if (!userRow.subStoreUrl.trim()) {
      return c.text('Subscription not configured', 404);
    }

    const ip = getClientIp(c);
    const ua = c.req.header('user-agent') || '';

    try {
      const upstream = await fetch(userRow.subStoreUrl, {
        headers: {
          'User-Agent': ua || 'clash-verge/v2.0.0 mihomo/1.19',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      });

      const body = await upstream.text();
      recordAccessLog(appDb, {
        userId: userRow.id,
        username: userRow.username,
        clientSlug: 'raw',
        ip,
        userAgent: ua.slice(0, 255),
        statusCode: upstream.status,
      });

      const headers: Record<string, string> = {
        'Content-Type': upstream.headers.get('content-type') || 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      };
      const userinfo = upstream.headers.get('subscription-userinfo');
      if (userinfo) {
        headers['subscription-userinfo'] = userinfo;
      }

      return new Response(body, { status: upstream.status, headers });
    } catch {
      recordAccessLog(appDb, {
        userId: userRow.id,
        username: userRow.username,
        clientSlug: 'raw',
        ip,
        userAgent: ua.slice(0, 255),
        statusCode: 502,
      });
      return c.text('Upstream Sub-Store unreachable', 502);
    }
  });

  // Main subscription endpoint: /s/:token/:slug (e.g. /s/<token>/stash)
  router.get('/s/:token/:slug', async (c) => {
    const token = c.req.param('token');
    const slug = c.req.param('slug');
    const ip = getClientIp(c);
    const ua = c.req.header('user-agent') || '';

    const userRow = appDb.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.subToken, token))
      .get();

    if (!userRow || !userRow.enabled) {
      return c.text('Invalid or disabled subscription token', 403);
    }
    if (!userRow.subStoreUrl.trim()) {
      return c.text('Subscription source not configured for this user', 404);
    }

    const client = appDb.db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.slug, slug))
      .get();

    if (!client || !client.enabled) {
      return c.text('Client profile not found or disabled', 404);
    }

    const settings = getSystemSettings(appDb.db);
    const internalBaseUrl = resolveInternalBaseUrl(settings.internalBaseUrl, c);
    const publicBaseUrl = resolvePublicBaseUrl(settings.publicBaseUrl, c);
    const internalSecret = getSettingValue(appDb.db, 'internal_secret');

    const sourceUrl =
      client.feedMode === 'proxy_raw'
        ? `${publicBaseUrl}/s/${userRow.subToken}/raw`
        : userRow.subStoreUrl.trim();

    const configUrl = client.templateContent.trim()
      ? `${internalBaseUrl}/internal/tpl/${client.slug}?key=${encodeURIComponent(internalSecret)}`
      : null;

    const subconverterRequestUrl = buildSubConverterRequestUrl({
      subconverterBaseUrl: settings.subconverterUrl,
      target: client.scTarget,
      sourceUrl,
      configUrl,
      extraParams: client.scExtraParams,
    });

    try {
      const upstream = await fetch(subconverterRequestUrl, {
        headers: {
          'User-Agent': ua || 'clash-verge/v2.0.0 mihomo/1.19',
        },
        signal: AbortSignal.timeout(20000),
      });

      const body = await upstream.text();
      recordAccessLog(appDb, {
        userId: userRow.id,
        username: userRow.username,
        clientSlug: client.slug,
        ip,
        userAgent: ua.slice(0, 255),
        statusCode: upstream.status,
      });

      if (!upstream.ok) {
        return new Response(body || 'SubConverter returned an error', {
          status: upstream.status,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }

      const headers: Record<string, string> = {
        'Content-Type': upstream.headers.get('content-type') || 'text/yaml; charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${client.name}-${userRow.username}.yaml`)}`,
        'profile-update-interval': upstream.headers.get('profile-update-interval') || '24',
        'Cache-Control': 'no-store',
      };

      const userinfo = upstream.headers.get('subscription-userinfo');
      if (userinfo) {
        headers['subscription-userinfo'] = userinfo;
      }

      return new Response(body, { status: 200, headers });
    } catch {
      recordAccessLog(appDb, {
        userId: userRow.id,
        username: userRow.username,
        clientSlug: client.slug,
        ip,
        userAgent: ua.slice(0, 255),
        statusCode: 502,
      });
      return c.text('Failed to reach SubConverter-Extended backend', 502);
    }
  });

  return router;
}
