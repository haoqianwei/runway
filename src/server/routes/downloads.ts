import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { getSettingValue, type AppDatabase } from '../db/index.js';
import { createAuthMiddleware, type AppVariables } from '../lib/auth.js';
import { resolveGithubReleaseAsset, streamRemoteFile } from '../lib/github.js';

export function createDownloadRoutes(appDb: AppDatabase) {
  const router = new Hono<{ Variables: AppVariables }>();
  const { requireAuth } = createAuthMiddleware(appDb);

  router.get('/:id', requireAuth, async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) {
      return c.text('Invalid download ID', 400);
    }

    const row = appDb.db
      .select()
      .from(schema.downloads)
      .where(eq(schema.downloads.id, id))
      .get();

    if (!row) {
      return c.text('Download not found', 404);
    }

    if (row.sourceType === 'external' && row.externalUrl) {
      return c.redirect(row.externalUrl, 302);
    }

    if (row.sourceType === 'proxy') {
      if (!row.externalUrl) {
        return c.text('Proxy URL missing', 404);
      }
      return streamRemoteFile(c, row.externalUrl, row.fileName);
    }

    if (row.sourceType === 'github_release') {
      if (!row.githubRepo || !row.assetPattern) {
        return c.text('GitHub Release config incomplete', 404);
      }
      const githubToken = getSettingValue(appDb.db, 'github_token', '');
      try {
        const { tagName, asset } = await resolveGithubReleaseAsset(
          row.githubRepo,
          row.assetPattern,
          githubToken,
        );

        // Opportunistically persist latest version/size so portal cards stay fresh
        if (row.version !== tagName || row.fileName !== asset.name || row.fileSize !== asset.size) {
          appDb.db
            .update(schema.downloads)
            .set({
              version: tagName,
              fileName: asset.name,
              fileSize: asset.size,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(schema.downloads.id, row.id))
            .run();
        }

        return streamRemoteFile(c, asset.downloadUrl, asset.name);
      } catch (err) {
        return c.text(
          err instanceof Error ? err.message : '解析 GitHub Release 失败',
          502,
        );
      }
    }

    // Local uploaded file
    if (!row.filePath) {
      return c.text('File missing', 404);
    }

    const fullPath = path.join(appDb.downloadsDir, path.basename(row.filePath));
    if (!fs.existsSync(fullPath)) {
      return c.text('File not found on disk', 404);
    }

    const stat = fs.statSync(fullPath);
    const totalSize = stat.size;
    const downloadName = row.fileName || path.basename(fullPath);
    const disposition = `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`;
    const rangeHeader = c.req.header('range');

    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
      if (!match) {
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${totalSize}` },
        });
      }

      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), totalSize - 1) : totalSize - 1;

      if (start > end || start >= totalSize) {
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${totalSize}` },
        });
      }

      const nodeStream = fs.createReadStream(fullPath, { start, end });
      return new Response(
        Readable.toWeb(nodeStream) as unknown as ConstructorParameters<typeof Response>[0],
        {
          status: 206,
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': disposition,
            'Accept-Ranges': 'bytes',
            'Content-Range': `bytes ${start}-${end}/${totalSize}`,
            'Content-Length': String(end - start + 1),
          },
        },
      );
    }

    const nodeStream = fs.createReadStream(fullPath);
    return new Response(
      Readable.toWeb(nodeStream) as unknown as ConstructorParameters<typeof Response>[0],
      {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': disposition,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(totalSize),
        },
      },
    );
  });

  return router;
}
