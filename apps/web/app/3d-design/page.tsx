import type { Metadata } from 'next';
import { DigitalTwin } from '../../components/digital-twin/DigitalTwin';
import { assertPageVisible } from '../../lib/page-visibility';

export const metadata: Metadata = {
  title: '3D Design | Explore Almasi',
  description:
    'Step inside Almasi in Kimihurura, Kigali. Explore the architecture, pool, reception and a furnished reference residence in interactive 3D.',
  alternates: { canonical: '/3d-design' },
};

export default async function DesignPage() {
  await assertPageVisible('design3d');

  return <DigitalTwin />;
}
