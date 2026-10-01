// Browser check for /3d-design. Needs the web server (and the API, for the residence steps) running.
//   node scripts/verify-digital-twin.cjs
//   E2E_WEB_URL=http://localhost:3100 E2E_CHANNEL=chrome node scripts/verify-digital-twin.cjs
// E2E_CHANNEL=chrome uses the installed Chrome instead of Playwright's own Chromium.
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const OUT = 'test-results/digital-twin';
const BASE = process.env.E2E_WEB_URL || 'http://localhost:3000';
// A hardware GL backend where the platform has one; headless Chrome otherwise falls back to software rendering.
const ANGLE = { win32: ['--use-angle=d3d11'], darwin: ['--use-angle=gl'] }[process.platform] || [];
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.E2E_CHANNEL || undefined,
    args: [...ANGLE, '--ignore-gpu-blocklist'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && /WebGL|THREE|Content Security Policy/.test(m.text())) errors.push(m.text());
    });
    await page.goto(`${BASE}/3d-design?quality=lite`, { waitUntil: 'domcontentloaded' });
    // Dev-only diagnostics sit over the controls; production has no portal.
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    const stage = page.locator('section[aria-label="Almasi Residence interactive 3D experience"]');
    await stage.and(page.locator('[data-phase="ready"]')).waitFor({ timeout: 120000 });
    await page.waitForTimeout(6500); // the opening fly-in
    await page.screenshot({ path: `${OUT}/exterior.png` });
    console.log('PASS building loaded');

    const fps = await page.evaluate(
      () =>
        new Promise((resolve) => {
          let frames = 0;
          const start = performance.now();
          const tick = () => {
            frames++;
            if (performance.now() - start < 3000) requestAnimationFrame(tick);
            else resolve((frames * 1000) / (performance.now() - start));
          };
          requestAnimationFrame(tick);
        }),
    );
    console.log(`INFO ${fps.toFixed(1)} frames a second in the exterior view`);

    for (const hour of ['Day', 'Night', 'Sunset']) await page.getByRole('button', { name: hour, exact: true }).click();
    await page.mouse.move(720, 450);
    await page.mouse.down();
    await page.mouse.move(520, 430, { steps: 10 });
    await page.mouse.up();
    await page.mouse.wheel(0, -240);
    console.log('PASS time of day, orbit, zoom');

    const dock = page.getByRole('navigation', { name: 'Explore' });
    for (const [place, title] of [['Arrival', 'The arrival'], ['Reception', 'Reception'], ['Pool', 'The pool'], ['Gardens', 'The gardens']]) {
      await dock.getByRole('button', { name: place, exact: true }).click();
      await page.getByRole('heading', { level: 1, name: title, exact: false }).waitFor();
    }
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${OUT}/gardens.png` });
    await dock.getByRole('button', { name: 'Building', exact: true }).click();
    console.log('PASS arrival, reception, pool, gardens');

    const floors = page.getByRole('navigation', { name: 'Choose a floor' });
    if (await floors.count()) {
      await floors.getByTitle('Second floor').click();
      await page.getByRole('heading', { level: 1, name: 'Second floor', exact: false }).waitFor();
      await page.waitForTimeout(3500);
      await page.screenshot({ path: `${OUT}/floor.png` });
      const row = page.locator('aside[aria-label="Select a residence"] [role="listitem"]').first();
      const label = (await row.locator('strong').innerText()).trim();
      await row.click();
      const card = page.getByRole('complementary', { name: `Residence ${label}` });
      await card.waitFor();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `${OUT}/residence.png` });
      console.log(`PASS floor opened, residence ${label} selected`);

      await card.getByRole('button', { name: 'Floor plan', exact: true }).click();
      await page.getByRole('heading', { name: 'Choose a room.' }).waitFor();
      await page.keyboard.press('Escape');
      await card.getByRole('button', { name: 'Enter 3D tour', exact: false }).click();
      await page.getByRole('complementary', { name: 'Residence and rooms' }).waitFor({ timeout: 20000 });
      await page.waitForTimeout(6000);
      await page.screenshot({ path: `${OUT}/interior.png` });
      await page.getByRole('complementary', { name: 'Residence and rooms' }).getByRole('button', { name: 'Kitchen', exact: true }).click();
      await dock.getByRole('button', { name: 'Walk', exact: true }).click();
      await page.locator('canvas').focus();
      await page.keyboard.down('w');
      await page.waitForTimeout(500);
      await page.keyboard.up('w');
      await dock.getByRole('button', { name: 'Dollhouse', exact: true }).click();
      await page.waitForTimeout(2500);
      await dock.getByRole('button', { name: 'Exit', exact: true }).click();
      await floors.waitFor();
      console.log('PASS tour entered: rooms, walk, dollhouse, exit');
    } else {
      console.log('SKIP floors and residences: no inventory (is the API running?)');
    }

    await page.setViewportSize({ width: 375, height: 760 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/phone.png` });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'the page scrolls sideways at 375px');
    console.log('PASS no sideways scroll at 375px');

    assert.deepEqual(errors, []);
    console.log('PASS no uncaught browser errors');

    const bare = await browser.newPage({ viewport: { width: 375, height: 760 }, reducedMotion: 'reduce' });
    await bare.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        if (type === 'webgl2' || type === 'webgl') return null;
        return original.call(this, type, ...args);
      };
    });
    await bare.goto(`${BASE}/3d-design`);
    await bare.getByText('Interactive 3D isn’t available on this device.').waitFor();
    await bare.getByRole('link', { name: /View the residence gallery/ }).waitFor();
    console.log('PASS no-WebGL fallback');
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
