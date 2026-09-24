import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import type { Permission } from '@avida/types';
import { useAuth } from './lib/auth';
import { match, useLocation } from './lib/router';
import { ConfirmProvider, LoadingPage } from './components/ui';
import { Shell } from './layout/Shell';
import { Login } from './pages/Login';

type Page = LazyExoticComponent<ComponentType<{ params: Record<string, string> }>>;
const page = (load: () => Promise<{ default: ComponentType<{ params: Record<string, string> }> }>): Page => lazy(load);

/**
 * Every screen, by path, with the permission it needs.
 *
 * The API is still the authority — it refuses the request regardless. This stops
 * a role reaching a screen by typing its URL and then meeting a wall of error
 * boxes with no explanation of why.
 */
const ROUTES: [string, Page, Permission?][] = [
  ['/', page(() => import('./pages/Dashboard')), 'property.view'],
  ['/property', page(() => import('./pages/Property')), 'property.view'],
  ['/floors', page(() => import('./pages/Floors')), 'floor.view'],
  ['/floors/:id', page(() => import('./pages/FloorDetail')), 'floor.view'],
  ['/residences', page(() => import('./pages/Residences')), 'residence.view'],
  ['/residences/new', page(() => import('./pages/ResidenceWizard')), 'residence.edit'],
  ['/residences/:id', page(() => import('./pages/ResidenceDetail')), 'residence.view'],
  ['/types', page(() => import('./pages/Types')), 'typology.view'],
  ['/rooms', page(() => import('./pages/Rooms')), 'residence.view'],
  ['/parking', page(() => import('./pages/Parking')), 'parking.view'],
  ['/amenities', page(() => import('./pages/Amenities')), 'content.view'],
  ['/residents', page(() => import('./pages/Residents')), 'resident.view'],
  ['/residents/:id', page(() => import('./pages/ResidentDetail')), 'resident.view'],
  ['/buyers', page(() => import('./pages/Buyers')), 'buyer.view'],
  ['/buyers/:id', page(() => import('./pages/BuyerDetail')), 'buyer.view'],
  ['/crm', page(() => import('./pages/CrmDashboard')), 'enquiry.view'],
  ['/crm/leads/:id', page(() => import('./pages/LeadDetail')), 'enquiry.view'],
  ['/crm/tasks', page(() => import('./pages/Tasks')), 'enquiry.view'],
  ['/crm/activities', page(() => import('./pages/Activities')), 'enquiry.view'],
  ['/crm/deals', page(() => import('./pages/Deals')), 'enquiry.view'],
  ['/crm/campaigns', page(() => import('./pages/Campaigns')), 'enquiry.view'],
  ['/crm/reports', page(() => import('./pages/CrmReports')), 'reports.view'],
  ['/crm/team', page(() => import('./pages/CrmTeam')), 'enquiry.view'],
  ['/approvals', page(() => import('./pages/Approvals')), 'enquiry.view'],
  ['/crm/settings', page(() => import('./pages/CrmSettings')), 'enquiry.view'],
  ['/pipeline', page(() => import('./pages/Pipeline')), 'enquiry.view'],
  ['/enquiries', page(() => import('./pages/Enquiries')), 'enquiry.view'],
  ['/viewings', page(() => import('./pages/Viewings')), 'enquiry.view'],
  ['/media', page(() => import('./pages/MediaLibrary')), 'media.view'],
  ['/videos', page(() => import('./pages/MediaLibrary')), 'media.view'],
  ['/floor-plans', page(() => import('./pages/MediaLibrary')), 'media.view'],
  ['/designs', page(() => import('./pages/MediaLibrary')), 'media.view'],
  ['/galleries', page(() => import('./pages/Galleries')), 'gallery.view'],
  ['/galleries/:id', page(() => import('./pages/GalleryDetail')), 'gallery.view'],
  ['/availability', page(() => import('./pages/Availability')), 'residence.view'],
  ['/pricing', page(() => import('./pages/Pricing')), 'residence.view'],
  ['/reservations', page(() => import('./pages/Reservations')), 'residence.view'],
  ['/payment-plans', page(() => import('./pages/PaymentPlans')), 'payment-plan.view'],
  ['/sales', page(() => import('./pages/SalesOverview')), 'residence.view'],
  ['/content/:key', page(() => import('./pages/ContentEditor')), 'content.view'],
  ['/location', page(() => import('./pages/Location')), 'content.view'],
  ['/selected-residences', page(() => import('./pages/SelectedResidences')), 'content.view'],
  ['/whatsapp', page(() => import('./pages/WhatsApp')), 'property.view'],
  ['/faqs', page(() => import('./pages/Faqs')), 'content.view'],
  ['/placements', page(() => import('./pages/Placements')), 'content.view'],
  ['/specifications', page(() => import('./pages/Specifications')), 'typology.view'],
  ['/tours', page(() => import('./pages/ToursList')), 'content.view'],
  ['/tours/:id', page(() => import('./pages/Tours')), 'content.view'],
  ['/film', page(() => import('./pages/Film')), 'content.view'],
  ['/seo', page(() => import('./pages/Seo')), 'content.view'],
  ['/seo/health', page(() => import('./pages/SeoHealth')), 'content.view'],
  ['/seo/records', page(() => import('./pages/SeoRecords')), 'content.view'],
  ['/seo/redirects', page(() => import('./pages/Redirects')), 'content.view'],
  ['/seo/accounts', page(() => import('./pages/SeoAccounts')), 'content.view'],
  ['/location-pages', page(() => import('./pages/LocationPages')), 'content.view'],
  ['/insights', page(() => import('./pages/Insights')), 'content.view'],
  ['/publishing', page(() => import('./pages/Publishing')), 'content.view'],
  ['/progress', page(() => import('./pages/Progress')), 'content.view'],
  ['/users', page(() => import('./pages/Users')), 'user.view'],
  ['/users/:id', page(() => import('./pages/UserDetail'))],
  ['/settings/roles', page(() => import('./pages/Roles')), 'user.view'],
  ['/settings/roles/:id', page(() => import('./pages/RoleDetail')), 'user.view'],
  ['/audit', page(() => import('./pages/Audit')), 'audit.view'],
  ['/settings', page(() => import('./pages/Settings'))],
];

const NotFound = page(() => import('./pages/NotFound'));
const NoAccess = page(() => import('./pages/NoAccess'));

/**
 * §1 — the developer's command centre. The API enforces every rule; this app
 * presents the property and gets out of the way.
 */
export function App() {
  const { user, checking, can } = useAuth();
  const { path } = useLocation();

  if (checking) return <LoadingPage />;
  if (!user) return <Login />;

  let Screen: Page = NotFound;
  let params: Record<string, string> = {};
  for (const [pattern, component, needs] of ROUTES) {
    const m = match(pattern, path);
    if (m) {
      // The API refuses these routes anyway; this turns a wall of error boxes
      // into one screen that says which permission is missing.
      Screen = needs && !can(needs) ? NoAccess : component;
      params = needs && !can(needs) ? { needs } : m;
      break;
    }
  }

  return (
    <ConfirmProvider>
      <Shell>
        <Suspense fallback={<LoadingPage />}>
          <Screen key={path} params={params} />
        </Suspense>
      </Shell>
    </ConfirmProvider>
  );
}
