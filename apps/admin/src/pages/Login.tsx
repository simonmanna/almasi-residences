import { useState, type FormEvent } from 'react';
import { KeyRound, LogIn } from 'lucide-react';
import { post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Alert, Button, Field, Input } from '../components/ui';

export function Login() {
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await post('/admin/auth/login', {
        email: String(form.get('email')),
        password: String(form.get('password')),
        totp: String(form.get('totp') || '') || undefined,
      });
      await refresh();
    } catch (err) {
      const message = (err as Error).message;
      if (/authenticator/i.test(message)) setNeedsCode(true);
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-art">
        <div className="script">Luxury Living Redefined</div>
        <h2>The command centre for Almasi Residence</h2>
        <p>Floors, residences, prices, media and people — one place, and the website follows every change.</p>
      </div>
      <main className="login-panel">
        <div className="login-card">
          <div>
            <div className="brand-name" style={{ fontFamily: 'var(--display)', letterSpacing: '.32em', color: 'var(--sky-800)', fontWeight: 700 }}>ALMASI</div>
            <div className="muted small" style={{ letterSpacing: '.3em', marginTop: 4 }}>RESIDENCES · ADMIN</div>
          </div>
          <div>
            <h1>Sign in</h1>
            <p className="muted" style={{ margin: '6px 0 0' }}>Use the account your administrator gave you.</p>
          </div>
          <form onSubmit={submit}>
            <Field label="Email">
              <Input name="email" type="email" required autoComplete="username" autoFocus />
            </Field>
            <Field label="Password">
              <Input name="password" type="password" required autoComplete="current-password" />
            </Field>
            <Field label="Authenticator code" hint={needsCode ? 'Enter the six-digit code from your authenticator app.' : 'Only if your account uses two-factor sign-in.'}>
              <Input name="totp" inputMode="numeric" autoComplete="one-time-code" placeholder="123 456" />
            </Field>
            {error && <Alert tone="error" icon={<KeyRound size={18} />}>{error}</Alert>}
            <Button type="submit" variant="primary" busy={busy} icon={<LogIn size={17} />} style={{ height: 44 }}>
              {busy ? 'Checking' : 'Sign in'}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
