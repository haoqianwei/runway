import { Hono } from 'hono';
import { asc, eq } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { getSettingValue, getSystemSettings, type AppDatabase } from '../db/index.js';
import { createAuthMiddleware, type AppVariables } from '../lib/auth.js';
import { resolveGithubReleaseAsset } from '../lib/github.js';
import {
  buildOneClickUrl,
  resolvePublicBaseUrl,
} from '../lib/sub.js';
import type { DownloadItemDTO, DownloadPlatform, PortalClientDTO, PortalOverviewDTO } from '../../shared/types.js';

export function createPortalRoutes(appDb: AppDatabase) {
  const router = new Hono<{ Variables: AppVariables }>();
  const { requireAuth } = createAuthMiddleware(appDb);

  router.use('*', requireAuth);

  router.get('/overview', async (c) => {
    const authUser = c.get('user');
    const userRow = appDb.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, authUser.id))
      .get();

    if (!userRow) {
      return c.json({ error: '用户不存在' }, 404);
    }

    const settings = getSystemSettings(appDb.db);
    const publicBaseUrl = resolvePublicBaseUrl(settings.publicBaseUrl, c);
    const githubToken = getSettingValue(appDb.db, 'github_token', '');

    const enabledClients = appDb.db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.enabled, true))
      .orderBy(asc(schema.clients.sortOrder), asc(schema.clients.slug))
      .all();

    const allDownloads = appDb.db
      .select()
      .from(schema.downloads)
      .orderBy(asc(schema.downloads.id))
      .all();

    // Opportunistically refresh cached GitHub release metadata (short timeout so portal stays snappy)
    const enrichedDownloads = await Promise.all(
      allDownloads.map(async (d): Promise<DownloadItemDTO> => {
        let version = d.version;
        let fileName = d.fileName;
        let fileSize = d.fileSize;

        if (d.sourceType === 'github_release' && d.githubRepo && d.assetPattern) {
          try {
            const { tagName, asset } = await resolveGithubReleaseAsset(
              d.githubRepo,
              d.assetPattern,
              githubToken,
              { timeoutMs: 3500 },
            );
            version = tagName;
            fileName = asset.name;
            fileSize = asset.size;
            if (d.version !== tagName || d.fileName !== asset.name || d.fileSize !== asset.size) {
              appDb.db
                .update(schema.downloads)
                .set({
                  version: tagName,
                  fileName: asset.name,
                  fileSize: asset.size,
                  updatedAt: new Date().toISOString(),
                })
                .where(eq(schema.downloads.id, d.id))
                .run();
            }
          } catch {
            // Keep previously cached version/size if GitHub API is temporarily slow
          }
        }

        return {
          id: d.id,
          clientSlug: d.clientSlug,
          platform: d.platform as DownloadPlatform,
          label: d.label,
          version,
          sourceType: d.sourceType,
          externalUrl: d.externalUrl,
          githubRepo: d.githubRepo,
          assetPattern: d.assetPattern,
          fileName,
          fileSize,
          downloadUrl:
            d.sourceType === 'external' ? d.externalUrl || '#' : `/downloads/${d.id}`,
          updatedAt: d.updatedAt,
        };
      }),
    );

    const downloadsByClient = new Map<string, DownloadItemDTO[]>();
    for (const item of enrichedDownloads) {
      const list = downloadsByClient.get(item.clientSlug) || [];
      list.push(item);
      downloadsByClient.set(item.clientSlug, list);
    }

    const clients: PortalClientDTO[] = enabledClients.map((client) => {
      const subscriptionUrl = `${publicBaseUrl}/s/${userRow.subToken}/${client.slug}`;
      const profileName = `${settings.siteTitle}-${client.name}`;
      return {
        slug: client.slug,
        name: client.name,
        subtitle: client.subtitle,
        importScheme: client.importScheme,
        guideMarkdown: client.guideMarkdown,
        subscriptionUrl,
        oneClickUrl: buildOneClickUrl(client.importScheme, subscriptionUrl, profileName),
        downloads: downloadsByClient.get(client.slug) || [],
      };
    });

    const response: PortalOverviewDTO = {
      siteTitle: settings.siteTitle,
      user: authUser,
      hasSubscription: Boolean(userRow.subStoreUrl.trim()),
      clients,
    };

    return c.json(response);
  });

  return router;
}
