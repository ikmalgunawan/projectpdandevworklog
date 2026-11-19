import { useEffect, useState } from 'react';
import { apiFetch, getToken, setToken } from './lib/api';
import { User } from './types';
import LoginView from './components/LoginView';
import MobileApp from './components/MobileApp';
import MobileManagementApp from './components/MobileManagementApp';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setChecking(false);
      return;
    }
    apiFetch<{ user: User }>('/api/auth/me')
      .then((res) => setUser(res.user))
      .catch(() => {
        setToken(null);
        setUser(null);
      })
      .finally(() => setChecking(false));
  }, []);

  async function handleLogout() {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore network error on logout
    }
    setToken(null);
    setUser(null);
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-xs font-medium text-slate-500">
        Memuat PD &amp; ANDEV WORKLOG...
      </div>
    );
  }

  if (!user) {
    return <LoginView onLoginSuccess={setUser} />;
  }

  if (user.role === 'staff') {
    return <MobileApp user={user} onLogout={handleLogout} />;
  }

  return <MobileManagementApp user={user} onLogout={handleLogout} />;
}
