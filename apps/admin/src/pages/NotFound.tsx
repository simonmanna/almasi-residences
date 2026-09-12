import { Compass } from 'lucide-react';
import { Link } from '../lib/router';
import { Card, Empty } from '../components/ui';

export default function NotFound() {
  return (
    <Card>
      <Empty title="That page does not exist" icon={<Compass size={34} />} action={<Link to="/" className="btn primary">Back to the dashboard</Link>}>
        The link may be out of date, or the record may have been removed.
      </Empty>
    </Card>
  );
}
