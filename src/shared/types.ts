import { z } from 'zod';

export type UserRole = 'admin' | 'user';
export type FeedMode = 'direct' | 'proxy_raw';
export type DownloadSourceType = 'local' | 'external' | 'proxy' | 'github_release';
export type DownloadPlatform = 'iOS' | 'macOS' | 'Windows' | 'Android' | 'OpenWrt' | 'Linux';

export interface AuthUser {
  id: number;
  username: string;
  role: UserRole;
  subToken: string;
  enabled: boolean;
  isDefaultAdminPassword?: boolean;
}

export interface DownloadItemDTO {
  id: number;
  clientSlug: string;
  platform: DownloadPlatform;
  label: string;
  version: string;
  sourceType: DownloadSourceType;
  externalUrl: string | null;
  githubRepo: string | null;
  assetPattern: string | null;
  fileName: string | null;
  fileSize: number | null;
  downloadUrl: string;
  updatedAt: string;
}

export interface PortalClientDTO {
  slug: string;
  name: string;
  subtitle: string;
  importScheme: string;
  guideMarkdown: string;
  subscriptionUrl: string;
  oneClickUrl: string | null;
  downloads: DownloadItemDTO[];
}

export interface PortalOverviewDTO {
  siteTitle: string;
  user: AuthUser;
  hasSubscription: boolean;
  clients: PortalClientDTO[];
}

export interface AdminUserDTO {
  id: number;
  username: string;
  role: UserRole;
  subToken: string;
  subStoreUrl: string;
  note: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminClientDTO {
  slug: string;
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
  updatedAt: string;
}

export interface SystemSettingsDTO {
  siteTitle: string;
  subconverterUrl: string;
  publicBaseUrl: string;
  internalBaseUrl: string;
  githubToken: string;
}

export interface SubLogDTO {
  id: number;
  userId: number;
  username: string;
  clientSlug: string;
  ip: string;
  userAgent: string;
  statusCode: number;
  createdAt: string;
}

// ---------- Zod Validation Schemas ----------

export const loginSchema = z.object({
  username: z.string().trim().min(1, '请输入用户名').max(64),
  password: z.string().min(1, '请输入密码').max(128),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, '请输入当前密码'),
  newPassword: z.string().min(6, '新密码至少 6 位').max(128),
});

export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(2, '用户名至少 2 个字符')
    .max(64)
    .regex(/^[a-zA-Z0-9_.-]+$/, '用户名仅支持字母、数字、下划线、点或短横线'),
  password: z.string().min(6, '密码至少 6 位').max(128),
  role: z.enum(['admin', 'user']).default('user'),
  subStoreUrl: z.string().trim().max(2048).default(''),
  note: z.string().trim().max(255).default(''),
  enabled: z.boolean().default(true),
});

export const updateUserSchema = z.object({
  password: z.string().min(6, '密码至少 6 位').max(128).optional(),
  role: z.enum(['admin', 'user']).optional(),
  subStoreUrl: z.string().trim().max(2048).optional(),
  note: z.string().trim().max(255).optional(),
  enabled: z.boolean().optional(),
});

export const upsertClientSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .regex(/^[a-z0-9-]+$/, '标识仅支持小写字母、数字和短横线'),
  name: z.string().trim().min(1, '请输入名称').max(64),
  subtitle: z.string().trim().max(128).default(''),
  sortOrder: z.number().int().min(0).max(999).default(10),
  enabled: z.boolean().default(true),
  scTarget: z.string().trim().min(1, '请填写 SubConverter target').max(64),
  scExtraParams: z.string().trim().max(1024).default(''),
  feedMode: z.enum(['direct', 'proxy_raw']).default('direct'),
  templateContent: z.string().max(512 * 1024).default(''),
  importScheme: z.string().trim().max(512).default(''),
  guideMarkdown: z.string().max(64 * 1024).default(''),
});

export const createExternalDownloadSchema = z.object({
  clientSlug: z.string().trim().min(1),
  platform: z.enum(['iOS', 'macOS', 'Windows', 'Android', 'OpenWrt', 'Linux']),
  label: z.string().trim().min(1, '请输入下载项名称').max(128),
  version: z.string().trim().max(64).default(''),
  externalUrl: z.string().trim().url('请输入合法的链接地址'),
});

export const createProxyDownloadSchema = z.object({
  clientSlug: z.string().trim().min(1),
  platform: z.enum(['iOS', 'macOS', 'Windows', 'Android', 'OpenWrt', 'Linux']),
  label: z.string().trim().min(1, '请输入下载项名称').max(128),
  version: z.string().trim().max(64).default(''),
  externalUrl: z.string().trim().url('请输入合法的安装包直链地址'),
  fileName: z.string().trim().max(255).optional(),
});

export const createGithubDownloadSchema = z.object({
  clientSlug: z.string().trim().min(1),
  platform: z.enum(['iOS', 'macOS', 'Windows', 'Android', 'OpenWrt', 'Linux']),
  label: z.string().trim().min(1, '请输入下载项名称').max(128),
  githubRepo: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/, '仓库格式应为 owner/repo，例如 chen08209/FlClash'),
  assetPattern: z.string().trim().min(1, '请填写安装包文件名匹配关键词或通配符').max(255),
});

export const previewGithubReleaseSchema = z.object({
  githubRepo: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/, '仓库格式应为 owner/repo'),
  assetPattern: z.string().trim().max(255).default(''),
});

export const updateSettingsSchema = z.object({
  siteTitle: z.string().trim().min(1, '站点名称不能为空').max(64),
  subconverterUrl: z.string().trim().url('请输入合法的 SubConverter 地址'),
  publicBaseUrl: z.string().trim().max(512).default(''),
  internalBaseUrl: z.string().trim().max(512).default(''),
  githubToken: z.string().trim().max(512).default(''),
});
