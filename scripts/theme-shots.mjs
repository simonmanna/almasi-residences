// Visual QA: screenshots every major page under each visitor theme.
// Usage: node scripts/theme-shots.mjs [baseUrl] [outDir] [theme,theme] [path,path] [--mobile]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [base = 'http://localhost:3000', out = 'test-results/theme-shots', themesArg, pathsArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const mobile = process.argv.includes('--mobile');
const themes = themesArg ? themesArg.split(',') : ['blue', 'wooden', 'sky'];
const paths = pathsArg ? pathsArg.split(',') : ['/', '/residences', '/gallery', '/amenities', '/location', '/enquire'];
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
for (const theme of themes) {
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('almasi:theme', t);
      localStorage.setItem('almasi:intro-seen', '1');
    } catch {}
  }, theme);
  const page = await ctx.newPage();
  for (const p of paths) {
    await page.goto(base + p, { waitUntil: 'networkidle', timeout: 90_000 }).catch(() => {});
    await page.waitForTimeout(800);
    // Walk the page so lazy media and reveals settle before the full-page capture.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 700) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(400);
    const name = `${theme}${mobile ? '-m' : ''}${p === '/' ? '_home' : p.replace(/\//g, '_')}.png`;
    await page.screenshot({ path: `${out}/${name}`, fullPage: true });
    console.log('shot', name);
  }
  await ctx.close();
}
await browser.close();
