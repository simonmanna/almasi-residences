import type { Metadata } from 'next';
import { DigitalTwin } from '../../components/digital-twin/DigitalTwin';
import { pageMetadata } from '../../lib/page-metadata';
import { assertPageVisible } from '../../lib/page-visibility';

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata('/3d-design');
}

export default async function DesignPage() {
  await assertPageVisible('design3d');

  return <DigitalTwin />;
}
