import { useState } from 'react';
import { api, type AdminUser } from '../api';

export function Login({ onSignedIn }: { onSignedIn: (user: AdminUser) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.login(
        String(form.get('email')),
        String(form.get('password')),
        String(form.get('totp') || '') || undefined,
      );
      onSignedIn(user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell login">
      <h1>Sales admin</h1>
      <form onSubmit={submit}>
        <label>
          Email
          <input name="email" type="email" required autoComplete="username" />
        </label>
        <label>
          Password
          <input name="password" type="password" required autoComplete="current-password" />
        </label>
        <label>
          Authenticator code
          <input name="totp" inputMode="numeric" autoComplete="one-time-code" />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? 'Checking' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
