import { useState } from 'react';
import { Copy, ShieldCheck, ShieldOff, SmartphoneNfc } from 'lucide-react';
import { post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from './Toast';
import { Alert, Badge, Button, Card, CardHead, Field, Input, useConfirm } from './ui';

/**
 * Two-factor enrolment, in the admin rather than over SSH.
 *
 * Production refuses a sign-in without an authenticator, so before this screen
 * existed an account could only become usable by running a script on the
 * server, and losing a phone meant editing the database by hand.
 *
 * The recovery codes are shown exactly once. They are stored hashed and each
 * one works a single time, in place of the six-digit code.
 */
export function TwoFactor() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!user) return null;

  const start = async () => {
    setBusy(true);
    setErr(null);
    try {
      setSetup(await post<{ secret: string; uri: string }>('/admin/me/totp/start'));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await post<{ recoveryCodes: string[] }>('/admin/me/totp/confirm', { code: code.trim() });
      setCodes(res.recoveryCodes);
      setSetup(null);
      setCode('');
      await refresh();
      toast.success('Two-factor sign-in is on. Save your recovery codes.');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    const password = window.prompt('Enter your password to turn off two-factor sign-in.');
    if (!password) return;
    if (!(await confirm({ title: 'Turn off two-factor sign-in?', body: 'Your account will be protected by its password alone.', confirm: 'Turn it off', danger: true }))) return;
    setBusy(true);
    try {
      await post('/admin/me/totp/disable', { password });
      await refresh();
      toast.success('Two-factor sign-in is off.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied.`);
    } catch {
      toast.error('Could not copy. Select the text and copy it by hand.');
    }
  };

  return (
    <Card>
      <CardHead title="Two-factor sign-in" icon={<ShieldCheck size={18} />}>
        {user.twoFactor ? <Badge tone="green" plain>On</Badge> : <Badge tone="grey" plain>Off</Badge>}
      </CardHead>
      <div className="card-body stack">
        {codes && (
          <Alert tone="warn">
            <div className="stack-sm">
              <strong>Save these recovery codes now. They are not shown again.</strong>
              <p className="small" style={{ margin: 0 }}>
                Each one signs you in once if you lose your phone. Keep them somewhere separate from it.
              </p>
              <ul className="recovery-codes">
                {codes.map((c) => <li key={c}>{c}</li>)}
              </ul>
              <div className="row" style={{ gap: 8 }}>
                <Button size="sm" icon={<Copy size={14} />} onClick={() => void copy(codes.join(String.fromCharCode(10)), 'Recovery codes')}>Copy all</Button>
                <Button size="sm" variant="ghost" onClick={() => setCodes(null)}>I have saved them</Button>
              </div>
            </div>
          </Alert>
        )}

        {!user.twoFactor && !setup && !codes && (
          <>
            <p className="muted small" style={{ margin: 0 }}>
              An authenticator app generates a six-digit code that changes every thirty seconds. It is
              required to sign in on the live site.
            </p>
            <Button variant="primary" icon={<SmartphoneNfc size={16} />} busy={busy} onClick={() => void start()} style={{ justifySelf: 'start' }}>
              Set up two-factor sign-in
            </Button>
          </>
        )}

        {setup && (
          <div className="stack">
            <p className="small" style={{ margin: 0 }}>
              Add this to your authenticator app, then enter the code it shows.
            </p>
            <Field label="Setup key" hint="Paste this into the app, or open the link below on the phone itself.">
              <div className="row" style={{ gap: 8 }}>
                <Input readOnly value={setup.secret} onFocus={(e) => e.currentTarget.select()} />
                <Button size="sm" icon={<Copy size={14} />} aria-label="Copy the setup key" onClick={() => void copy(setup.secret, 'Setup key')} />
              </div>
            </Field>
            <a className="small" href={setup.uri}>Open in an authenticator app on this device</a>
            <Field label="Code from the app">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={10}
              />
            </Field>
            {err && <Alert tone="error">{err}</Alert>}
            <div className="row" style={{ gap: 8 }}>
              <Button variant="primary" busy={busy} disabled={code.trim().length < 6} onClick={() => void confirmCode()}>Turn it on</Button>
              <Button variant="ghost" onClick={() => { setSetup(null); setErr(null); }}>Cancel</Button>
            </div>
          </div>
        )}

        {user.twoFactor && (
          <>
            <p className="muted small" style={{ margin: 0 }}>
              {user.recoveryCodesLeft} recovery {user.recoveryCodesLeft === 1 ? 'code' : 'codes'} left. If you
              lose your phone and run out, a super admin can reset this for you.
            </p>
            <Button variant="ghost" icon={<ShieldOff size={16} />} busy={busy} onClick={() => void disable()} style={{ justifySelf: 'start' }}>
              Turn off two-factor sign-in
            </Button>
          </>
        )}

        {err && !setup && <Alert tone="error">{err}</Alert>}
      </div>
    </Card>
  );
}
