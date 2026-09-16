import { chromium } from '@playwright/test';
const b = await chromium.launch();
for (const [w,h,name] of [[1440,900,'intro-shot.png'],[420,900,'intro-shot-mobile.png']]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto('http://localhost:3000', { waitUntil: 'load' });
  const skip = p.getByText('Skip intro', { exact: false }).first();
  if (await skip.count()) await skip.click({ force: true });
  await p.waitForTimeout(1800);
  await p.locator('#intro-title').first().scrollIntoViewIfNeeded();
  await p.waitForTimeout(2500);
  await p.screenshot({ path: name });
  await p.close();
}
await b.close();
