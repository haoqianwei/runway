import React, { useState } from 'react';
import { Lock, User } from 'lucide-react';
import { api } from '../lib/api';
import { Button, Card, Input, useToast } from '../components/ui/primitives';
import { RunwayLogo } from '../components/RunwayLogo';
import type { AuthUser } from '../../shared/types';

export function LoginPage({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const { toast } = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.login(username.trim(), password);
      onLogin(res.user);
    } catch (err) {
      toast(err instanceof Error ? err.message : '登录失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-50 via-white to-slate-100 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <RunwayLogo className="mb-4 h-14 w-14 shadow-lg shadow-slate-900/15 rounded-2xl" />
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Runway</h1>
          <p className="mt-1.5 text-sm text-slate-500">请使用分配给你的账号和密码登录</p>
        </div>

        <Card className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">用户名</label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-10"
                  placeholder="输入用户名"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">密码</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="password"
                  className="pl-10"
                  placeholder="输入密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? '正在登录...' : '登录'}
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-xs text-slate-400">
          忘记密码或链接异常？请联系管理员重置
        </p>
      </div>
    </div>
  );
}
