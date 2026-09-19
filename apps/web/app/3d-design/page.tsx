import type { Metadata } from 'next';
import { DigitalTwin } from '../../components/digital-twin/DigitalTwin';

export const metadata: Metadata = {
  title: '3D Design | Explore Almasi',
  description:
    'Step inside Almasi in Kimihurura, Kigali. Explore the architecture, pool, reception and a furnished reference residence in interactive 3D.',
  alternates: { canonical: '/3d-design' },
};

export default function DesignPage() {
  return <DigitalTwin />;
}
