import React, { useEffect, useState } from 'react';
import {
  Users,
  FileCode2,
  Download,
  ScrollText,
  Settings,
  ArrowLeft,
  Plus,
  Trash2,
  RefreshCw,
  Copy,
  Edit3,
  Upload,
  ExternalLink,
  Play,
  CheckCircle2,
  LogOut,
  KeyRound,
} from 'lucide-react';
import { api } from '../lib/api';
import { cn, copyText, formatBytes, formatIsoDateTime } from '../lib/utils';
import {
  Badge,
  Button,
  Card,
  Input,
  Modal,
  Select,
  Switch,
  Textarea,
  useToast,
} from '../components/ui/primitives';
import { ChangePasswordModal } from '../components/ChangePasswordModal';
import { RunwayLogo } from '../components/RunwayLogo';
import type {
  AdminClientDTO,
  AdminUserDTO,
  AuthUser,
  DownloadItemDTO,
  DownloadPlatform,
  FeedMode,
  SubLogDTO,
  SystemSettingsDTO,
  UserRole,
} from '../../shared/types';

type AdminTab = 'users' | 'clients' | 'downloads' | 'logs' | 'settings';

const PLATFORMS: DownloadPlatform[] = ['iOS', 'macOS', 'Windows', 'Android', 'OpenWrt', 'Linux'];

export function AdminPage({
  user,
  onBackPortal,
  onLogout,
  onUserUpdated,
}: {
  user: AuthUser;
  onBackPortal: () => void;
  onLogout: () => void;
  onUserUpdated: () => void;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<AdminTab>('users');
  const [pwOpen, setPwOpen] = useState(false);

  // State across tabs
  const [users, setUsers] = useState<AdminUserDTO[]>([]);
  const [clients, setClients] = useState<AdminClientDTO[]>([]);
  const [downloads, setDownloads] = useState<DownloadItemDTO[]>([]);
  const [logs, setLogs] = useState<SubLogDTO[]>([]);
  const [settings, setSettings] = useState<SystemSettingsDTO>({
    siteTitle: 'Runway',
    subconverterUrl: '',
    publicBaseUrl: '',
    internalBaseUrl: '',
    githubToken: '',
  });

  // User modal state
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUserDTO | null>(null);
  const [userForm, setUserForm] = useState({
    username: '',
    password: '',
    role: 'user' as UserRole,
    subStoreUrl: '',
    note: '',
    enabled: true,
  });

  // Client editor state
  const [selectedClientSlug, setSelectedClientSlug] = useState<string>('');
  const [clientForm, setClientForm] = useState({
    slug: '',
    name: '',
    subtitle: '',
    sortOrder: 10,
    enabled: true,
    scTarget: 'clash',
    scExtraParams: '',
    feedMode: 'direct' as FeedMode,
    templateContent: '',
    importScheme: '',
    guideMarkdown: '',
  });
  const [isNewClient, setIsNewClient] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [testUserId, setTestUserId] = useState<string>('');
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    status: number;
    requestUrl: string;
    subscriptionUserinfo?: string | null;
    preview?: string;
    totalLength?: number;
    error?: string;
  } | null>(null);
  const [testingConvert, setTestingConvert] = useState(false);

  // Download form state
  const [dlMode, setDlMode] = useState<'github_release' | 'proxy' | 'local' | 'external'>(
    'github_release',
  );
  const [dlForm, setDlForm] = useState({
    clientSlug: 'flclash',
    platform: 'Windows' as DownloadPlatform,
    label: '',
    version: '',
    externalUrl: '',
    githubRepo: '',
    assetPattern: '',
  });
  const [dlFile, setDlFile] = useState<File | null>(null);
  const [uploadingDl, setUploadingDl] = useState(false);
  const [ghPreviewLoading, setGhPreviewLoading] = useState(false);
  const [ghPreview, setGhPreview] = useState<{
    tagName: string;
    matched: { name: string; size: number; downloadUrl: string } | null;
    assets: Array<{ name: string; size: number; downloadUrl: string }>;
  } | null>(null);

  // Settings state
  const [savingSettings, setSavingSettings] = useState(false);
  const [testingSc, setTestingSc] = useState(false);

  const loadAll = async () => {
    try {
      const [uRes, cRes, dRes, sRes] = await Promise.all([
        api.listUsers(),
        api.listClients(),
        api.listDownloads(),
        api.getSettings(),
      ]);
      setUsers(uRes.users);
      setClients(cRes.clients);
      setDownloads(dRes.downloads);
      setSettings(sRes.settings);

      if (cRes.clients.length > 0 && !selectedClientSlug) {
        selectClient(cRes.clients[0]);
      }
      const userWithSub = uRes.users.find((u) => u.subStoreUrl.trim());
      if (userWithSub && !testUserId) {
        setTestUserId(String(userWithSub.id));
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : '加载后台数据失败', 'error');
    }
  };

  const loadLogs = async () => {
    try {
      const res = await api.listLogs(150);
      setLogs(res.logs);
    } catch (err) {
      toast(err instanceof Error ? err.message : '加载日志失败', 'error');
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (tab === 'logs') {
      loadLogs();
    }
  }, [tab]);

  const selectClient = (c: AdminClientDTO) => {
    setIsNewClient(false);
    setSelectedClientSlug(c.slug);
    setTestResult(null);
    setClientForm({
      slug: c.slug,
      name: c.name,
      subtitle: c.subtitle,
      sortOrder: c.sortOrder,
      enabled: c.enabled,
      scTarget: c.scTarget,
      scExtraParams: c.scExtraParams,
      feedMode: c.feedMode,
      templateContent: c.templateContent,
      importScheme: c.importScheme,
      guideMarkdown: c.guideMarkdown,
    });
  };

  // ---------- User Handlers ----------

  const openCreateUser = () => {
    setEditingUser(null);
    setUserForm({
      username: '',
      password: '',
      role: 'user',
      subStoreUrl: '',
      note: '',
      enabled: true,
    });
    setUserModalOpen(true);
  };

  const openEditUser = (u: AdminUserDTO) => {
    setEditingUser(u);
    setUserForm({
      username: u.username,
      password: '',
      role: u.role,
      subStoreUrl: u.subStoreUrl,
      note: u.note,
      enabled: u.enabled,
    });
    setUserModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await api.updateUser(editingUser.id, {
          ...(userForm.password ? { password: userForm.password } : {}),
          role: userForm.role,
          subStoreUrl: userForm.subStoreUrl,
          note: userForm.note,
          enabled: userForm.enabled,
        });
        toast('用户信息已保存');
      } else {
        await api.createUser(userForm);
        toast('已创建账号');
      }
      setUserModalOpen(false);
      await loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : '保存失败', 'error');
    }
  };

  const handleResetToken = async (u: AdminUserDTO) => {
    if (!confirm(`确定重置「${u.username}」的订阅 Token？旧订阅链接会立即失效。`)) return;
    try {
      await api.resetUserToken(u.id);
      toast('订阅 Token 已重置');
      await loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : '重置失败', 'error');
    }
  };

  const handleDeleteUser = async (u: AdminUserDTO) => {
    if (!confirm(`确定删除账号「${u.username}」？此操作不可撤销。`)) return;
    try {
      await api.deleteUser(u.id);
      toast('账号已删除');
      await loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : '删除失败', 'error');
    }
  };

  // ---------- Client Handlers ----------

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingClient(true);
    try {
      const slug = clientForm.slug.trim().toLowerCase();
      const res = await api.upsertClient(slug, {
        name: clientForm.name,
        subtitle: clientForm.subtitle,
        sortOrder: Number(clientForm.sortOrder) || 10,
        enabled: clientForm.enabled,
        scTarget: clientForm.scTarget,
        scExtraParams: clientForm.scExtraParams,
        feedMode: clientForm.feedMode,
        templateContent: clientForm.templateContent,
        importScheme: clientForm.importScheme,
        guideMarkdown: clientForm.guideMarkdown,
      });
      toast(`已保存「${res.client.name}」配置与规则模板`);
      setIsNewClient(false);
      setSelectedClientSlug(res.client.slug);
      await loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : '保存失败', 'error');
    } finally {
      setSavingClient(false);
    }
  };

  const handleDeleteClient = async (slug: string) => {
    if (!confirm(`确定删除客户端「${slug}」？`)) return;
    try {
      await api.deleteClient(slug);
      toast('客户端已删除');
      setSelectedClientSlug('');
      await loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : '删除失败', 'error');
    }
  };

  const handleTestConvert = async (explain: boolean) => {
    if (!selectedClientSlug) return;
    setTestingConvert(true);
    setTestResult(null);
    try {
      const res = await api.testClientConvert(selectedClientSlug, {
        userId: testUserId ? Number(testUserId) : undefined,
        explain,
      });
      setTestResult(res);
    } catch (err) {
      toast(err instanceof Error ? err.message : '测试失败', 'error');
    } finally {
      setTestingConvert(false);
    }
  };

  // ---------- Download Handlers ----------

  const handlePreviewGithub = async () => {
    if (!dlForm.githubRepo.trim()) {
      toast('请先填写 GitHub 仓库（如 chen08209/FlClash）', 'error');
      return;
    }
    setGhPreviewLoading(true);
    setGhPreview(null);
    try {
      const res = await api.previewGithubRelease({
        githubRepo: dlForm.githubRepo.trim(),
        assetPattern: dlForm.assetPattern.trim(),
      });
      setGhPreview(res);
      if (res.matched) {
        toast(`匹配成功：${res.tagName} / ${res.matched.name}`);
      } else {
        toast(`已获取 ${res.tagName} 共 ${res.assets.length} 个文件，可点击下方文件名填入`);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : '获取 Release 失败', 'error');
    } finally {
      setGhPreviewLoading(false);
    }
  };

  const handleAddDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadingDl(true);
    try {
      if (dlMode === 'github_release') {
        await api.createGithubDownload({
          clientSlug: dlForm.clientSlug,
          platform: dlForm.platform,
          label: dlForm.label,
          githubRepo: dlForm.githubRepo,
          assetPattern: dlForm.assetPattern,
        });
        setGhPreview(null);
      } else if (dlMode === 'proxy') {
        await api.createProxyDownload({
          clientSlug: dlForm.clientSlug,
          platform: dlForm.platform,
          label: dlForm.label,
          version: dlForm.version,
          externalUrl: dlForm.externalUrl,
        });
      } else if (dlMode === 'local') {
        if (!dlFile) {
          toast('请先选择安装包文件', 'error');
          setUploadingDl(false);
          return;
        }
        await api.uploadLocalDownload({
          clientSlug: dlForm.clientSlug,
          platform: dlForm.platform,
          label: dlForm.label || dlFile.name,
          version: dlForm.version,
          file: dlFile,
        });
        setDlFile(null);
      } else {
        await api.createExternalDownload({
          clientSlug: dlForm.clientSlug,
          platform: dlForm.platform,
          label: dlForm.label,
          version: dlForm.version,
          externalUrl: dlForm.externalUrl,
        });
      }
      toast('下载项已添加');
      setDlForm((prev) => ({
        ...prev,
        label: '',
        version: '',
        externalUrl: '',
        assetPattern: '',
      }));
      await loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : '添加失败', 'error');
    } finally {
      setUploadingDl(false);
    }
  };

  const handleDeleteDownload = async (id: number) => {
    if (!confirm('确定删除此下载项？本地上传的安装包文件也会一并删除。')) return;
    try {
      await api.deleteDownload(id);
      toast('已删除');
      await loadAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : '删除失败', 'error');
    }
  };

  // ---------- Settings Handlers ----------

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await api.updateSettings(settings);
      setSettings(res.settings);
      toast('系统设置已保存');
    } catch (err) {
      toast(err instanceof Error ? err.message : '保存失败', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleTestSubconverter = async () => {
    setTestingSc(true);
    try {
      const res = await api.testSubconverter(settings.subconverterUrl);
      if (res.ok) {
        toast(`连接成功：${res.version || 'SubConverter 在线'}`);
      } else {
        toast(res.error || `连接失败 (${res.status})`, 'error');
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : '无法连接到 SubConverter', 'error');
    } finally {
      setTestingSc(false);
    }
  };

  const navItems: { id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'users', label: '用户管理', icon: Users },
    { id: 'clients', label: '客户端与规则模板', icon: FileCode2 },
    { id: 'downloads', label: '安装包管理', icon: Download },
    { id: 'logs', label: '拉取日志', icon: ScrollText },
    { id: 'settings', label: '系统设置', icon: Settings },
  ];

  const publicOrigin = (settings.publicBaseUrl || window.location.origin).replace(/\/+$/, '');

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <RunwayLogo className="h-9 w-9 rounded-xl shadow-sm" />
            <div>
              <div className="text-sm font-semibold text-slate-900">管理后台</div>
              <div className="text-xs text-slate-500">{settings.siteTitle}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onBackPortal}>
              <ArrowLeft className="h-3.5 w-3.5" />
              返回门户页
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPwOpen(true)}>
              <KeyRound className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onLogout}>
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        {/* Tab Bar */}
        <div className="mb-6 flex gap-1.5 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-sm">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition',
                  active
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* ==================== TAB 1: USERS ==================== */}
        {tab === 'users' && (
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
              <div>
                <h2 className="text-base font-semibold text-slate-900">用户账号与 Sub-Store 绑定</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  每个用户绑定独立的 Sub-Store 订阅源，对外仅暴露本站 Token 链接，不泄露上游地址
                </p>
              </div>
              <Button onClick={openCreateUser}>
                <Plus className="h-4 w-4" />
                新建用户
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/70 text-xs text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">用户名 / 备注</th>
                    <th className="px-5 py-3 font-medium">状态</th>
                    <th className="px-5 py-3 font-medium">Sub-Store 源链接</th>
                    <th className="px-5 py-3 font-medium">订阅 Token</th>
                    <th className="px-5 py-3 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">{u.username}</span>
                          {u.role === 'admin' && <Badge variant="info">管理员</Badge>}
                        </div>
                        {u.note && <div className="mt-0.5 text-xs text-slate-500">{u.note}</div>}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge variant={u.enabled ? 'success' : 'danger'}>
                          {u.enabled ? '已启用' : '已停用'}
                        </Badge>
                      </td>
                      <td className="max-w-xs px-5 py-3.5">
                        {u.subStoreUrl ? (
                          <code className="block truncate font-mono text-xs text-slate-600" title={u.subStoreUrl}>
                            {u.subStoreUrl}
                          </code>
                        ) : (
                          <span className="text-xs text-amber-600">未绑定</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <code className="font-mono text-xs text-slate-500">
                            {u.subToken.slice(0, 10)}…
                          </code>
                          <button
                            type="button"
                            title="复制 Stash 订阅链接"
                            onClick={async () => {
                              const slug = clients[0]?.slug || 'stash';
                              await copyText(`${publicOrigin}/s/${u.subToken}/${slug}`);
                              toast(`已复制 ${u.username} 的 ${slug} 订阅链接`);
                            }}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEditUser(u)}>
                            <Edit3 className="h-3.5 w-3.5" />
                            编辑
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="重置订阅 Token"
                            onClick={() => handleResetToken(u)}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                          {u.id !== user.id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                              onClick={() => handleDeleteUser(u)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* ==================== TAB 2: CLIENTS & TEMPLATES ==================== */}
        {tab === 'clients' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Client list */}
            <div className="space-y-2.5 lg:col-span-3">
              {clients.map((c) => (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => selectClient(c)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-2xl border px-4 py-3.5 text-left transition',
                    !isNewClient && selectedClientSlug === c.slug
                      ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300',
                  )}
                >
                  <div>
                    <div className="text-sm font-semibold">{c.name}</div>
                    <div
                      className={cn(
                        'mt-0.5 font-mono text-xs',
                        !isNewClient && selectedClientSlug === c.slug
                          ? 'text-slate-300'
                          : 'text-slate-400',
                      )}
                    >
                      /{c.slug} → target={c.scTarget}
                    </div>
                  </div>
                  {!c.enabled && <Badge variant="warning">禁用</Badge>}
                </button>
              ))}

              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setIsNewClient(true);
                  setSelectedClientSlug('');
                  setTestResult(null);
                  setClientForm({
                    slug: '',
                    name: '',
                    subtitle: '',
                    sortOrder: clients.length + 1,
                    enabled: true,
                    scTarget: 'clash',
                    scExtraParams: '',
                    feedMode: 'direct',
                    templateContent: '',
                    importScheme: '',
                    guideMarkdown: '',
                  });
                }}
              >
                <Plus className="h-4 w-4" />
                新增客户端类型
              </Button>
            </div>

            {/* Client template editor */}
            <div className="space-y-6 lg:col-span-9">
              <Card className="p-5 sm:p-6">
                <form onSubmit={handleSaveClient} className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">
                        {isNewClient ? '新增客户端' : `编辑 ${clientForm.name} 规则与参数`}
                      </h2>
                      <p className="mt-0.5 text-xs text-slate-500">
                        规则模板会通过内网安全链接作为 SubConverter-Extended 的 config= 参数下发
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                        <span>前端显示</span>
                        <Switch
                          checked={clientForm.enabled}
                          onChange={(checked) => setClientForm((f) => ({ ...f, enabled: checked }))}
                        />
                      </label>
                      {!isNewClient && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-rose-600 hover:bg-rose-50"
                          onClick={() => handleDeleteClient(clientForm.slug)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600">
                        路径标识 (slug)
                      </label>
                      <Input
                        value={clientForm.slug}
                        disabled={!isNewClient}
                        placeholder="如 stash / surge"
                        onChange={(e) => setClientForm((f) => ({ ...f, slug: e.target.value }))}
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600">
                        显示名称
                      </label>
                      <Input
                        value={clientForm.name}
                        placeholder="如 Stash"
                        onChange={(e) => setClientForm((f) => ({ ...f, name: e.target.value }))}
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600">
                        排序权重
                      </label>
                      <Input
                        type="number"
                        value={clientForm.sortOrder}
                        onChange={(e) =>
                          setClientForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600">
                      副标题说明（展示给用户，如适用设备）
                    </label>
                    <Input
                      value={clientForm.subtitle}
                      placeholder="如 iPhone / iPad / Mac 推荐客户端"
                      onChange={(e) => setClientForm((f) => ({ ...f, subtitle: e.target.value }))}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600">
                        SubConverter Target
                      </label>
                      <Input
                        value={clientForm.scTarget}
                        placeholder="stash / clash / surge"
                        onChange={(e) => setClientForm((f) => ({ ...f, scTarget: e.target.value }))}
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600">
                        源链接传递模式
                      </label>
                      <Select
                        value={clientForm.feedMode}
                        onChange={(e) =>
                          setClientForm((f) => ({ ...f, feedMode: e.target.value as FeedMode }))
                        }
                      >
                        <option value="direct">直传 Sub-Store 地址（内联推荐）</option>
                        <option value="proxy_raw">经本站 /raw 中转（防 proxy-providers 泄露）</option>
                      </Select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600">
                        额外查询参数（可选）
                      </label>
                      <Input
                        value={clientForm.scExtraParams}
                        placeholder="如 list=true&emoji=true"
                        onChange={(e) =>
                          setClientForm((f) => ({ ...f, scExtraParams: e.target.value }))
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600">
                      一键导入 URL Scheme（留空则仅显示复制订阅按钮，支持 {'{url}'} 和 {'{name}'}）
                    </label>
                    <Input
                      value={clientForm.importScheme}
                      placeholder="stash://install-config?url={url}&name={name}"
                      onChange={(e) =>
                        setClientForm((f) => ({ ...f, importScheme: e.target.value }))
                      }
                    />
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label className="text-xs font-medium text-slate-600">
                        SubConverter-Extended 规则模板（INI / YAML / TOML，留空则使用后端默认规则）
                      </label>
                      <span className="text-[11px] text-slate-400">
                        {clientForm.templateContent.length} 字符
                      </span>
                    </div>
                    <Textarea
                      rows={12}
                      className="bg-slate-950 font-mono text-xs leading-relaxed text-slate-100 placeholder:text-slate-500 focus:border-sky-500"
                      placeholder="; 在此粘贴 SubConverter-Extended 外部配置文件（INI/YAML/TOML）&#10;; 留空时请求不会携带 config= 参数，直接使用 SubConverter 默认配置"
                      value={clientForm.templateContent}
                      onChange={(e) =>
                        setClientForm((f) => ({ ...f, templateContent: e.target.value }))
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600">
                      展示给用户的使用步骤说明
                    </label>
                    <Textarea
                      rows={4}
                      value={clientForm.guideMarkdown}
                      onChange={(e) =>
                        setClientForm((f) => ({ ...f, guideMarkdown: e.target.value }))
                      }
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button type="submit" disabled={savingClient}>
                      {savingClient ? '保存中...' : '保存配置与模板'}
                    </Button>
                  </div>
                </form>
              </Card>

              {/* Live Conversion Test Card */}
              {!isNewClient && selectedClientSlug && (
                <Card className="p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">在线测试转换</h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        保存模板后，选一个已绑定 Sub-Store 的账号直接测试 SubConverter-Extended 输出
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        className="h-9 w-44"
                        value={testUserId}
                        onChange={(e) => setTestUserId(e.target.value)}
                      >
                        <option value="">选择测试用户</option>
                        {users
                          .filter((u) => u.subStoreUrl.trim())
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.username}
                            </option>
                          ))}
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={testingConvert}
                        onClick={() => handleTestConvert(false)}
                      >
                        <Play className="h-3.5 w-3.5" />
                        测试转换
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={testingConvert}
                        onClick={() => handleTestConvert(true)}
                      >
                        Explain 诊断
                      </Button>
                    </div>
                  </div>

                  {testResult && (
                    <div className="mt-4 space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant={testResult.ok ? 'success' : 'danger'}>
                          HTTP {testResult.status}
                        </Badge>
                        {testResult.totalLength !== undefined && (
                          <span className="text-slate-500">
                            总长度 {testResult.totalLength.toLocaleString()} 字节
                          </span>
                        )}
                        {testResult.subscriptionUserinfo && (
                          <span className="text-emerald-700">
                            流量头：{testResult.subscriptionUserinfo}
                          </span>
                        )}
                      </div>
                      <pre className="max-h-72 overflow-auto rounded-xl bg-slate-950 p-3.5 font-mono text-xs text-slate-200">
                        {testResult.error || testResult.preview || '(空响应)'}
                      </pre>
                    </div>
                  )}
                </Card>
              )}
            </div>
          </div>
        )}

        {/* ==================== TAB 3: DOWNLOADS ==================== */}
        {tab === 'downloads' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <Card className="p-5 lg:col-span-5">
              <h2 className="text-base font-semibold text-slate-900">添加安装包 / 下载链接</h2>
              <p className="mt-1 text-xs text-slate-500">
                推荐直接使用 GitHub 最新版代理或直链代理，不占服务器磁盘即可让用户通过本站高速直连下载；Stash 可填 App Store 外链
              </p>

              <div className="my-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-xs font-medium">
                {(
                  [
                    { id: 'github_release', label: 'GitHub 最新版代理' },
                    { id: 'proxy', label: '固定直链代理' },
                    { id: 'local', label: '上传本地文件' },
                    { id: 'external', label: '外部链接跳转' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setDlMode(m.id);
                      setGhPreview(null);
                    }}
                    className={cn(
                      'rounded-lg py-2 transition',
                      dlMode === m.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <form onSubmit={handleAddDownload} className="space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">所属客户端</label>
                    <Select
                      value={dlForm.clientSlug}
                      onChange={(e) => setDlForm((f) => ({ ...f, clientSlug: e.target.value }))}
                    >
                      {clients.map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">适用平台</label>
                    <Select
                      value={dlForm.platform}
                      onChange={(e) =>
                        setDlForm((f) => ({ ...f, platform: e.target.value as DownloadPlatform }))
                      }
                    >
                      {PLATFORMS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">显示名称</label>
                  <Input
                    value={dlForm.label}
                    placeholder="如 Windows x64 安装包 / Android APK"
                    onChange={(e) => setDlForm((f) => ({ ...f, label: e.target.value }))}
                    required
                  />
                </div>

                {dlMode === 'github_release' && (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        GitHub 仓库（owner/repo）
                      </label>
                      <Input
                        value={dlForm.githubRepo}
                        placeholder="如 chen08209/FlClash 或 vernesong/OpenClash"
                        onChange={(e) => setDlForm((f) => ({ ...f, githubRepo: e.target.value }))}
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        安装包文件名匹配（关键词或 * 通配符）
                      </label>
                      <div className="flex gap-2">
                        <Input
                          value={dlForm.assetPattern}
                          placeholder="如 windows-amd64-setup.exe 或 *arm64*.apk"
                          onChange={(e) =>
                            setDlForm((f) => ({ ...f, assetPattern: e.target.value }))
                          }
                          required
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-10 shrink-0"
                          disabled={ghPreviewLoading}
                          onClick={handlePreviewGithub}
                        >
                          {ghPreviewLoading ? '拉取中...' : '预览资产'}
                        </Button>
                      </div>
                    </div>

                    {ghPreview && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                        <div className="mb-1.5 flex items-center justify-between font-medium text-slate-700">
                          <span>最新版本：{ghPreview.tagName}</span>
                          {ghPreview.matched ? (
                            <Badge variant="success">已匹配</Badge>
                          ) : (
                            <Badge variant="warning">点击文件名填入</Badge>
                          )}
                        </div>
                        <div className="max-h-36 space-y-1 overflow-y-auto">
                          {ghPreview.assets.map((a) => (
                            <button
                              key={a.name}
                              type="button"
                              onClick={() =>
                                setDlForm((f) => ({
                                  ...f,
                                  assetPattern: a.name,
                                }))
                              }
                              className={cn(
                                'flex w-full items-center justify-between rounded-lg px-2 py-1 text-left transition',
                                ghPreview.matched?.name === a.name
                                  ? 'bg-emerald-100/80 text-emerald-900 font-medium'
                                  : 'hover:bg-white text-slate-600',
                              )}
                            >
                              <span className="truncate font-mono">{a.name}</span>
                              <span className="ml-2 shrink-0 text-slate-400">
                                {formatBytes(a.size)}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {dlMode !== 'github_release' && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      版本号（可选）
                    </label>
                    <Input
                      value={dlForm.version}
                      placeholder="如 v0.8.80"
                      onChange={(e) => setDlForm((f) => ({ ...f, version: e.target.value }))}
                    />
                  </div>
                )}

                {dlMode === 'local' && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      选择安装包文件（最大 500MB）
                    </label>
                    <input
                      type="file"
                      onChange={(e) => setDlFile(e.target.files?.[0] || null)}
                      className="block w-full rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-slate-800"
                    />
                  </div>
                )}

                {(dlMode === 'external' || dlMode === 'proxy') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      {dlMode === 'proxy' ? 'GitHub / 上游安装包直链（由本站流式代理）' : '外部跳转链接'}
                    </label>
                    <Input
                      type="url"
                      value={dlForm.externalUrl}
                      placeholder={
                        dlMode === 'proxy'
                          ? 'https://github.com/owner/repo/releases/download/...'
                          : 'https://apps.apple.com/...'
                      }
                      onChange={(e) => setDlForm((f) => ({ ...f, externalUrl: e.target.value }))}
                      required
                    />
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={uploadingDl}>
                  {dlMode === 'local' ? (
                    <>
                      <Upload className="h-4 w-4" />
                      {uploadingDl ? '上传中...' : '上传并保存'}
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      {uploadingDl ? '保存中...' : '保存下载项'}
                    </>
                  )}
                </Button>
              </form>
            </Card>

            <Card className="overflow-hidden lg:col-span-7">
              <div className="border-b border-slate-100 p-5">
                <h2 className="text-base font-semibold text-slate-900">已配置的下载项</h2>
              </div>
              {downloads.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400">暂无下载项</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {downloads.map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="neutral">{d.clientSlug}</Badge>
                          <Badge variant="info">{d.platform}</Badge>
                          <span className="text-sm font-medium text-slate-900">{d.label}</span>
                          {d.version && <span className="text-xs text-slate-400">{d.version}</span>}
                        </div>
                        <div className="mt-1 truncate text-xs text-slate-500">
                          {d.sourceType === 'local' &&
                            `本地托管 · ${d.fileName || ''} (${formatBytes(d.fileSize)})`}
                          {d.sourceType === 'github_release' &&
                            `GitHub 最新版代理 · ${d.githubRepo} [${d.assetPattern}]${d.fileSize ? ` (${formatBytes(d.fileSize)})` : ''}`}
                          {d.sourceType === 'proxy' && `直链代理 · ${d.externalUrl}`}
                          {d.sourceType === 'external' && `外部跳转 · ${d.externalUrl}`}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <a
                          href={d.downloadUrl}
                          target={d.sourceType === 'external' ? '_blank' : undefined}
                          rel={d.sourceType === 'external' ? 'noopener noreferrer' : undefined}
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          {d.sourceType === 'external' ? (
                            <ExternalLink className="h-4 w-4" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDeleteDownload(d.id)}
                          className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ==================== TAB 4: LOGS ==================== */}
        {tab === 'logs' && (
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
              <div>
                <h2 className="text-base font-semibold text-slate-900">订阅拉取审计日志</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  自动保留最近 1000 条记录，方便排查配置异常或识别订阅外传
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={loadLogs}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  刷新
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-rose-600 hover:bg-rose-50"
                  onClick={async () => {
                    if (!confirm('确定清空全部拉取日志？')) return;
                    await api.clearLogs();
                    setLogs([]);
                    toast('日志已清空');
                  }}
                >
                  清空
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50/70 text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">时间</th>
                    <th className="px-5 py-3 font-medium">用户</th>
                    <th className="px-5 py-3 font-medium">客户端</th>
                    <th className="px-5 py-3 font-medium">状态</th>
                    <th className="px-5 py-3 font-medium">来源 IP</th>
                    <th className="px-5 py-3 font-medium">User-Agent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                        暂无拉取记录
                      </td>
                    </tr>
                  ) : (
                    logs.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50/50">
                        <td className="whitespace-nowrap px-5 py-3 text-slate-500">
                          {formatIsoDateTime(l.createdAt)}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 font-medium text-slate-900">
                          {l.username}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3">
                          <Badge variant="neutral">{l.clientSlug}</Badge>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3">
                          <Badge variant={l.statusCode >= 200 && l.statusCode < 300 ? 'success' : 'danger'}>
                            {l.statusCode}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 font-mono text-slate-600">
                          {l.ip}
                        </td>
                        <td className="max-w-xs truncate px-5 py-3 text-slate-500" title={l.userAgent}>
                          {l.userAgent || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* ==================== TAB 5: SETTINGS ==================== */}
        {tab === 'settings' && (
          <Card className="max-w-2xl p-6">
            <h2 className="text-base font-semibold text-slate-900">系统与后端对接设置</h2>
            <p className="mt-1 text-xs text-slate-500">
              配置已部署的 SubConverter-Extended 地址以及门户内网/公网访问地址
            </p>

            <form onSubmit={handleSaveSettings} className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">站点名称</label>
                <Input
                  value={settings.siteTitle}
                  onChange={(e) => setSettings((s) => ({ ...s, siteTitle: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                  SubConverter-Extended 地址
                </label>
                <div className="flex gap-2">
                  <Input
                    value={settings.subconverterUrl}
                    placeholder="http://subconverter:25500 或 https://api.example.com"
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, subconverterUrl: e.target.value }))
                    }
                    required
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={testingSc}
                    onClick={handleTestSubconverter}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {testingSc ? '检测中...' : '连通性检测'}
                  </Button>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                  门户公网地址（给用户展示的一键导入与订阅域名，留空则自动识别当前访问域名）
                </label>
                <Input
                  value={settings.publicBaseUrl}
                  placeholder="https://sub.example.com"
                  onChange={(e) => setSettings((s) => ({ ...s, publicBaseUrl: e.target.value }))}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                  门户内网回调地址（供 SubConverter 拉取规则模板使用，同 Docker 网络填容器地址最快）
                </label>
                <Input
                  value={settings.internalBaseUrl}
                  placeholder="http://runway:3000"
                  onChange={(e) => setSettings((s) => ({ ...s, internalBaseUrl: e.target.value }))}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                  GitHub Personal Access Token（可选，用于提高 GitHub Release API 速率限制，防止 60 次/小时限流）
                </label>
                <Input
                  type="password"
                  value={settings.githubToken}
                  placeholder="github_pat_...（留空也可匿名访问公开仓库）"
                  onChange={(e) => setSettings((s) => ({ ...s, githubToken: e.target.value }))}
                />
              </div>

              <div className="pt-2">
                <Button type="submit" disabled={savingSettings}>
                  {savingSettings ? '保存中...' : '保存系统设置'}
                </Button>
              </div>
            </form>
          </Card>
        )}
      </main>

      {/* User Create/Edit Modal */}
      <Modal
        open={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        title={editingUser ? `编辑用户：${editingUser.username}` : '新建用户'}
      >
        <form onSubmit={handleSaveUser} className="space-y-4">
          {!editingUser && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">用户名</label>
              <Input
                value={userForm.username}
                placeholder="字母、数字或下划线"
                onChange={(e) => setUserForm((f) => ({ ...f, username: e.target.value }))}
                required
              />
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">
              {editingUser ? '重置密码（留空则保持原密码）' : '初始密码'}
            </label>
            <Input
              type="password"
              value={userForm.password}
              placeholder={editingUser ? '不修改请留空' : '至少 6 位'}
              onChange={(e) => setUserForm((f) => ({ ...f, password: e.target.value }))}
              required={!editingUser}
              minLength={userForm.password ? 6 : undefined}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">
              Sub-Store 订阅链接（完整 URL，用户完全不可见）
            </label>
            <Textarea
              rows={3}
              className="font-mono text-xs"
              placeholder="http://sub-store:3001/xxxx/download/collection/..."
              value={userForm.subStoreUrl}
              onChange={(e) => setUserForm((f) => ({ ...f, subStoreUrl: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">角色</label>
              <Select
                value={userForm.role}
                disabled={editingUser?.id === user.id}
                onChange={(e) => setUserForm((f) => ({ ...f, role: e.target.value as UserRole }))}
              >
                <option value="user">普通用户</option>
                <option value="admin">管理员</option>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">备注</label>
              <Input
                value={userForm.note}
                placeholder="如 小明"
                onChange={(e) => setUserForm((f) => ({ ...f, note: e.target.value }))}
              />
            </div>
          </div>

          {editingUser?.id !== user.id && (
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5">
              <span className="text-xs font-medium text-slate-700">允许登录及拉取订阅</span>
              <Switch
                checked={userForm.enabled}
                onChange={(checked) => setUserForm((f) => ({ ...f, enabled: checked }))}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setUserModalOpen(false)}>
              取消
            </Button>
            <Button type="submit">保存</Button>
          </div>
        </form>
      </Modal>

      <ChangePasswordModal
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        onSuccess={onUserUpdated}
      />
    </div>
  );
}
