import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Context, MiddlewareHandler } from 'hono';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { getSettingValue, type AppDatabase } from '../db/index.js';
import type { AuthUser } from '../../shared/types.js';

export const SESSION_COOKIE = 'runway_session';

export interface AppVariables {
  user: AuthUser;
}

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}

function getJwtKey(appDb: AppDatabase): Uint8Array {
  const secret = process.env.JWT_SECRET || getSettingValue(appDb.db, 'jwt_secret', 'fallback-secret');
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(
  appDb: AppDatabase,
  payload: { uid: number; role: 'admin' | 'user' },
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('14d')
    .sign(getJwtKey(appDb));
}

export async function verifySessionToken(
  appDb: AppDatabase,
  token: string,
): Promise<{ uid: number; role: 'admin' | 'user' } | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtKey(appDb));
    if (typeof payload.uid !== 'number') return null;
    const role = payload.role === 'admin' ? 'admin' : 'user';
    return { uid: payload.uid, role };
  } catch {
    return null;
  }
}

export function setSessionCookie(c: Context, token: string): void {
  const proto = c.req.header('x-forwarded-proto') || (c.req.url.startsWith('https://') ? 'https' : 'http');
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: proto === 'https',
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

export function createAuthMiddleware(
  appDb: AppDatabase,
): {
  requireAuth: MiddlewareHandler<{ Variables: AppVariables }>;
  requireAdmin: MiddlewareHandler<{ Variables: AppVariables }>;
} {
  const requireAuth: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (!token) {
      return c.json({ error: '请先登录' }, 401);
    }

    const decoded = await verifySessionToken(appDb, token);
    if (!decoded) {
      clearSessionCookie(c);
      return c.json({ error: '登录已过期，请重新登录' }, 401);
    }

    const userRow = appDb.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, decoded.uid))
      .get();

    if (!userRow || !userRow.enabled) {
      clearSessionCookie(c);
      return c.json({ error: '账号已被禁用或不存在' }, 401);
    }

    const isDefaultAdminPassword =
      userRow.role === 'admin' &&
      getSettingValue(appDb.db, 'default_admin_pw_active', '0') === '1';

    c.set('user', {
      id: userRow.id,
      username: userRow.username,
      role: userRow.role,
      subToken: userRow.subToken,
      enabled: userRow.enabled,
      isDefaultAdminPassword,
    });

    await next();
  };

  const requireAdmin: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
    const user = c.get('user');
    if (!user || user.role !== 'admin') {
      return c.json({ error: '仅管理员可访问此接口' }, 403);
    }
    await next();
  };

  return { requireAuth, requireAdmin };
}
