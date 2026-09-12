import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { useAuth } from './lib/auth';
import { match, useLocation } from './lib/router';
import { ConfirmProvider, LoadingPage } from './components/ui';
import { Shell } from './layout/Shell';
import { Login } from './pages/Login';

type Page = LazyExoticComponent<ComponentType<{ params: Record<string, string> }>>;
const page = (load: () => Promise<{ default: ComponentType<{ params: Record<string, string> }> }>): Page => lazy(load);

/** Every screen, by path. Order matters only where two patterns could match. */
const ROUTES: [string, Page][] = [
  ['/', page(() => import('./pages/Dashboard'))],
  ['/property', page(() => import('./pages/Property'))],
  ['/floors', page(() => import('./pages/Floors'))],
  ['/floors/:id', page(() => import('./pages/FloorDetail'))],
  ['/residences', page(() => import('./pages/Residences'))],
  ['/residences/new', page(() => import('./pages/ResidenceWizard'))],
  ['/residences/:id', page(() => import('./pages/ResidenceDetail'))],
  ['/types', page(() => import('./pages/Types'))],
  ['/rooms', page(() => import('./pages/Rooms'))],
  ['/parking', page(() => import('./pages/Parking'))],
  ['/amenities', page(() => import('./pages/Amenities'))],
  ['/residents', page(() => import('./pages/Residents'))],
  ['/residents/:id', page(() => import('./pages/ResidentDetail'))],
  ['/buyers', page(() => import('./pages/Buyers'))],
  ['/buyers/:id', page(() => import('./pages/BuyerDetail'))],
  ['/enquiries', page(() => import('./pages/Enquiries'))],
  ['/media', page(() => import('./pages/MediaLibrary'))],
  ['/videos', page(() => import('./pages/MediaLibrary'))],
  ['/floor-plans', page(() => import('./pages/MediaLibrary'))],
  ['/designs', page(() => import('./pages/MediaLibrary'))],
  ['/galleries', page(() => import('./pages/Galleries'))],
  ['/galleries/:id', page(() => import('./pages/GalleryDetail'))],
  ['/availability', page(() => import('./pages/Availability'))],
  ['/pricing', page(() => import('./pages/Pricing'))],
  ['/reservations', page(() => import('./pages/Reservations'))],
  ['/payment-plans', page(() => import('./pages/PaymentPlans'))],
  ['/sales', page(() => import('./pages/SalesOverview'))],
  ['/content/:key', page(() => import('./pages/ContentEditor'))],
  ['/faqs', page(() => import('./pages/Faqs'))],
  ['/progress', page(() => import('./pages/Progress'))],
  ['/users', page(() => import('./pages/Users'))],
  ['/audit', page(() => import('./pages/Audit'))],
  ['/settings', page(() => import('./pages/Settings'))],
];

const NotFound = page(() => import('./pages/NotFound'));

/**
 * §1 — the developer's command centre. The API enforces every rule; this app
 * presents the property and gets out of the way.
 */
export function App() {
  const { user, checking } = useAuth();
  const { path } = useLocation();

  if (checking) return <LoadingPage />;
  if (!user) return <Login />;

  let Screen: Page = NotFound;
  let params: Record<string, string> = {};
  for (const [pattern, component] of ROUTES) {
    const m = match(pattern, path);
    if (m) {
      Screen = component;
      params = m;
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
