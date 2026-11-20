import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { getSettingValue, setSettingValue, type AppDatabase } from '../db/index.js';
import {
  clearSessionCookie,
  createAuthMiddleware,
  hashPassword,
  setSessionCookie,
  signSessionToken,
  verifyPassword,
  type AppVariables,
} from '../lib/auth.js';
import { changePasswordSchema, loginSchema } from '../../shared/types.js';

export function createAuthRoutes(appDb: AppDatabase) {
  const router = new Hono<{ Variables: AppVariables }>();
  const { requireAuth } = createAuthMiddleware(appDb);

  router.post('/login', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || '参数错误' }, 400);
    }

    const { username, password } = parsed.data;
    const userRow = appDb.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, username))
      .get();

    if (!userRow || !verifyPassword(password, userRow.passwordHash)) {
      return c.json({ error: '用户名或密码错误' }, 401);
    }

    if (!userRow.enabled) {
      return c.json({ error: '该账号已被管理员停用' }, 403);
    }

    const token = await signSessionToken(appDb, {
      uid: userRow.id,
      role: userRow.role,
    });
    setSessionCookie(c, token);

    const isDefaultAdminPassword =
      userRow.role === 'admin' &&
      getSettingValue(appDb.db, 'default_admin_pw_active', '0') === '1';

    return c.json({
      user: {
        id: userRow.id,
        username: userRow.username,
        role: userRow.role,
        subToken: userRow.subToken,
        enabled: userRow.enabled,
        isDefaultAdminPassword,
      },
    });
  });

  router.post('/logout', (c) => {
    clearSessionCookie(c);
    return c.json({ ok: true });
  });

  router.get('/me', requireAuth, (c) => {
    return c.json({ user: c.get('user') });
  });

  router.post('/password', requireAuth, async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || '参数错误' }, 400);
    }

    const currentUser = c.get('user');
    const userRow = appDb.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, currentUser.id))
      .get();

    if (!userRow || !verifyPassword(parsed.data.currentPassword, userRow.passwordHash)) {
      return c.json({ error: '当前密码不正确' }, 400);
    }

    appDb.db
      .update(schema.users)
      .set({
        passwordHash: hashPassword(parsed.data.newPassword),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.users.id, currentUser.id))
      .run();

    if (currentUser.role === 'admin') {
      setSettingValue(appDb.db, 'default_admin_pw_active', '0');
    }

    return c.json({ ok: true });
  });

  return router;
}
