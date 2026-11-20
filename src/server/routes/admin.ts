import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { asc, desc, eq } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import {
  generateToken,
  getSettingValue,
  getSystemSettings,
  setSettingValue,
  type AppDatabase,
} from '../db/index.js';
import { createAuthMiddleware, hashPassword, type AppVariables } from '../lib/auth.js';
import {
  buildSubConverterRequestUrl,
  resolveInternalBaseUrl,
  resolvePublicBaseUrl,
  trimTrailingSlash,
} from '../lib/sub.js';
import {
  clearGithubReleaseCache,
  fetchLatestGithubRelease,
  inferFileNameFromUrl,
  matchAssetByPattern,
  resolveGithubReleaseAsset,
} from '../lib/github.js';
import {
  createExternalDownloadSchema,
  createGithubDownloadSchema,
  createProxyDownloadSchema,
  createUserSchema,
  previewGithubReleaseSchema,
  updateSettingsSchema,
  updateUserSchema,
  upsertClientSchema,
  type AdminClientDTO,
  type AdminUserDTO,
  type DownloadItemDTO,
  type DownloadPlatform,
} from '../../shared/types.js';

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500MB

function toAdminUserDTO(row: typeof schema.users.$inferSelect): AdminUserDTO {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    subToken: row.subToken,
    subStoreUrl: row.subStoreUrl,
    note: row.note,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toDownloadDTO(row: typeof schema.downloads.$inferSelect): DownloadItemDTO {
  return {
    id: row.id,
    clientSlug: row.clientSlug,
    platform: row.platform as DownloadPlatform,
    label: row.label,
    version: row.version,
    sourceType: row.sourceType,
    externalUrl: row.externalUrl,
    githubRepo: row.githubRepo,
    assetPattern: row.assetPattern,
    fileName: row.fileName,
    fileSize: row.fileSize,
    downloadUrl:
      row.sourceType === 'external' ? row.externalUrl || '#' : `/downloads/${row.id}`,
    updatedAt: row.updatedAt,
  };
}

export function createAdminRoutes(appDb: AppDatabase) {
  const router = new Hono<{ Variables: AppVariables }>();
  const { requireAuth, requireAdmin } = createAuthMiddleware(appDb);

  router.use('*', requireAuth, requireAdmin);

  // ==================== Users ====================

  router.get('/users', (c) => {
    const rows = appDb.db
      .select()
      .from(schema.users)
      .orderBy(asc(schema.users.id))
      .all();
    return c.json({ users: rows.map(toAdminUserDTO) });
  });

  router.post('/users', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || '参数错误' }, 400);
    }

    const existing = appDb.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, parsed.data.username))
      .get();
    if (existing) {
      return c.json({ error: '用户名已存在' }, 409);
    }

    const now = new Date().toISOString();
    const inserted = appDb.db
      .insert(schema.users)
      .values({
        username: parsed.data.username,
        passwordHash: hashPassword(parsed.data.password),
        role: parsed.data.role,
        subToken: generateToken(16),
        subStoreUrl: parsed.data.subStoreUrl,
        note: parsed.data.note,
        enabled: parsed.data.enabled,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    return c.json({ user: toAdminUserDTO(inserted) }, 201);
  });

  router.put('/users/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) {
      return c.json({ error: '无效的用户 ID' }, 400);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || '参数错误' }, 400);
    }

    const existing = appDb.db.select().from(schema.users).where(eq(schema.users.id, id)).get();
    if (!existing) {
      return c.json({ error: '用户不存在' }, 404);
    }

    const currentUser = c.get('user');
    if (existing.id === currentUser.id && parsed.data.enabled === false) {
      return c.json({ error: '不能禁用当前登录的管理员账号' }, 400);
    }
    if (existing.id === currentUser.id && parsed.data.role === 'user') {
      return c.json({ error: '不能降级当前登录的管理员账号' }, 400);
    }

    const updates: Partial<typeof schema.users.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };
    if (parsed.data.password) updates.passwordHash = hashPassword(parsed.data.password);
    if (parsed.data.role !== undefined) updates.role = parsed.data.role;
    if (parsed.data.subStoreUrl !== undefined) updates.subStoreUrl = parsed.data.subStoreUrl;
    if (parsed.data.note !== undefined) updates.note = parsed.data.note;
    if (parsed.data.enabled !== undefined) updates.enabled = parsed.data.enabled;

    const updated = appDb.db
      .update(schema.users)
      .set(updates)
      .where(eq(schema.users.id, id))
      .returning()
      .get();

    return c.json({ user: toAdminUserDTO(updated) });
  });

  router.post('/users/:id/reset-token', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) {
      return c.json({ error: '无效的用户 ID' }, 400);
    }

    const existing = appDb.db.select().from(schema.users).where(eq(schema.users.id, id)).get();
    if (!existing) {
      return c.json({ error: '用户不存在' }, 404);
    }

    const updated = appDb.db
      .update(schema.users)
      .set({
        subToken: generateToken(16),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.users.id, id))
      .returning()
      .get();

    return c.json({ user: toAdminUserDTO(updated) });
  });

  router.delete('/users/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) {
      return c.json({ error: '无效的用户 ID' }, 400);
    }

    if (id === c.get('user').id) {
      return c.json({ error: '不能删除当前登录的管理员账号' }, 400);
    }

    const deleted = appDb.db.delete(schema.users).where(eq(schema.users.id, id)).returning().get();
    if (!deleted) {
      return c.json({ error: '用户不存在' }, 404);
    }
    return c.json({ ok: true });
  });

  // ==================== Clients & Templates ====================

  router.get('/clients', (c) => {
    const rows = appDb.db
      .select()
      .from(schema.clients)
      .orderBy(asc(schema.clients.sortOrder), asc(schema.clients.slug))
      .all();

    const clients: AdminClientDTO[] = rows.map((row) => ({
      slug: row.slug,
      name: row.name,
      subtitle: row.subtitle,
      sortOrder: row.sortOrder,
      enabled: row.enabled,
      scTarget: row.scTarget,
      scExtraParams: row.scExtraParams,
      feedMode: row.feedMode,
      templateContent: row.templateContent,
      importScheme: row.importScheme,
      guideMarkdown: row.guideMarkdown,
      updatedAt: row.updatedAt,
    }));

    return c.json({ clients });
  });

  router.put('/clients/:slug', async (c) => {
    const slug = c.req.param('slug');
    const body = await c.req.json().catch(() => null);
    const parsed = upsertClientSchema.safeParse({ ...body, slug });
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || '参数错误' }, 400);
    }

    const now = new Date().toISOString();
    const record = appDb.db
      .insert(schema.clients)
      .values({
        ...parsed.data,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.clients.slug,
        set: {
          name: parsed.data.name,
          subtitle: parsed.data.subtitle,
          sortOrder: parsed.data.sortOrder,
          enabled: parsed.data.enabled,
          scTarget: parsed.data.scTarget,
          scExtraParams: parsed.data.scExtraParams,
          feedMode: parsed.data.feedMode,
          templateContent: parsed.data.templateContent,
          importScheme: parsed.data.importScheme,
          guideMarkdown: parsed.data.guideMarkdown,
          updatedAt: now,
        },
      })
      .returning()
      .get();

    return c.json({ client: record });
  });

  router.delete('/clients/:slug', (c) => {
    const slug = c.req.param('slug');
    const deleted = appDb.db
      .delete(schema.clients)
      .where(eq(schema.clients.slug, slug))
      .returning()
      .get();
    if (!deleted) {
      return c.json({ error: '客户端配置不存在' }, 404);
    }
    return c.json({ ok: true });
  });

  router.post('/clients/:slug/test', async (c) => {
    const slug = c.req.param('slug');
    const body = (await c.req.json().catch(() => ({}))) as {
      userId?: number;
      explain?: boolean;
    };

    const client = appDb.db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.slug, slug))
      .get();
    if (!client) {
      return c.json({ error: '客户端配置不存在' }, 404);
    }

    const userRow = body.userId
      ? appDb.db.select().from(schema.users).where(eq(schema.users.id, body.userId)).get()
      : appDb.db.select().from(schema.users).where(eq(schema.users.id, c.get('user').id)).get();

    if (!userRow || !userRow.subStoreUrl.trim()) {
      return c.json({ error: '请选择一个已配置 Sub-Store 链接的用户进行测试' }, 400);
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

    const targetUrl = buildSubConverterRequestUrl({
      subconverterBaseUrl: settings.subconverterUrl,
      target: client.scTarget,
      sourceUrl,
      configUrl,
      extraParams: client.scExtraParams,
      explain: Boolean(body.explain),
    });

    try {
      const res = await fetch(targetUrl, {
        headers: { 'User-Agent': 'runway-tester/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      const text = await res.text();
      return c.json({
        ok: res.ok,
        status: res.status,
        requestUrl: targetUrl.replace(internalSecret, '***'),
        subscriptionUserinfo: res.headers.get('subscription-userinfo'),
        preview: text.slice(0, 8000),
        totalLength: text.length,
      });
    } catch (err) {
      return c.json(
        {
          ok: false,
          status: 502,
          requestUrl: targetUrl.replace(internalSecret, '***'),
          error: err instanceof Error ? err.message : '请求 SubConverter 失败',
        },
        502,
      );
    }
  });

  // ==================== Downloads ====================

  router.get('/downloads', (c) => {
    const rows = appDb.db
      .select()
      .from(schema.downloads)
      .orderBy(asc(schema.downloads.clientSlug), asc(schema.downloads.id))
      .all();
    return c.json({ downloads: rows.map(toDownloadDTO) });
  });

  router.post('/downloads/external', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = createExternalDownloadSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || '参数错误' }, 400);
    }

    const now = new Date().toISOString();
    const inserted = appDb.db
      .insert(schema.downloads)
      .values({
        clientSlug: parsed.data.clientSlug,
        platform: parsed.data.platform,
        label: parsed.data.label,
        version: parsed.data.version,
        sourceType: 'external',
        externalUrl: parsed.data.externalUrl,
        updatedAt: now,
      })
      .returning()
      .get();

    return c.json({ download: toDownloadDTO(inserted) }, 201);
  });

  router.post('/downloads/proxy', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = createProxyDownloadSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || '参数错误' }, 400);
    }

    const fileName =
      parsed.data.fileName?.trim() || inferFileNameFromUrl(parsed.data.externalUrl);
    const now = new Date().toISOString();
    const inserted = appDb.db
      .insert(schema.downloads)
      .values({
        clientSlug: parsed.data.clientSlug,
        platform: parsed.data.platform,
        label: parsed.data.label,
        version: parsed.data.version,
        sourceType: 'proxy',
        externalUrl: parsed.data.externalUrl,
        fileName,
        updatedAt: now,
      })
      .returning()
      .get();

    return c.json({ download: toDownloadDTO(inserted) }, 201);
  });

  router.post('/downloads/github/preview', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = previewGithubReleaseSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || '参数错误' }, 400);
    }

    const githubToken = getSettingValue(appDb.db, 'github_token', '');
    try {
      const release = await fetchLatestGithubRelease(parsed.data.githubRepo, githubToken, {
        forceRefresh: true,
      });
      const matched = parsed.data.assetPattern
        ? matchAssetByPattern(release.assets, parsed.data.assetPattern)
        : null;
      return c.json({
        tagName: release.tagName,
        matched,
        assets: release.assets,
      });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : '拉取 GitHub Release 失败' },
        502,
      );
    }
  });

  router.post('/downloads/github', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = createGithubDownloadSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || '参数错误' }, 400);
    }

    const githubToken = getSettingValue(appDb.db, 'github_token', '');
    let version = '';
    let fileName: string | null = null;
    let fileSize: number | null = null;

    try {
      const { tagName, asset } = await resolveGithubReleaseAsset(
        parsed.data.githubRepo,
        parsed.data.assetPattern,
        githubToken,
        { forceRefresh: true, timeoutMs: 8000 },
      );
      version = tagName;
      fileName = asset.name;
      fileSize = asset.size;
    } catch {
      // Allow saving even if GitHub is temporarily unreachable; download endpoint resolves lazily
    }

    const now = new Date().toISOString();
    const inserted = appDb.db
      .insert(schema.downloads)
      .values({
        clientSlug: parsed.data.clientSlug,
        platform: parsed.data.platform,
        label: parsed.data.label,
        version,
        sourceType: 'github_release',
        githubRepo: parsed.data.githubRepo,
        assetPattern: parsed.data.assetPattern,
        fileName,
        fileSize,
        updatedAt: now,
      })
      .returning()
      .get();

    return c.json({ download: toDownloadDTO(inserted) }, 201);
  });

  router.post('/downloads/upload', async (c) => {
    const body = await c.req.parseBody();
    const file = body['file'];
    const clientSlug = String(body['clientSlug'] || '').trim();
    const platform = String(body['platform'] || '').trim();
    const label = String(body['label'] || '').trim();
    const version = String(body['version'] || '').trim();

    if (!(file instanceof File)) {
      return c.json({ error: '请先选择要上传的安装包文件' }, 400);
    }
    if (!clientSlug || !platform || !label) {
      return c.json({ error: '请填写完整的客户端、平台和名称信息' }, 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return c.json({ error: '文件过大，单文件上限 500MB' }, 413);
    }

    const safeOriginalName = path.basename(file.name || 'installer.bin').replace(/[^\w.\-\u4e00-\u9fa5]/g, '_');
    const storedFileName = `${Date.now()}-${generateToken(6)}-${safeOriginalName}`;
    const fullPath = path.join(appDb.downloadsDir, storedFileName);

    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(fullPath, buffer);

    const now = new Date().toISOString();
    const inserted = appDb.db
      .insert(schema.downloads)
      .values({
        clientSlug,
        platform,
        label,
        version,
        sourceType: 'local',
        filePath: storedFileName,
        fileName: safeOriginalName,
        fileSize: buffer.byteLength,
        updatedAt: now,
      })
      .returning()
      .get();

    return c.json({ download: toDownloadDTO(inserted) }, 201);
  });

  router.delete('/downloads/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) {
      return c.json({ error: '无效的下载项 ID' }, 400);
    }

    const existing = appDb.db
      .select()
      .from(schema.downloads)
      .where(eq(schema.downloads.id, id))
      .get();
    if (!existing) {
      return c.json({ error: '下载项不存在' }, 404);
    }

    if (existing.sourceType === 'local' && existing.filePath) {
      const target = path.join(appDb.downloadsDir, path.basename(existing.filePath));
      if (fs.existsSync(target)) {
        fs.unlinkSync(target);
      }
    }

    appDb.db.delete(schema.downloads).where(eq(schema.downloads.id, id)).run();
    return c.json({ ok: true });
  });

  // ==================== Settings ====================

  router.get('/settings', (c) => {
    return c.json({ settings: getSystemSettings(appDb.db) });
  });

  router.put('/settings', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = updateSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || '参数错误' }, 400);
    }

    setSettingValue(appDb.db, 'site_title', parsed.data.siteTitle);
    setSettingValue(appDb.db, 'subconverter_url', trimTrailingSlash(parsed.data.subconverterUrl));
    setSettingValue(appDb.db, 'public_base_url', trimTrailingSlash(parsed.data.publicBaseUrl));
    setSettingValue(appDb.db, 'internal_base_url', trimTrailingSlash(parsed.data.internalBaseUrl));
    setSettingValue(appDb.db, 'github_token', parsed.data.githubToken);
    clearGithubReleaseCache();

    return c.json({ settings: getSystemSettings(appDb.db) });
  });

  router.post('/settings/test-subconverter', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { url?: string };
    const base = trimTrailingSlash(
      body.url || getSettingValue(appDb.db, 'subconverter_url', 'http://subconverter:25500'),
    );
    const probeUrl = `${base}/version`;
    try {
      const res = await fetch(probeUrl, { signal: AbortSignal.timeout(5000) });
      const text = (await res.text()).trim();
      return c.json({
        ok: res.ok,
        status: res.status,
        version: text.slice(0, 200),
      });
    } catch (err) {
      return c.json(
        {
          ok: false,
          status: 502,
          error: err instanceof Error ? err.message : '无法连接到 SubConverter',
        },
        502,
      );
    }
  });

  // ==================== Access Logs ====================

  router.get('/logs', (c) => {
    const limit = Math.min(Number(c.req.query('limit') || 100), 300);
    const logs = appDb.db
      .select()
      .from(schema.subLogs)
      .orderBy(desc(schema.subLogs.id))
      .limit(limit)
      .all();
    return c.json({ logs });
  });

  router.delete('/logs', (c) => {
    appDb.db.delete(schema.subLogs).run();
    return c.json({ ok: true });
  });

  return router;
}
