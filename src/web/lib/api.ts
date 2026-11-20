import type {
  AdminClientDTO,
  AdminUserDTO,
  AuthUser,
  DownloadItemDTO,
  DownloadPlatform,
  FeedMode,
  PortalOverviewDTO,
  SubLogDTO,
  SystemSettingsDTO,
  UserRole,
} from '../../shared/types';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers || {}),
    },
  });

  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new ApiError(data.error || `请求失败 (${res.status})`, res.status);
  }
  return data;
}

export const api = {
  // Auth
  login: (username: string, password: string) =>
    request<{ user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () =>
    request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  me: () => request<{ user: AuthUser }>('/api/auth/me'),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  // Portal
  portalOverview: () => request<PortalOverviewDTO>('/api/portal/overview'),

  // Admin: Users
  listUsers: () => request<{ users: AdminUserDTO[] }>('/api/admin/users'),
  createUser: (payload: {
    username: string;
    password: string;
    role: UserRole;
    subStoreUrl: string;
    note: string;
    enabled: boolean;
  }) =>
    request<{ user: AdminUserDTO }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateUser: (
    id: number,
    payload: {
      password?: string;
      role?: UserRole;
      subStoreUrl?: string;
      note?: string;
      enabled?: boolean;
    },
  ) =>
    request<{ user: AdminUserDTO }>(`/api/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  resetUserToken: (id: number) =>
    request<{ user: AdminUserDTO }>(`/api/admin/users/${id}/reset-token`, {
      method: 'POST',
    }),
  deleteUser: (id: number) =>
    request<{ ok: boolean }>(`/api/admin/users/${id}`, { method: 'DELETE' }),

  // Admin: Clients & Templates
  listClients: () => request<{ clients: AdminClientDTO[] }>('/api/admin/clients'),
  upsertClient: (
    slug: string,
    payload: {
      name: string;
      subtitle: string;
      sortOrder: number;
      enabled: boolean;
      scTarget: string;
      scExtraParams: string;
      feedMode: FeedMode;
      templateContent: string;
      importScheme: string;
      guideMarkdown: string;
    },
  ) =>
    request<{ client: AdminClientDTO }>(`/api/admin/clients/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteClient: (slug: string) =>
    request<{ ok: boolean }>(`/api/admin/clients/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
    }),
  testClientConvert: (slug: string, payload: { userId?: number; explain?: boolean }) =>
    request<{
      ok: boolean;
      status: number;
      requestUrl: string;
      subscriptionUserinfo?: string | null;
      preview?: string;
      totalLength?: number;
      error?: string;
    }>(`/api/admin/clients/${encodeURIComponent(slug)}/test`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Admin: Downloads
  listDownloads: () => request<{ downloads: DownloadItemDTO[] }>('/api/admin/downloads'),
  createExternalDownload: (payload: {
    clientSlug: string;
    platform: DownloadPlatform;
    label: string;
    version: string;
    externalUrl: string;
  }) =>
    request<{ download: DownloadItemDTO }>('/api/admin/downloads/external', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  createProxyDownload: (payload: {
    clientSlug: string;
    platform: DownloadPlatform;
    label: string;
    version: string;
    externalUrl: string;
    fileName?: string;
  }) =>
    request<{ download: DownloadItemDTO }>('/api/admin/downloads/proxy', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  createGithubDownload: (payload: {
    clientSlug: string;
    platform: DownloadPlatform;
    label: string;
    githubRepo: string;
    assetPattern: string;
  }) =>
    request<{ download: DownloadItemDTO }>('/api/admin/downloads/github', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  previewGithubRelease: (payload: { githubRepo: string; assetPattern: string }) =>
    request<{
      tagName: string;
      matched: { name: string; size: number; downloadUrl: string } | null;
      assets: Array<{ name: string; size: number; downloadUrl: string }>;
    }>('/api/admin/downloads/github/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  uploadLocalDownload: (payload: {
    clientSlug: string;
    platform: DownloadPlatform;
    label: string;
    version: string;
    file: File;
  }) => {
    const fd = new FormData();
    fd.append('clientSlug', payload.clientSlug);
    fd.append('platform', payload.platform);
    fd.append('label', payload.label);
    fd.append('version', payload.version);
    fd.append('file', payload.file);
    return request<{ download: DownloadItemDTO }>('/api/admin/downloads/upload', {
      method: 'POST',
      body: fd,
    });
  },
  deleteDownload: (id: number) =>
    request<{ ok: boolean }>(`/api/admin/downloads/${id}`, { method: 'DELETE' }),

  // Admin: Settings
  getSettings: () => request<{ settings: SystemSettingsDTO }>('/api/admin/settings'),
  updateSettings: (payload: SystemSettingsDTO) =>
    request<{ settings: SystemSettingsDTO }>('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  testSubconverter: (url?: string) =>
    request<{ ok: boolean; status: number; version?: string; error?: string }>(
      '/api/admin/settings/test-subconverter',
      {
        method: 'POST',
        body: JSON.stringify({ url }),
      },
    ),

  // Admin: Logs
  listLogs: (limit = 100) => request<{ logs: SubLogDTO[] }>(`/api/admin/logs?limit=${limit}`),
  clearLogs: () => request<{ ok: boolean }>('/api/admin/logs', { method: 'DELETE' }),
};
