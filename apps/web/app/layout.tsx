import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { fillCopyTokens, formatQuarter } from '@avida/types';
import { DEVELOPMENT_SLUG, getDevelopment, getInventory, getMediaSlotsSafe, getSeo } from '../lib/api';
import { organizationJsonLd, websiteJsonLd } from '../lib/seo';
import { copyTokenValues } from '../lib/copy-tokens';
import { summarise, toResidences } from '../lib/residences';
import { MediaSlotsProvider } from '../components/providers/MediaSlotsProvider';
import { SmoothScroll } from '../components/layout/SmoothScroll';
import { InventoryProvider } from '../components/providers/InventoryProvider';
import { ContactProvider } from '../components/providers/ContactProvider';
import { contactFrom } from '../lib/contact';
import { EnquiryProvider } from '../components/enquiry/EnquiryProvider';
import { SiteNav } from '../components/layout/SiteNav';
import { RouteFade } from '../components/layout/RouteFade';
import { StickyMobileCta } from '../components/layout/StickyMobileCta';
import { CursorLabel } from '../components/layout/CursorLabel';
import { PreviewBanner } from '../components/layout/PreviewBanner';
import { AnalyticsTracker } from '../components/layout/AnalyticsTracker';
import { WhatsAppLauncher } from '../components/layout/WhatsAppLauncher';
import { DEFAULT_THEME, MOTION_SCRIPT, THEME_NIGHT, isThemeId } from '../lib/theme';
import { RevealObserver } from '../components/ui/RevealObserver';
import '../styles/tokens.css';
import '../styles/themes.css';
import '../styles/app.css';
import '../styles/mobile.css';

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

// Theme faces load only when a theme sets them (preload off): Blue sets
// Cormorant Garamond over Manrope, Sky Blue sets DM Serif Display over Manrope.
const cormorant = localFont({
  src: [
    { path: '../public/fonts/cormorant-400.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/cormorant-400-italic.woff2', weight: '400', style: 'italic' },
    { path: '../public/fonts/cormorant-500.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-cormorant',
  display: 'swap',
  preload: false,
  fallback: ['Iowan Old Style', 'Georgia', 'serif'],
});

const dmSerif = localFont({
  src: [
    { path: '../public/fonts/dm-serif-400.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/dm-serif-400-italic.woff2', weight: '400', style: 'italic' },
  ],
  variable: '--font-dmserif',
  display: 'swap',
  preload: false,
  fallback: ['Georgia', 'serif'],
});

const manrope = localFont({
  src: [
    { path: '../public/fonts/manrope-400.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/manrope-500.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/manrope-600.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-manrope',
  display: 'swap',
  preload: false,
  fallback: ['system-ui', 'Segoe UI', 'sans-serif'],
});

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/** First visit of a session, motion allowed, on the home page: hold the frame dark for the intro. */
const INTRO_SCRIPT = `try{var d=document.documentElement;if(location.pathname==='/'&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&sessionStorage.getItem('almasi:intro-seen')!=='1'){d.dataset.intro='pending'}}catch(e){}`;

/** Without JavaScript nothing waits to be revealed. */
const NOSCRIPT_CSS =
  '.reveal .reveal-word{transform:none!important}.reveal-media{clip-path:none!important}.reveal-media>*{transform:none!important}';

/**
 * §5.6 — the site-wide title, description and keywords are the admin's
 * (Website → SEO). Only the title template and technical flags live here.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [dev, seo, inventory] = await Promise.all([getDevelopment().catch(() => null), getSeo().catch(() => null), getInventory().catch(() => null)]);
  const name = dev?.name ?? '';
  const values = inventory ? copyTokenValues(summarise(toResidences(inventory)), { handover: dev?.handoverDate ? formatQuarter(dev.handoverDate) : null, name }) : {};
  const fill = (t: string | undefined) => (t ? fillCopyTokens(t, values) : undefined);
  const title = fill(seo?.site?.title) ?? name;
  return {
    metadataBase: new URL(SITE),
    title: { default: title, template: name ? `%s — ${name}` : '%s' },
    description: fill(seo?.site?.description),
    applicationName: name || undefined,
    keywords: seo?.site?.keywords,
    openGraph: { type: 'website', siteName: name || undefined, locale: 'en_GB' },
    twitter: { card: 'summary_large_image' },
    robots: { index: true, follow: true },
    // §SEO — the verification tokens the admin pasted in (SEO → accounts).
    // Nothing is printed for an account that was never connected.
    ...(seo?.site?.gscVerification || seo?.site?.bingVerification
      ? {
          verification: {
            ...(seo.site.gscVerification ? { google: seo.site.gscVerification } : {}),
            ...(seo.site.bingVerification ? { other: { 'msvalidate.01': seo.site.bingVerification } } : {}),
          },
        }
      : {}),
  };
}

/** The look the admin chose (Website → Theme). Visitors never choose it. */
async function siteTheme() {
  const t = await getDevelopment().then((d) => d.siteTheme).catch(() => null);
  return isThemeId(t) ? t : DEFAULT_THEME;
}

export async function generateViewport(): Promise<Viewport> {
  return {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    themeColor: THEME_NIGHT[await siteTheme()],
  };
}

/** GA4 through gtag, loaded after the page is interactive. */
const ga4Script = (id: string) =>
  `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${id}',{anonymize_ip:true});`;

/** Tag Manager's own loader, with its id substituted. */
const gtmScript = (id: string) =>
  `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${id}');`;

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
  const [{ dev, inventory }, slots, seo] = await Promise.all([loadShell(), getMediaSlotsSafe(), getSeo().catch(() => null)]);
  // §SEO — who publishes the site, and the site itself. Emitted once here so
  // every page inherits the same identity instead of repeating it.
  const identity = [organizationJsonLd(dev, seo?.site ?? null, null), dev?.name ? websiteJsonLd(dev.name) : null].filter(Boolean);
  const ga4 = seo?.site?.ga4MeasurementId ?? null;
  const gtm = seo?.site?.gtmContainerId ?? null;
  const bathrooms = Object.fromEntries((dev?.typologies ?? []).map((t) => [t.slug, t.bathrooms]));
  const contact = contactFrom(dev?.contact, dev?.name);
  const theme = isThemeId(dev?.siteTheme) ? dev.siteTheme : DEFAULT_THEME;

  return (
    <html lang="en-GB" data-theme={theme} className={`${display.variable} ${ui.variable} ${cormorant.variable} ${dmSerif.variable} ${manrope.variable}`} suppressHydrationWarning>
      <head>
        {/* Before first paint: decide whether the home page opens with its intro. */}
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: INTRO_SCRIPT }} />
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: MOTION_SCRIPT }} />
        <noscript>
          <style>{NOSCRIPT_CSS}</style>
        </noscript>
        {/* §5.2 — preconnect to the API origin (the rewrite is same-origin
            in production, but tooling and preview servers may differ). */}
        {process.env.API_INTERNAL_URL && (
          <link rel="dns-prefetch" href={new URL(process.env.API_INTERNAL_URL).origin} />
        )}
        {identity.length > 0 && (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(identity) }} />
        )}
        {gtm && <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: gtmScript(gtm) }} />}
        {ga4 && <link rel="preconnect" href="https://www.googletagmanager.com" />}
      </head>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <SmoothScroll>
          <ContactProvider contact={contact}>
            <InventoryProvider initial={inventory} bathrooms={bathrooms} slug={DEVELOPMENT_SLUG}>
              <EnquiryProvider>
                <SiteNav />
                <MediaSlotsProvider slots={slots}>
                  <RouteFade>{children}</RouteFade>
                </MediaSlotsProvider>
                <StickyMobileCta />
              </EnquiryProvider>
            </InventoryProvider>
          </ContactProvider>
        </SmoothScroll>
        <CursorLabel />
        <PreviewBanner />
        <WhatsAppLauncher contact={contact} />
        {gtm && (
          <noscript>
            <iframe src={`https://www.googletagmanager.com/ns.html?id=${gtm}`} height="0" width="0" style={{ display: 'none', visibility: 'hidden' }} title="Tag Manager" />
          </noscript>
        )}
        {ga4 && (
          <>
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${ga4}`} />
            <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: ga4Script(ga4) }} />
          </>
        )}
        <AnalyticsTracker />
        <RevealObserver />
      </body>
    </html>
  );
}
