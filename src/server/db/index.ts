import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import * as schema from './schema.js';
import {
  createNodeSqliteDrizzle,
  type NodeSQLiteDatabase,
} from './node-sqlite-driver.js';
import type { SystemSettingsDTO } from '../../shared/types.js';

export interface AppDatabase {
  sqlite: DatabaseSync;
  db: NodeSQLiteDatabase<typeof schema>;
  dataDir: string;
  downloadsDir: string;
}

const DEFAULT_CLIENTS = [
  {
    slug: 'stash',
    name: 'Stash',
    subtitle: 'iPhone / iPad / Mac 推荐客户端',
    sortOrder: 1,
    enabled: true,
    scTarget: 'stash',
    scExtraParams: '',
    feedMode: 'direct' as const,
    templateContent: '',
    importScheme: 'stash://install-config?url={url}&name={name}',
    guideMarkdown: [
      '1. 先在 App Store（非国区 Apple ID）安装 Stash。',
      '2. 点击上方「一键导入到 Stash」，系统会自动拉起 App 并下载配置。',
      '3. 在 Stash 首页点击「启动」开关即可使用，后续节点更新只需在配置文件页下拉刷新。',
    ].join('\n'),
  },
  {
    slug: 'flclash',
    name: 'FlClash',
    subtitle: 'Windows / macOS / Android 免费全平台客户端',
    sortOrder: 2,
    enabled: true,
    scTarget: 'clash',
    scExtraParams: '',
    feedMode: 'direct' as const,
    templateContent: '',
    importScheme: 'clash://install-config?url={url}&name={name}',
    guideMarkdown: [
      '1. 点击上方对应系统按钮，直接下载安装 FlClash。',
      '2. 安装完成后点击「一键导入到 FlClash」（或复制订阅链接到「配置」→「+」→「URL 导入」）。',
      '3. 选中刚导入的配置，回到仪表盘开启「系统代理」或「TUN 虚拟网卡」即可。',
    ].join('\n'),
  },
  {
    slug: 'openclash',
    name: 'OpenClash',
    subtitle: 'OpenWrt 软路由透明代理插件',
    sortOrder: 3,
    enabled: true,
    scTarget: 'clash',
    scExtraParams: '',
    feedMode: 'direct' as const,
    templateContent: '',
    importScheme: '',
    guideMarkdown: [
      '1. 点击上方「复制订阅链接」。',
      '2. 登录路由器后台，进入「服务」→「OpenClash」→「配置订阅」→ 点击「添加」。',
      '3. 粘贴订阅链接，建议关闭「在线订阅转换」（本平台已自动完成转换），保存后点击「更新配置」并启动。',
    ].join('\n'),
  },
];

export function generateToken(bytes = 16): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function initDatabase(dataDirInput?: string): AppDatabase {
  const dataDir = path.resolve(dataDirInput || process.env.DATA_DIR || './data');
  const downloadsDir = path.join(dataDir, 'downloads');
  fs.mkdirSync(downloadsDir, { recursive: true });

  const dbPath = path.join(dataDir, 'portal.db');
  const sqlite = new DatabaseSync(dbPath);
  sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      sub_token TEXT NOT NULL UNIQUE,
      sub_store_url TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clients (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subtitle TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 10,
      enabled INTEGER NOT NULL DEFAULT 1,
      sc_target TEXT NOT NULL,
      sc_extra_params TEXT NOT NULL DEFAULT '',
      feed_mode TEXT NOT NULL DEFAULT 'direct',
      template_content TEXT NOT NULL DEFAULT '',
      import_scheme TEXT NOT NULL DEFAULT '',
      guide_markdown TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS downloads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_slug TEXT NOT NULL,
      platform TEXT NOT NULL,
      label TEXT NOT NULL,
      version TEXT NOT NULL DEFAULT '',
      source_type TEXT NOT NULL,
      file_path TEXT,
      file_name TEXT,
      file_size INTEGER,
      external_url TEXT,
      github_repo TEXT,
      asset_pattern TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sub_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      client_slug TEXT NOT NULL,
      ip TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      status_code INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sub_logs_created_at ON sub_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_downloads_client_slug ON downloads(client_slug);
  `);

  const db = createNodeSqliteDrizzle(sqlite, schema);
  const now = new Date().toISOString();

  // Safe migration for existing databases missing GitHub proxy columns
  const dlCols = sqlite.prepare('PRAGMA table_info(downloads)').all() as Array<{ name: string }>;
  const dlColNames = new Set(dlCols.map((c) => c.name));
  if (!dlColNames.has('github_repo')) {
    sqlite.exec('ALTER TABLE downloads ADD COLUMN github_repo TEXT');
  }
  if (!dlColNames.has('asset_pattern')) {
    sqlite.exec('ALTER TABLE downloads ADD COLUMN asset_pattern TEXT');
  }

  // Seed default settings if missing
  const defaultSettings: Record<string, string> = {
    site_title: process.env.SITE_TITLE || 'Runway',
    subconverter_url: process.env.SUBCONVERTER_URL || 'http://subconverter:25500',
    public_base_url: process.env.PUBLIC_BASE_URL || '',
    internal_base_url: process.env.INTERNAL_BASE_URL || 'http://runway:3000',
    github_token: process.env.GITHUB_TOKEN || '',
    jwt_secret: process.env.JWT_SECRET || generateToken(32),
    internal_secret: process.env.INTERNAL_SECRET || generateToken(24),
  };

  for (const [key, value] of Object.entries(defaultSettings)) {
    const existing = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
    if (!existing) {
      db.insert(schema.settings).values({ key, value }).run();
    }
  }

  // Seed initial admin user if no admin exists
  const existingAdmin = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.role, 'admin'))
    .get();

  if (!existingAdmin) {
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'changeme123';
    const passwordHash = bcrypt.hashSync(adminPassword, 10);

    db.insert(schema.users)
      .values({
        username: adminUsername,
        passwordHash,
        role: 'admin',
        subToken: generateToken(16),
        subStoreUrl: '',
        note: '默认管理员',
        enabled: true,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    if (adminPassword === 'changeme123') {
      db.insert(schema.settings)
        .values({ key: 'default_admin_pw_active', value: '1' })
        .onConflictDoUpdate({
          target: schema.settings.key,
          set: { value: '1' },
        })
        .run();
    }
  }

  // Seed default clients if table is empty
  const existingClient = db.select().from(schema.clients).get();
  if (!existingClient) {
    for (const item of DEFAULT_CLIENTS) {
      db.insert(schema.clients)
        .values({
          ...item,
          updatedAt: now,
        })
        .run();
    }

    // Seed App Store download link for Stash out of the box
    db.insert(schema.downloads)
      .values({
        clientSlug: 'stash',
        platform: 'iOS',
        label: 'App Store 官方下载',
        version: 'App Store',
        sourceType: 'external',
        externalUrl: 'https://apps.apple.com/app/stash-rule-based-proxy/id1596063349',
        updatedAt: now,
      })
      .run();
  }

  return { sqlite, db, dataDir, downloadsDir };
}

export function getSettingValue(
  db: NodeSQLiteDatabase<typeof schema>,
  key: string,
  fallback = '',
): string {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
  return row ? row.value : fallback;
}

export function setSettingValue(
  db: NodeSQLiteDatabase<typeof schema>,
  key: string,
  value: string,
): void {
  db.insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value },
    })
    .run();
}

export function getSystemSettings(db: NodeSQLiteDatabase<typeof schema>): SystemSettingsDTO {
  return {
    siteTitle: getSettingValue(db, 'site_title', 'Runway'),
    subconverterUrl: getSettingValue(db, 'subconverter_url', 'http://subconverter:25500'),
    publicBaseUrl: getSettingValue(db, 'public_base_url', ''),
    internalBaseUrl: getSettingValue(db, 'internal_base_url', ''),
    githubToken: getSettingValue(db, 'github_token', ''),
  };
}
