import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'user'] }).notNull().default('user'),
  subToken: text('sub_token').notNull().unique(),
  subStoreUrl: text('sub_store_url').notNull().default(''),
  note: text('note').notNull().default(''),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const clients = sqliteTable('clients', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  subtitle: text('subtitle').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(10),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  scTarget: text('sc_target').notNull(),
  scExtraParams: text('sc_extra_params').notNull().default(''),
  feedMode: text('feed_mode', { enum: ['direct', 'proxy_raw'] }).notNull().default('direct'),
  templateContent: text('template_content').notNull().default(''),
  importScheme: text('import_scheme').notNull().default(''),
  guideMarkdown: text('guide_markdown').notNull().default(''),
  updatedAt: text('updated_at').notNull(),
});

export const downloads = sqliteTable('downloads', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clientSlug: text('client_slug').notNull(),
  platform: text('platform').notNull(),
  label: text('label').notNull(),
  version: text('version').notNull().default(''),
  sourceType: text('source_type', {
    enum: ['local', 'external', 'proxy', 'github_release'],
  }).notNull(),
  filePath: text('file_path'),
  fileName: text('file_name'),
  fileSize: integer('file_size'),
  externalUrl: text('external_url'),
  githubRepo: text('github_repo'),
  assetPattern: text('asset_pattern'),
  updatedAt: text('updated_at').notNull(),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const subLogs = sqliteTable('sub_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull(),
  username: text('username').notNull(),
  clientSlug: text('client_slug').notNull(),
  ip: text('ip').notNull().default(''),
  userAgent: text('user_agent').notNull().default(''),
  statusCode: integer('status_code').notNull(),
  createdAt: text('created_at').notNull(),
});
