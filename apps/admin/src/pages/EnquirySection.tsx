import { ExternalLink, Inbox } from 'lucide-react';
import { SITE_URL } from '../lib/site';
import { SectionSettings } from '../components/SectionSettings';
import { PageHead } from '../components/ui';

/** Website → Enquiry — where the website invites an enquiry, and whether each invitation shows. */
export default function EnquirySection() {
  return (
    <>
      <PageHead
        title="Enquiry"
        sub="The Enquire button in the navigation, and the enquiry section on the homepage."
        crumbs={[{ label: 'Website' }, { label: 'Enquiry' }]}
      >
        <a className="btn" href={SITE_URL} target="_blank" rel="noreferrer"><ExternalLink size={15} /> View on the website</a>
      </PageHead>
      <SectionSettings
        pageKey="enquirySection"
        title="Where visitors can enquire"
        icon={<Inbox size={18} />}
        fields={[
          {
            key: 'showEnquireButton',
            label: 'Enquire button',
            type: 'boolean',
            on: 'Shown in the navigation, the menu and the mobile bar',
            off: 'Hidden everywhere',
            hint: 'Off hides the Enquire button in the top navigation, the menu and the mobile bar. The /enquire page itself stays live.',
          },
          {
            key: 'showEnquirySection',
            label: 'Homepage enquiry section',
            type: 'boolean',
            hint: 'Off hides the enquiry block at the foot of the homepage.',
          },
        ]}
      />
    </>
  );
}
