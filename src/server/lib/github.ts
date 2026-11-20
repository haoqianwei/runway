import path from 'node:path';
import type { Context } from 'hono';

export interface GithubReleaseAsset {
  name: string;
  size: number;
  downloadUrl: string;
}

export interface ResolvedGithubRelease {
  tagName: string;
  assets: GithubReleaseAsset[];
  fetchedAt: number;
}

export interface MatchedGithubAsset {
  tagName: string;
  asset: GithubReleaseAsset;
}

const RELEASE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const releaseCache = new Map<string, ResolvedGithubRelease>();

export function clearGithubReleaseCache(): void {
  releaseCache.clear();
}

function getGithubApiBase(): string {
  return (process.env.GITHUB_API_BASE || 'https://api.github.com').replace(/\/+$/, '');
}

export function matchAssetByPattern(
  assets: GithubReleaseAsset[],
  pattern: string,
): GithubReleaseAsset | null {
  const trimmed = pattern.trim();
  if (!trimmed) return null;

  if (trimmed.includes('*')) {
    const escaped = trimmed
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    const regex = new RegExp(`^${escaped}$`, 'i');
    return assets.find((a) => regex.test(a.name)) || null;
  }

  const lower = trimmed.toLowerCase();
  return (
    assets.find((a) => a.name.toLowerCase() === lower) ||
    assets.find((a) => a.name.toLowerCase().includes(lower)) ||
    null
  );
}

export async function fetchLatestGithubRelease(
  repo: string,
  githubToken?: string,
  options?: { forceRefresh?: boolean; timeoutMs?: number },
): Promise<ResolvedGithubRelease> {
  const cacheKey = `${getGithubApiBase()}::${repo.toLowerCase()}`;
  const cached = releaseCache.get(cacheKey);
  if (!options?.forceRefresh && cached && Date.now() - cached.fetchedAt < RELEASE_CACHE_TTL_MS) {
    return cached;
  }

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'runway-portal/1.0',
  };
  if (githubToken?.trim()) {
    headers.Authorization = `Bearer ${githubToken.trim()}`;
  }

  const url = `${getGithubApiBase()}/repos/${repo}/releases/latest`;
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(options?.timeoutMs ?? 10000),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`GitHub API 请求失败 (${res.status})${msg ? `: ${msg.slice(0, 160)}` : ''}`);
  }

  const data = (await res.json()) as {
    tag_name?: string;
    name?: string;
    assets?: Array<{
      name?: string;
      size?: number;
      browser_download_url?: string;
    }>;
  };

  const resolved: ResolvedGithubRelease = {
    tagName: data.tag_name || data.name || 'latest',
    assets: (data.assets || [])
      .filter((a) => a.name && a.browser_download_url)
      .map((a) => ({
        name: a.name!,
        size: Number(a.size) || 0,
        downloadUrl: a.browser_download_url!,
      })),
    fetchedAt: Date.now(),
  };

  releaseCache.set(cacheKey, resolved);
  return resolved;
}

export async function resolveGithubReleaseAsset(
  repo: string,
  assetPattern: string,
  githubToken?: string,
  options?: { forceRefresh?: boolean; timeoutMs?: number },
): Promise<MatchedGithubAsset> {
  const release = await fetchLatestGithubRelease(repo, githubToken, options);
  const matched = matchAssetByPattern(release.assets, assetPattern);
  if (!matched) {
    throw new Error(
      `在 ${repo} (${release.tagName}) 中未找到匹配「${assetPattern}」的安装包文件`,
    );
  }
  return { tagName: release.tagName, asset: matched };
}

export function inferFileNameFromUrl(remoteUrl: string, fallback = 'installer.bin'): string {
  try {
    const parsed = new URL(remoteUrl);
    const base = path.basename(decodeURIComponent(parsed.pathname));
    if (base && base !== '/' && base !== '.') {
      return base;
    }
  } catch {
    // Ignore parse error
  }
  return fallback;
}

export async function streamRemoteFile(
  c: Context,
  remoteUrl: string,
  preferredFileName?: string | null,
): Promise<Response> {
  const upstreamHeaders: Record<string, string> = {
    'User-Agent': 'runway-portal/1.0',
    Accept: 'application/octet-stream, */*',
  };

  const rangeHeader = c.req.header('range');
  if (rangeHeader) {
    upstreamHeaders.Range = rangeHeader;
  }

  // Only enforce timeout while waiting for response headers, not while streaming large files
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  let upstream: Response;
  try {
    upstream = await fetch(remoteUrl, {
      method: 'GET',
      headers: upstreamHeaders,
      redirect: 'follow',
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : 'Upstream fetch failed';
    return c.text(`代理拉取安装包失败：${message}`, 502);
  }
  clearTimeout(timer);

  if (!upstream.ok && upstream.status !== 206) {
    await upstream.body?.cancel().catch(() => undefined);
    return c.text(`上游安装包源返回错误 (${upstream.status})`, 502);
  }

  const fileName = preferredFileName?.trim() || inferFileNameFromUrl(remoteUrl);
  const responseHeaders = new Headers();
  responseHeaders.set(
    'Content-Type',
    upstream.headers.get('content-type') || 'application/octet-stream',
  );
  responseHeaders.set(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  );

  const forwardKeys = ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified'];
  for (const key of forwardKeys) {
    const val = upstream.headers.get(key);
    if (val) {
      responseHeaders.set(key, val);
    }
  }
  if (!responseHeaders.has('accept-ranges')) {
    responseHeaders.set('accept-ranges', 'bytes');
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
