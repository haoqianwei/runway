import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { serve } from '@hono/node-server';
import { createApp } from '../src/server/app.js';

function startHttpServer(handler: http.RequestListener): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') throw new Error('Failed to bind port');
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

test('End-to-end subscription portal workflow', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runway-test-'));

  // 1. Mock Sub-Store server
  const subStoreUserinfo = 'upload=1073741824; download=2147483648; total=107374182400; expire=1893456000';
  const mockSubStore = await startHttpServer((req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/yaml; charset=utf-8',
      'subscription-userinfo': subStoreUserinfo,
    });
    res.end('proxies:\n  - name: HK-01\n    type: ss\n');
  });

  // 2. Mock SubConverter-Extended server (fetches back config= template!)
  const mockSubConverter = await startHttpServer(async (req, res) => {
    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
    if (reqUrl.pathname === '/version') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('subconverter-extended v1.0-mock');
      return;
    }

    if (reqUrl.pathname === '/sub') {
      const target = reqUrl.searchParams.get('target');
      const sourceUrl = reqUrl.searchParams.get('url');
      const configUrl = reqUrl.searchParams.get('config');

      let loadedTemplate = '';
      if (configUrl) {
        const tplRes = await fetch(configUrl);
        if (!tplRes.ok) {
          res.writeHead(500);
          res.end(`Failed to fetch template: ${tplRes.status}`);
          return;
        }
        loadedTemplate = await tplRes.text();
      }

      res.writeHead(200, {
        'Content-Type': 'text/yaml; charset=utf-8',
      });
      res.end(
        [
          `# target=${target}`,
          `# source=${sourceUrl}`,
          `# template_loaded=${loadedTemplate.trim()}`,
          'proxies:',
          '  - name: HK-01',
        ].join('\n'),
      );
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  // 2.5 Mock GitHub Releases API & asset download server
  const ghAssetPayload = 'GITHUB-RELEASE-BINARY-PAYLOAD-123456';
  let mockGithubBaseUrl = '';
  const mockGithub = await startHttpServer((req, res) => {
    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
    if (reqUrl.pathname === '/repos/chen08209/FlClash/releases/latest') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          tag_name: 'v0.8.88',
          assets: [
            {
              name: 'FlClash-0.8.88-windows-amd64-setup.exe',
              size: ghAssetPayload.length,
              browser_download_url: `${mockGithubBaseUrl}/download/FlClash-0.8.88-windows-amd64-setup.exe`,
            },
            {
              name: 'FlClash-0.8.88-android-arm64-v8a.apk',
              size: 1234,
              browser_download_url: `${mockGithubBaseUrl}/download/FlClash-0.8.88-android-arm64-v8a.apk`,
            },
          ],
        }),
      );
      return;
    }

    if (reqUrl.pathname.startsWith('/download/')) {
      const range = req.headers.range;
      if (range === 'bytes=0-5') {
        res.writeHead(206, {
          'Content-Type': 'application/octet-stream',
          'Content-Range': `bytes 0-5/${ghAssetPayload.length}`,
          'Content-Length': '6',
          'Accept-Ranges': 'bytes',
        });
        res.end(ghAssetPayload.slice(0, 6));
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(ghAssetPayload.length),
        'Accept-Ranges': 'bytes',
      });
      res.end(ghAssetPayload);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });
  mockGithubBaseUrl = mockGithub.baseUrl;
  process.env.GITHUB_API_BASE = mockGithubBaseUrl;

  // 3. Start portal app
  process.env.ADMIN_USERNAME = 'admin';
  process.env.ADMIN_PASSWORD = 'password123';
  const { app, appDb } = createApp({ dataDir: tmpDir });
  const portalServer = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });
  await new Promise<void>((resolve) => portalServer.once('listening', () => resolve()));
  const portalAddr = portalServer.address();
  if (!portalAddr || typeof portalAddr === 'string') throw new Error('Portal failed to bind');
  const portalUrl = `http://127.0.0.1:${portalAddr.port}`;

  try {
    // Admin login
    const loginRes = await fetch(`${portalUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password123' }),
    });
    assert.equal(loginRes.status, 200);
    const adminCookie = loginRes.headers.get('set-cookie')?.split(';')[0] || '';
    assert.ok(adminCookie.startsWith('runway_session='));

    // Update settings to point to mock SubConverter & portal internal URL
    const setRes = await fetch(`${portalUrl}/api/admin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        siteTitle: 'Runway Test',
        subconverterUrl: mockSubConverter.baseUrl,
        publicBaseUrl: portalUrl,
        internalBaseUrl: portalUrl,
        githubToken: '',
      }),
    });
    assert.equal(setRes.status, 200);

    // Save custom Stash template
    const tplRes = await fetch(`${portalUrl}/api/admin/clients/stash`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        name: 'Stash',
        subtitle: 'iOS / macOS',
        sortOrder: 1,
        enabled: true,
        scTarget: 'stash',
        scExtraParams: 'list=true',
        feedMode: 'proxy_raw',
        templateContent: '[custom]\nruleset=DIRECT,[]FINAL',
        importScheme: 'stash://install-config?url={url}',
        guideMarkdown: '1. Import',
      }),
    });
    assert.equal(tplRes.status, 200);

    // Create a normal user
    const createUserRes = await fetch(`${portalUrl}/api/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        username: 'alice',
        password: 'alicepassword',
        role: 'user',
        subStoreUrl: `${mockSubStore.baseUrl}/download/alice`,
        note: '测试用户',
        enabled: true,
      }),
    });
    assert.equal(createUserRes.status, 201);
    const { user: alice } = (await createUserRes.json()) as {
      user: { id: number; subToken: string };
    };

    // User logs in and is blocked from admin endpoints
    const userLoginRes = await fetch(`${portalUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'alicepassword' }),
    });
    assert.equal(userLoginRes.status, 200);
    const userCookie = userLoginRes.headers.get('set-cookie')?.split(';')[0] || '';

    const forbiddenRes = await fetch(`${portalUrl}/api/admin/users`, {
      headers: { Cookie: userCookie },
    });
    assert.equal(forbiddenRes.status, 403);

    // Client fetches /s/:token/stash -> calls mock SubConverter -> SubConverter fetches /internal/tpl/stash
    const subRes = await fetch(`${portalUrl}/s/${alice.subToken}/stash`, {
      headers: { 'User-Agent': 'Stash/2.7.0' },
    });
    assert.equal(subRes.status, 200);
    const subBody = await subRes.text();
    assert.match(subBody, /# target=stash/);
    assert.match(subBody, /\/s\/.*\/raw/);
    assert.match(subBody, /ruleset=DIRECT,\[\]FINAL/);

    // Internal template endpoint rejects unauthorized requests
    const badTplRes = await fetch(`${portalUrl}/internal/tpl/stash?key=wrong`);
    assert.equal(badTplRes.status, 403);

    // Reset friend token -> old subscription link immediately returns 403
    const resetRes = await fetch(`${portalUrl}/api/admin/users/${alice.id}/reset-token`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    });
    assert.equal(resetRes.status, 200);

    const revokedRes = await fetch(`${portalUrl}/s/${alice.subToken}/stash`);
    assert.equal(revokedRes.status, 403);

    // Upload local installer & test Range download
    const form = new FormData();
    form.append('clientSlug', 'flclash');
    form.append('platform', 'Windows');
    form.append('label', 'FlClash Setup');
    form.append('version', 'v1.0.0');
    form.append('file', new Blob(['0123456789abcdef'], { type: 'application/octet-stream' }), 'flclash.exe');

    const uploadRes = await fetch(`${portalUrl}/api/admin/downloads/upload`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: form,
    });
    assert.equal(uploadRes.status, 201);
    const { download } = (await uploadRes.json()) as { download: { id: number } };

    const rangeRes = await fetch(`${portalUrl}/downloads/${download.id}`, {
      headers: { Cookie: userCookie, Range: 'bytes=0-3' },
    });
    assert.equal(rangeRes.status, 206);
    assert.equal(await rangeRes.text(), '0123');

    // Preview GitHub Release assets & add GitHub auto-tracked proxy download
    const previewRes = await fetch(`${portalUrl}/api/admin/downloads/github/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        githubRepo: 'chen08209/FlClash',
        assetPattern: '*windows*amd64*.exe',
      }),
    });
    assert.equal(previewRes.status, 200);
    const previewData = (await previewRes.json()) as {
      tagName: string;
      matched: { name: string } | null;
    };
    assert.equal(previewData.tagName, 'v0.8.88');
    assert.equal(previewData.matched?.name, 'FlClash-0.8.88-windows-amd64-setup.exe');

    const ghCreateRes = await fetch(`${portalUrl}/api/admin/downloads/github`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        clientSlug: 'flclash',
        platform: 'Windows',
        label: 'FlClash Windows 最新版',
        githubRepo: 'chen08209/FlClash',
        assetPattern: 'windows-amd64-setup.exe',
      }),
    });
    assert.equal(ghCreateRes.status, 201);
    const { download: ghDl } = (await ghCreateRes.json()) as {
      download: { id: number; version: string };
    };
    assert.equal(ghDl.version, 'v0.8.88');

    // User downloads GitHub latest release via Runway proxy (both full and Range)
    const ghRangeRes = await fetch(`${portalUrl}/downloads/${ghDl.id}`, {
      headers: { Cookie: userCookie, Range: 'bytes=0-5' },
    });
    assert.equal(ghRangeRes.status, 206);
    assert.equal(await ghRangeRes.text(), 'GITHUB');

    const ghFullRes = await fetch(`${portalUrl}/downloads/${ghDl.id}`, {
      headers: { Cookie: userCookie },
    });
    assert.equal(ghFullRes.status, 200);
    assert.match(ghFullRes.headers.get('content-disposition') || '', /FlClash-0\.8\.88-windows-amd64-setup\.exe/);
    assert.equal(await ghFullRes.text(), ghAssetPayload);

    // Add fixed-URL proxy download & verify proxied streaming
    const proxyCreateRes = await fetch(`${portalUrl}/api/admin/downloads/proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        clientSlug: 'flclash',
        platform: 'Android',
        label: 'FlClash Android 代理直链',
        version: 'v0.8.88',
        externalUrl: `${mockGithubBaseUrl}/download/FlClash-0.8.88-android-arm64-v8a.apk`,
      }),
    });
    assert.equal(proxyCreateRes.status, 201);
    const { download: proxyDl } = (await proxyCreateRes.json()) as { download: { id: number } };

    const proxyGetRes = await fetch(`${portalUrl}/downloads/${proxyDl.id}`, {
      headers: { Cookie: userCookie },
    });
    assert.equal(proxyGetRes.status, 200);
    assert.equal(await proxyGetRes.text(), ghAssetPayload);
  } finally {
    delete process.env.GITHUB_API_BASE;
    await new Promise<void>((resolve) => portalServer.close(() => resolve()));
    appDb.sqlite.close();
    await closeServer(mockSubStore.server);
    await closeServer(mockSubConverter.server);
    await closeServer(mockGithub.server);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
