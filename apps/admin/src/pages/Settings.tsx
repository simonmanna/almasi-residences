import { useState, type FormEvent } from 'react';
import { Check, Globe, KeyRound, ShieldCheck, User } from 'lucide-react';
import { PERMISSION_LABEL, ROLE_DESCRIPTION, ROLE_LABEL, type AdminRole } from '@avida/types';
import { API_ORIGIN, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { dateTime } from '../lib/format';
import { useToast } from '../components/Toast';
import { TwoFactor } from '../components/TwoFactor';
import { Alert, Badge, Button, Card, CardHead, Field, Input, KV, PageHead } from '../components/ui';

const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined) || 'http://localhost:3000';

/** Your account, your password, and where the platform points. */
export default function Settings() {
  const { user } = useAuth();
  const toast = useToast();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  const change = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const next = String(form.get('next'));
    if (next !== String(form.get('confirm'))) return setErr('The two new passwords do not match.');
    setBusy(true);
    setErr(null);
    try {
      await post('/admin/me/password', { current: String(form.get('current')), next });
      toast.success('Password changed.');
      e.currentTarget.reset();
    } catch (error) {
      setErr((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title="Settings" />
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Card>
          <CardHead title="Your account" icon={<User size={18} />} />
          <div className="card-body stack">
            <KV items={[
              ['Name', user.name],
              ['Email', user.email],
              ['Role', <Badge tone="sky" plain>{ROLE_LABEL[user.role as AdminRole] ?? user.role}</Badge>],
              ['Last sign-in', dateTime(user.lastLoginAt)],
              ['Two-factor sign-in', user.twoFactor ? <Badge tone="green" plain>Enrolled</Badge> : <Badge tone="grey" plain>Not set up</Badge>],
            ]} />
            <p className="muted small" style={{ margin: 0 }}>{ROLE_DESCRIPTION[user.role as AdminRole]}</p>
          </div>
        </Card>
        <Card>
          <CardHead title="Change password" icon={<KeyRound size={18} />} />
          <form className="card-body stack" onSubmit={change} id="password">
            <Field label="Current password"><Input name="current" type="password" required autoComplete="current-password" /></Field>
            <Field label="New password" hint="At least 12 characters."><Input name="next" type="password" required minLength={12} autoComplete="new-password" /></Field>
            <Field label="New password again"><Input name="confirm" type="password" required minLength={12} autoComplete="new-password" /></Field>
            {err && <Alert tone="error">{err}</Alert>}
            <Button type="submit" variant="primary" busy={busy} style={{ justifySelf: 'start' }}>Change password</Button>
          </form>
        </Card>
        <TwoFactor />
        <Card>
          <CardHead title="What you can do" icon={<ShieldCheck size={18} />} />
          <div className="card-body stack-sm">
            {user.permissions.length === 0 && <p className="muted small">Read-only access.</p>}
            {user.permissions.map((p) => <div key={p} className="row small"><Check size={15} color="var(--green)" /> {PERMISSION_LABEL[p]}</div>)}
          </div>
        </Card>
        <Card>
          <CardHead title="Platform" icon={<Globe size={18} />} />
          <div className="card-body">
            <KV items={[
              ['Website', <a href={SITE_URL} target="_blank" rel="noreferrer">{SITE_URL}</a>],
              ['API', API_ORIGIN],
              ['Updates to the website', 'Immediate: every save refreshes the affected pages, and live availability is re-checked every minute.'],
            ]} />
          </div>
        </Card>
      </div>
    </>
  );
}
