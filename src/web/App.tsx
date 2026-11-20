import React, { useEffect, useState } from 'react';
import { api } from './lib/api';
import { ToastProvider } from './components/ui/primitives';
import { LoginPage } from './pages/LoginPage';
import { PortalPage } from './pages/PortalPage';
import { AdminPage } from './pages/AdminPage';
import type { AuthUser } from '../shared/types';

function AppInner() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [view, setView] = useState<'portal' | 'admin'>(() =>
    window.location.pathname.startsWith('/admin') ? 'admin' : 'portal',
  );

  const syncSession = async () => {
    try {
      const res = await api.me();
      setUser(res.user);
      if (res.user.role !== 'admin' && view === 'admin') {
        navigate('portal');
      }
    } catch {
      setUser(null);
    } finally {
      setChecking(false);
    }
  };

  const navigate = (next: 'portal' | 'admin') => {
    setView(next);
    const targetPath = next === 'admin' ? '/admin' : '/';
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
  };

  useEffect(() => {
    syncSession();
    const onPopState = () => {
      setView(window.location.pathname.startsWith('/admin') ? 'admin' : 'portal');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleLogout = async () => {
    await api.logout().catch(() => undefined);
    setUser(null);
    navigate('portal');
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-400">
        正在加载...
      </div>
    );
  }

  if (!user) {
    return (
      <LoginPage
        onLogin={(loggedInUser) => {
          setUser(loggedInUser);
          if (loggedInUser.role !== 'admin') {
            navigate('portal');
          }
        }}
      />
    );
  }

  if (view === 'admin' && user.role === 'admin') {
    return (
      <AdminPage
        user={user}
        onBackPortal={() => navigate('portal')}
        onLogout={handleLogout}
        onUserUpdated={syncSession}
      />
    );
  }

  return (
    <PortalPage
      user={user}
      onNavigateAdmin={() => navigate('admin')}
      onLogout={handleLogout}
      onUserUpdated={syncSession}
    />
  );
}

export function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}
