import type { Context } from 'hono';

export function trimTrailingSlash(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function resolvePublicBaseUrl(configured: string, c: Context): string {
  if (configured.trim()) {
    return trimTrailingSlash(configured);
  }
  const forwardedProto = c.req.header('x-forwarded-proto');
  const forwardedHost = c.req.header('x-forwarded-host');
  if (forwardedHost) {
    return `${forwardedProto || 'http'}://${forwardedHost}`.replace(/\/+$/, '');
  }
  const url = new URL(c.req.url);
  return `${forwardedProto || url.protocol.replace(':', '')}://${url.host}`;
}

export function resolveInternalBaseUrl(configured: string, c: Context): string {
  if (configured.trim()) {
    return trimTrailingSlash(configured);
  }
  const url = new URL(c.req.url);
  return `${url.protocol}//${url.host}`;
}

export function buildOneClickUrl(
  scheme: string,
  subscriptionUrl: string,
  profileName: string,
): string | null {
  const trimmed = scheme.trim();
  if (!trimmed) return null;
  return trimmed
    .replaceAll('{url}', encodeURIComponent(subscriptionUrl))
    .replaceAll('{name}', encodeURIComponent(profileName));
}

export function buildSubConverterRequestUrl(options: {
  subconverterBaseUrl: string;
  target: string;
  sourceUrl: string;
  configUrl?: string | null;
  extraParams?: string;
  explain?: boolean;
}): string {
  const base = trimTrailingSlash(options.subconverterBaseUrl);
  const endpoint = base.endsWith('/sub') ? base : `${base}/sub`;
  const url = new URL(endpoint);

  // Merge user extra params first so core params stay authoritative unless intentionally extended
  if (options.extraParams?.trim()) {
    const cleaned = options.extraParams.trim().replace(/^[?&]+/, '');
    const extra = new URLSearchParams(cleaned);
    for (const [k, v] of extra.entries()) {
      url.searchParams.set(k, v);
    }
  }

  url.searchParams.set('target', options.target);
  url.searchParams.set('url', options.sourceUrl);

  if (options.configUrl) {
    url.searchParams.set('config', options.configUrl);
  }
  if (options.explain) {
    url.searchParams.set('explain', 'true');
  }

  return url.toString();
}

export function getClientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || '';
  }
  return c.req.header('x-real-ip') || c.req.header('cf-connecting-ip') || 'local';
}
