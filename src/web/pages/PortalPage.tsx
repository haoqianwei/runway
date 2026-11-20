import React, { useEffect, useState } from 'react';
import {
  Download,
  ExternalLink,
  Copy,
  Check,
  QrCode,
  Settings,
  LogOut,
  KeyRound,
  Smartphone,
  Laptop,
  Router,
  ShieldAlert,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../lib/api';
import { cn, copyText, formatBytes } from '../lib/utils';
import { Badge, Button, Card, Modal, useToast } from '../components/ui/primitives';
import { ChangePasswordModal } from '../components/ChangePasswordModal';
import { RunwayLogo } from '../components/RunwayLogo';
import type {
  AuthUser,
  PortalClientDTO,
  PortalOverviewDTO,
} from '../../shared/types';

function getClientIcon(slug: string) {
  if (slug.includes('stash')) return Smartphone;
  if (slug.includes('openclash')) return Router;
  return Laptop;
}

export function PortalPage({
  user,
  onNavigateAdmin,
  onLogout,
  onUserUpdated,
}: {
  user: AuthUser;
  onNavigateAdmin: () => void;
  onLogout: () => void;
  onUserUpdated: () => void;
}) {
  const { toast } = useToast();
  const [overview, setOverview] = useState<PortalOverviewDTO | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string>('');
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [qrClient, setQrClient] = useState<PortalClientDTO | null>(null);
  const [qrMode, setQrMode] = useState<'oneclick' | 'raw'>('oneclick');
  const [pwOpen, setPwOpen] = useState(false);

  const loadOverview = async () => {
    try {
      const data = await api.portalOverview();
      setOverview(data);
      document.title = data.siteTitle;
      if (data.clients.length > 0 && !selectedSlug) {
        setSelectedSlug(data.clients[0].slug);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : '加载订阅信息失败', 'error');
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const activeClient =
    overview?.clients.find((c) => c.slug === selectedSlug) || overview?.clients[0] || null;

  const handleCopy = async (url: string, slug: string) => {
    const ok = await copyText(url);
    if (ok) {
      setCopiedSlug(slug);
      toast('订阅链接已复制');
      setTimeout(() => setCopiedSlug(null), 2000);
    } else {
      toast('复制失败，请手动选中复制', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <RunwayLogo className="h-9 w-9 rounded-xl shadow-sm" />
            <div>
              <div className="text-sm font-semibold text-slate-900">
                {overview?.siteTitle || 'Runway'}
              </div>
              <div className="text-xs text-slate-500">你好，{user.username}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {user.role === 'admin' && (
              <Button variant="outline" size="sm" onClick={onNavigateAdmin}>
                <Settings className="h-3.5 w-3.5" />
                管理后台
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setPwOpen(true)}>
              <KeyRound className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">改密码</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={onLogout}>
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">退出</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 pt-6 sm:px-6">
        {/* Security notice if default admin password is active */}
        {user.isDefaultAdminPassword && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
              <span>当前仍在使用默认管理员密码，建议立即修改以确保安全。</span>
            </div>
            <Button size="sm" variant="outline" onClick={() => setPwOpen(true)}>
              立即修改
            </Button>
          </div>
        )}

        {/* Notice only when account has no subscription configured yet */}
        {overview && !overview.hasSubscription && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span>
              当前账号暂未开通订阅，请联系管理员配置。
              {user.role === 'admin' && '（可前往「管理后台 → 用户管理」绑定订阅链接）'}
            </span>
          </div>
        )}

        {/* Client Selector */}
        {overview && overview.clients.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">选择你的设备 / 客户端</h2>
              <span className="text-xs text-slate-500">三步完成配置，无需手动写规则</span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {overview.clients.map((client) => {
                const Icon = getClientIcon(client.slug);
                const selected = activeClient?.slug === client.slug;
                return (
                  <button
                    key={client.slug}
                    type="button"
                    onClick={() => setSelectedSlug(client.slug)}
                    className={cn(
                      'flex items-start gap-3 rounded-2xl border p-4 text-left transition-all',
                      selected
                        ? 'border-slate-900 bg-slate-900 text-white shadow-md shadow-slate-900/10'
                        : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50/70',
                    )}
                  >
                    <div
                      className={cn(
                        'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                        selected ? 'bg-white/15 text-sky-300' : 'bg-slate-100 text-slate-700',
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold">{client.name}</div>
                      <div
                        className={cn(
                          'mt-0.5 text-xs leading-relaxed',
                          selected ? 'text-slate-300' : 'text-slate-500',
                        )}
                      >
                        {client.subtitle || '点击查看配置与导入方式'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Active Client Action Panel */}
        {activeClient && (
          <div className="space-y-4">
            {/* Step 1: Downloads */}
            <Card className="p-5 sm:p-6">
              <div className="mb-4 flex items-center gap-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                  1
                </span>
                <h3 className="text-sm font-semibold text-slate-900">
                  下载并安装 {activeClient.name}
                </h3>
                <span className="text-xs text-slate-400">已安装可跳过</span>
              </div>

              {activeClient.downloads.length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
                  暂未配置 {activeClient.name} 的下载链接，请自行安装或联系管理员上传安装包。
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {activeClient.downloads.map((dl) => (
                    <a
                      key={dl.id}
                      href={dl.downloadUrl}
                      target={dl.sourceType === 'external' ? '_blank' : undefined}
                      rel={dl.sourceType === 'external' ? 'noopener noreferrer' : undefined}
                      className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 transition hover:border-slate-300 hover:bg-white"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="info">{dl.platform}</Badge>
                          <span className="truncate text-sm font-medium text-slate-900">
                            {dl.label}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                          {dl.version && <span>{dl.version}</span>}
                          {dl.fileSize && <span>· {formatBytes(dl.fileSize)}</span>}
                          {dl.sourceType === 'local' && (
                            <span className="text-emerald-600">· 站内高速直连</span>
                          )}
                          {(dl.sourceType === 'proxy' || dl.sourceType === 'github_release') && (
                            <span className="text-emerald-600">· 站内代理直连</span>
                          )}
                        </div>
                      </div>
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-600 shadow-sm group-hover:bg-slate-900 group-hover:text-white transition">
                        {dl.sourceType === 'external' ? (
                          <ExternalLink className="h-4 w-4" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </Card>

            {/* Step 2: One-Click Import */}
            <Card className="p-5 sm:p-6">
              <div className="mb-4 flex items-center gap-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                  2
                </span>
                <h3 className="text-sm font-semibold text-slate-900">导入专属订阅配置</h3>
              </div>

              <div className="flex flex-wrap gap-3">
                {activeClient.oneClickUrl && (
                  <a
                    href={activeClient.oneClickUrl}
                    className={cn(
                      'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800',
                      !overview?.hasSubscription && 'pointer-events-none opacity-50',
                    )}
                  >
                    <Sparkles className="h-4 w-4 text-sky-400" />
                    一键导入到 {activeClient.name}
                  </a>
                )}

                <Button
                  variant={activeClient.oneClickUrl ? 'outline' : 'primary'}
                  size="lg"
                  disabled={!overview?.hasSubscription}
                  onClick={() => handleCopy(activeClient.subscriptionUrl, activeClient.slug)}
                >
                  {copiedSlug === activeClient.slug ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-500" />
                      已复制链接
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      复制订阅链接
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  size="lg"
                  disabled={!overview?.hasSubscription}
                  onClick={() => {
                    setQrClient(activeClient);
                    setQrMode(activeClient.oneClickUrl ? 'oneclick' : 'raw');
                  }}
                >
                  <QrCode className="h-4 w-4" />
                  扫码导入
                </Button>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50 px-3.5 py-2.5">
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  你的 {activeClient.name} 专属订阅地址（请勿外传）
                </div>
                <code className="block break-all font-mono text-xs text-slate-700 select-all">
                  {activeClient.subscriptionUrl}
                </code>
              </div>
            </Card>

            {/* Step 3: Guide */}
            {activeClient.guideMarkdown.trim() && (
              <Card className="p-5 sm:p-6">
                <div className="mb-3 flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                    3
                  </span>
                  <div className="flex items-center gap-1.5">
                    <BookOpen className="h-4 w-4 text-slate-500" />
                    <h3 className="text-sm font-semibold text-slate-900">使用步骤</h3>
                  </div>
                </div>
                <div className="space-y-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
                  {activeClient.guideMarkdown}
                </div>
              </Card>
            )}
          </div>
        )}
      </main>

      {/* QR Code Modal */}
      <Modal
        open={Boolean(qrClient)}
        onClose={() => setQrClient(null)}
        title={qrClient ? `${qrClient.name} 扫码导入` : ''}
        description="使用手机相机或客户端内置扫一扫即可导入"
        maxWidth="max-w-sm"
      >
        {qrClient && (
          <div className="flex flex-col items-center gap-4">
            {qrClient.oneClickUrl && (
              <div className="grid w-full grid-cols-2 rounded-xl bg-slate-100 p-1 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setQrMode('oneclick')}
                  className={cn(
                    'rounded-lg py-1.5 transition',
                    qrMode === 'oneclick'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700',
                  )}
                >
                  相机一键拉起
                </button>
                <button
                  type="button"
                  onClick={() => setQrMode('raw')}
                  className={cn(
                    'rounded-lg py-1.5 transition',
                    qrMode === 'raw'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700',
                  )}
                >
                  纯订阅链接
                </button>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <QRCodeSVG
                value={
                  qrMode === 'oneclick' && qrClient.oneClickUrl
                    ? qrClient.oneClickUrl
                    : qrClient.subscriptionUrl
                }
                size={220}
                level="M"
              />
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() =>
                handleCopy(
                  qrMode === 'oneclick' && qrClient.oneClickUrl
                    ? qrClient.oneClickUrl
                    : qrClient.subscriptionUrl,
                  qrClient.slug,
                )
              }
            >
              <Copy className="h-4 w-4" />
              复制二维码对应链接
            </Button>
          </div>
        )}
      </Modal>

      <ChangePasswordModal
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        onSuccess={onUserUpdated}
      />
    </div>
  );
}
