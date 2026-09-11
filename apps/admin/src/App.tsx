import { useCallback, useEffect, useState } from 'react';
import { api, AdminApiError, type AdminUser } from './api';
import { Login } from './pages/Login';
import { Units } from './pages/Units';
import { Enquiries } from './pages/Enquiries';
import { Dashboard } from './pages/Dashboard';

type Tab = 'dashboard' | 'units' | 'enquiries';

/**
 * §9 Phase 1 task 2 — the sales console: unit status, enquiry inbox, CSV
 * export. Deliberately small (DECISIONS D-19): the whole app is three screens
 * over an API that already enforces every rule.
 */
export function App() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<Tab>('dashboard');

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch((e: unknown) => {
        if (!(e instanceof AdminApiError && e.status === 401)) console.error(e);
      })
      .finally(() => setChecking(false));
  }, []);

  const signOut = useCallback(() => {
    void api.logout().finally(() => setUser(null));
  }, []);

  if (checking) return <main className="shell">Checking your session…</main>;
  if (!user) return <Login onSignedIn={setUser} />;

  return (
    <div className="shell">
      <header className="bar">
        <h1>Kivu Ridge — sales</h1>
        <nav>
          {(['dashboard', 'units', 'enquiries'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-current={tab === t ? 'page' : undefined}
            >
              {t[0]!.toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
        <span className="who">
          {user.name} ({user.role.toLowerCase()})
          <button type="button" onClick={signOut}>
            Sign out
          </button>
        </span>
      </header>

      {tab === 'dashboard' && <Dashboard />}
      {tab === 'units' && <Units />}
      {tab === 'enquiries' && <Enquiries role={user.role} />}
    </div>
  );
}
