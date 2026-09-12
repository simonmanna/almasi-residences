import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { formatQuarter } from '@avida/types';
import { DEVELOPMENT_SLUG, getDevelopment, getInventory } from '../lib/api';
import { SmoothScroll } from '../components/layout/SmoothScroll';
import { InventoryProvider } from '../components/providers/InventoryProvider';
import { ContactProvider } from '../components/providers/ContactProvider';
import { contactFrom } from '../lib/contact';
import { EnquiryProvider } from '../components/enquiry/EnquiryProvider';
import { SiteNav } from '../components/layout/SiteNav';
import { RouteFade } from '../components/layout/RouteFade';
import { StickyMobileCta } from '../components/layout/StickyMobileCta';
import { CursorLabel } from '../components/layout/CursorLabel';
import '../styles/tokens.css';
import '../styles/app.css';

// Self-hosted through next/font: preloaded, and a metric-matched fallback so
// the swap does not shift the layout.
const display = localFont({
  src: [
    { path: '../public/fonts/gambetta-400.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/gambetta-400-italic.woff2', weight: '400', style: 'italic' },
    { path: '../public/fonts/gambetta-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-display-face',
  display: 'swap',
  fallback: ['Iowan Old Style', 'Georgia', 'serif'],
});

const ui = localFont({
  src: [
    { path: '../public/fonts/supreme-400.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/supreme-500.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/supreme-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-ui-face',
  display: 'swap',
  fallback: ['system-ui', 'Segoe UI', 'sans-serif'],
});

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/** First visit of a session, motion allowed, on the home page: hold the frame dark for the intro. */
const INTRO_SCRIPT = `try{var d=document.documentElement;if(location.pathname==='/'&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&sessionStorage.getItem('almasi:intro-seen')!=='1'){d.dataset.intro='pending'}}catch(e){}`;

/** Without JavaScript nothing waits to be revealed. */
const NOSCRIPT_CSS =
  '.reveal .reveal-word{transform:none!important}.reveal-media{clip-path:none!important}.reveal-media>*{transform:none!important}';

const BASE_METADATA: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: 'Almasi Residences — Luxury apartments and penthouses in Kimihurura, Kigali',
    template: '%s — Almasi Residences, Kigali',
  },
  description:
    'Almasi Residences: private residences in Kimihurura, Kigali — apartments and penthouses with pool, gym, sauna, restaurant and basement parking.',
  applicationName: 'Almasi Residences',
  keywords: [
    'Almasi Residences',
    'Almasi Residence Kigali',
    'luxury apartments Kigali',
    'apartments for sale Kigali',
    'apartments Kimihurura',
    'luxury apartments Kimihurura',
    'penthouses Kigali',
    'property investment Kigali',
  ],
  openGraph: {
    type: 'website',
    siteName: 'Almasi Residences',
    locale: 'en_GB',
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};

/** The default description counts from the live record, so it never promises a number the admin has changed. */
export async function generateMetadata(): Promise<Metadata> {
  const dev = await getDevelopment().catch(() => null);
  if (!dev) return BASE_METADATA;
  const handover = dev.handoverDate ? ` Handover ${formatQuarter(dev.handoverDate)}.` : '';
  return {
    ...BASE_METADATA,
    description: `${dev.name}: ${dev.summary.total} private residences in Kimihurura, Kigali — apartments and penthouses with pool, gym, sauna, restaurant and basement parking.${handover}`,
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#151613',
};

/**
 * §6.7 — the shell needs the inventory: in production a failed fetch fails the
 * build rather than shipping a site with no availability. In development the
 * site still renders so the problem is visible instead of a blank page.
 */
async function loadShell() {
  try {
    const [dev, inventory] = await Promise.all([getDevelopment(), getInventory()]);
    return { dev, inventory };
  } catch (e) {
    if (process.env.NODE_ENV === 'production') throw e;
    console.error('[almasi] API unreachable while rendering the shell:', (e as Error).message);
    return { dev: null, inventory: null };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { dev, inventory } = await loadShell();
  const bathrooms = Object.fromEntries((dev?.typologies ?? []).map((t) => [t.slug, t.bathrooms]));

  return (
    <html lang="en-GB" className={`${display.variable} ${ui.variable}`} suppressHydrationWarning>
      <head>
        {/* Before first paint: decide whether the home page opens with its intro. */}
        <script dangerouslySetInnerHTML={{ __html: INTRO_SCRIPT }} />
        <noscript>
          <style>{NOSCRIPT_CSS}</style>
        </noscript>
        {/* §5.2 — preconnect to the API origin (the rewrite is same-origin
            in production, but tooling and preview servers may differ). */}
        {process.env.API_INTERNAL_URL && (
          <link rel="dns-prefetch" href={new URL(process.env.API_INTERNAL_URL).origin} />
        )}
      </head>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <SmoothScroll>
          <ContactProvider contact={contactFrom(dev?.contact)}>
            <InventoryProvider initial={inventory} bathrooms={bathrooms} slug={DEVELOPMENT_SLUG}>
              <EnquiryProvider>
                <SiteNav />
                <RouteFade>{children}</RouteFade>
                <StickyMobileCta />
              </EnquiryProvider>
            </InventoryProvider>
          </ContactProvider>
        </SmoothScroll>
        <CursorLabel />
      </body>
    </html>
  );
}
