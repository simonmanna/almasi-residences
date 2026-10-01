import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, LogIn } from 'lucide-react';
import { API_ORIGIN, get, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useBrandLogo } from '../lib/brand';
import { Alert, Button, Field, Input } from '../components/ui';

export function Login() {
  const { refresh } = useAuth();
  const logo = useBrandLogo();
  // A failed Google sign-in comes back as ?login_error=… — show it once, then tidy the address.
  const [error, setError] = useState<string | null>(() => new URLSearchParams(window.location.search).get('login_error'));
  const [busy, setBusy] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);
  const [google, setGoogle] = useState(false);

  useEffect(() => {
    if (window.location.search.includes('login_error')) window.history.replaceState(null, '', window.location.pathname);
    get<{ google: boolean }>('/admin/auth/providers').then((p) => setGoogle(p.google)).catch(() => setGoogle(false));
  }, []);

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
            {logo && <img className="brand-logo" src={logo} alt="" style={{ width: 56, height: 56, marginBottom: 14 }} />}
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
          {google && (
            <>
              <div className="login-or"><span>or</span></div>
              <a className="btn login-google" href={`${API_ORIGIN}/api/v1/admin/auth/google`}>
                <GoogleMark />
                Continue with Google
              </a>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
