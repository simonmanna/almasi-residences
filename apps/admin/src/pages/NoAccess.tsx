import { ShieldAlert } from 'lucide-react';
import { PERMISSION_LABEL, type Permission } from '@avida/types';
import { useAuth } from '../lib/auth';
import { Link } from '../lib/router';
import { Empty } from '../components/ui';

/**
 * A screen the signed-in user's role cannot open. The API refuses these routes
 * anyway; showing this instead of a wall of error boxes means the reason is
 * legible and the operator knows who to ask rather than assuming a broken page.
 */
export default function NoAccess({ params }: { params: Record<string, string> }) {
  const { user } = useAuth();
  const needs = params.needs as Permission | undefined;
  const role = user?.role.replace(/_/g, ' ').toLowerCase() ?? 'current';
  return (
    <Empty
      icon={<ShieldAlert size={22} />}
      title="You do not have access to this screen"
      action={<Link to="/" className="btn primary">Back to the dashboard</Link>}
    >
      {needs
        ? `It needs the "${PERMISSION_LABEL[needs]}" permission, which the ${role} role does not have. An administrator can change your role.`
        : 'An administrator can change your role if you need this screen.'}
    </Empty>
  );
}
