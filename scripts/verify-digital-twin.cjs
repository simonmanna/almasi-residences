const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
fs.mkdirSync('test-results/digital-twin', { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, args: process.platform === 'win32' ? ['--use-angle=d3d11'] : [] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && /GLTFLoader|Content Security Policy/.test(message.text())) errors.push(message.text());
    });
    await page.goto((process.env.E2E_WEB_URL || 'http://localhost:3000') + '/3d-design', {
      waitUntil: 'domcontentloaded',
    });
    // Dev-only diagnostics sit over mobile controls; production has no portal.
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await page.getByRole('button', { name: 'Enter 3D experience' }).click();
    await page.waitForFunction(() => !document.querySelector('progress'), {}, { timeout: 30000 });
    await page.waitForTimeout(1600);
    await page.screenshot({ path: 'test-results/digital-twin/page-exterior.png' });
    console.log('PASS exterior loaded');
    await page.getByRole('button', { name: 'Explore reference home', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('progress'));
    await page.waitForTimeout(1600);
    await page.screenshot({ path: 'test-results/digital-twin/page-interior.png' });
    console.log('PASS residence loaded');
    await page.getByRole('button', { name: 'Kitchen', exact: true }).click();
    await page.getByRole('heading', { name: 'Kitchen', exact: false }).waitFor();
    await page.getByRole('button', { name: 'Night', exact: true }).click();
    await page.getByRole('button', { name: 'Lights', exact: true }).click();
    await page.getByRole('button', { name: 'Walk', exact: true }).click();
    await page.locator('canvas').focus();
    await page.keyboard.down('w');
    await page.waitForTimeout(500);
    await page.keyboard.up('w');
    console.log('PASS room, night, lights, keyboard walk');
    await page.getByRole('button', { name: 'Floor plan', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Go to Primary suite', exact: true })
      .click();
    await page
      .getByRole('heading', { name: 'Primary suite', exact: false })
      .waitFor();
    console.log('PASS floor plan room selection');
    await page.getByRole('button', { name: 'Cutaway', exact: true }).click();
    await page.waitForTimeout(1600);
    await page.screenshot({ path: 'test-results/digital-twin/page-cutaway.png' });
    await page.getByRole('button', { name: 'Back to the building', exact: false }).click();
    await page.getByRole('button', { name: 'The arrival', exact: false }).click();
    await page.waitForTimeout(1600);
    await page.getByRole('button', { name: 'The pool', exact: false }).click();
    await page.waitForTimeout(1600);
    await page.getByRole('button', { name: 'The gardens', exact: false }).click();
    console.log('PASS cutaway/reception/pool/garden');
    const residence = page.locator('aside[aria-label="Building explorer"] button[aria-pressed]').first();
    if (await residence.count()) {
      const label = await residence.locator('strong').innerText();
      await residence.click();
      await page.getByRole('button', { name: `Enquire about ${label}`, exact: false }).click();
      assert.match(await page.getByRole('dialog').innerText(), new RegExp(label));
      await page.keyboard.press('Escape');
      console.log('PASS selected residence enquiry (no submission)');
    }
    await page.getByRole('button', { name: 'Gallery', exact: true }).click();
    assert.equal(await page.locator('canvas').count(), 0);
    console.log('PASS gallery releases WebGL');
    await page.setViewportSize({ width: 375, height: 812 });
    if (await page.getByRole('button', { name: 'Close explorer', exact: true }).isVisible()) {
      await page.getByRole('button', { name: 'Close explorer', exact: true }).click();
    }
    await page.screenshot({ path: 'test-results/digital-twin/page-mobile.png' });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.getByRole('button', { name: 'Residences', exact: false }).click();
    await page.getByRole('button', { name: 'Close explorer', exact: true }).click();
    console.log('PASS mobile sheet/overflow');
    assert.deepEqual(errors, []);
    console.log('PASS no uncaught browser errors');
    const fallbackPage = await browser.newPage({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
    await fallbackPage.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) {
        if (type === 'webgl2' || type === 'webgl') return null;
        return original.call(this, type, ...args);
      };
    });
    await fallbackPage.goto((process.env.E2E_WEB_URL || 'http://localhost:3000') + '/3d-design');
    await fallbackPage.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await fallbackPage.getByRole('button', { name: 'Enter 3D experience' }).click();
    await fallbackPage.getByText('3D is unavailable on this device.').waitFor();
    await fallbackPage.getByRole('button', { name: 'Floor plan', exact: true }).click();
    await fallbackPage.getByRole('button', { name: 'Go to Terrace', exact: true }).click();
    console.log('PASS no-WebGL fallback and accessible room navigation');
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
