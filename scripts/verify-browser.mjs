import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2] || 'http://127.0.0.1:4173';
const screenshot = process.argv[3] || '/tmp/vecta-test-verification.png';
const mobile = process.env.VECTA_BROWSER_MODE === 'mobile';
const settleMs = Math.max(0, Number(process.env.VECTA_BROWSER_SETTLE_MS || 0));
const allowExternal = process.env.VECTA_BROWSER_ALLOW_EXTERNAL === '1';
const proxyServer = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';
const localTarget = /127\.0\.0\.1|localhost/.test(target);
const browser = await chromium.launch({
  headless: true,
  proxy: proxyServer && (!localTarget || allowExternal) ? { server: proxyServer } : undefined,
  args: localTarget && !allowExternal ? ['--no-proxy-server'] : [],
  env: localTarget && !allowExternal ? { ...process.env, HTTP_PROXY: '', HTTPS_PROXY: '', ALL_PROXY: '', NO_PROXY: '*' } : process.env
});
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  serviceWorkers: localTarget ? 'block' : 'allow',
  viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
  isMobile: mobile,
  hasTouch: mobile
});
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('pageerror', error => pageErrors.push(String(error.message || error)));

if (localTarget) {
  const localOrigin = new URL(target).origin;
  const contentTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
  await page.route(`${localOrigin}/**`, async route => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const candidates = [path.resolve(relative), path.resolve('public', relative)];
    const file = candidates.find(candidate => candidate.startsWith(process.cwd()) && fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!file) return route.fulfill({ status: 404, body: 'Not found' });
    return route.fulfill({ status: 200, contentType: contentTypes[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  await page.route('**/api/supabase-config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      supabaseUrl: 'https://rmbmbpqwvghxuyeykjhh.supabase.co',
      supabasePublishableKey: 'sb_publishable_g_Ey4NLLhW6aZye_bPZWlw_nE7Skh0z'
    })
  }));
}

const startupStartedAt = Date.now();
await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 });
let loadError = '';
try {
  await page.waitForFunction(() => document.body.innerText.includes('Dashboard') && !document.body.innerText.includes('Loading workshop'), null, { timeout: 60000 });
} catch (error) {
  loadError = String(error.message || error);
  const diagnostic = {
    target,
    title: await page.title(),
    url: page.url(),
    body: (await page.locator('body').innerText()).slice(0, 2000),
    consoleErrors,
    pageErrors,
    loadError
  };
  console.log(JSON.stringify(diagnostic, null, 2));
  await page.screenshot({ path: screenshot, fullPage: false });
  await browser.close();
  process.exit(1);
}
const startupMs = Date.now() - startupStartedAt;
const banner = await page.locator('#vectaSyntheticBanner').textContent();
if (settleMs) await page.waitForTimeout(settleMs);
const connectivity = (await page.locator('#vectaConnectivityText').textContent() || '').trim();
const sections = ['Dashboard', 'Jobs', 'Fleet Manager', 'Financial', 'Invoices', 'Website Bookings'];
const results = [];
let finance = null;
for (const section of sections) {
  const button = page.getByRole('button', { name: new RegExp(`^${section}(?:\\s|$)`, 'i') }).first();
  await button.click();
  await page.waitForTimeout(400);
  const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
  results.push({ section, visible: await button.isVisible(), contentLength: text.length, sample: text.slice(0, 180) });
  if (section === 'Financial') {
    const tile = page.locator('[data-finance-period="today"] strong');
    const tileText = await tile.textContent();
    await page.locator('[data-finance-period="today"]').click();
    await page.waitForSelector('.financeReportModal');
    const groupTexts = await page.locator('.financeCustomerHead strong').allTextContents();
    const amount = value => Number(String(value || '').replace(/[^0-9.-]/g, '')) || 0;
    const reportTotal = groupTexts.reduce((sum, value) => sum + amount(value), 0);
    finance = { tile: amount(tileText), reportTotal, matches: Math.abs(amount(tileText) - reportTotal) < 0.01 };
    await page.locator('.financeReportModal [data-close-modal]').first().click();
  }
}
await page.screenshot({ path: screenshot, fullPage: false });
const overlay = await page.locator('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay').count();
await browser.close();

const ignored = localTarget ? /favicon|Failed to load resource.*404|ERR_EMPTY_RESPONSE/i : /favicon|Failed to load resource.*404/i;
const meaningfulConsoleErrors = consoleErrors.filter(message => !ignored.test(message));
const report = { target, mode: mobile ? 'mobile' : 'desktop', startupMs, settleMs, connectivity, banner, finance, sections: results, overlay, consoleErrors: meaningfulConsoleErrors, pageErrors, screenshot };
console.log(JSON.stringify(report, null, 2));
if (!/SYNTHETIC TEST DATA/.test(String(banner)) || (localTarget && startupMs > 3000) || !finance?.matches || overlay || meaningfulConsoleErrors.length || pageErrors.length || results.some(result => !result.visible || result.contentLength < 100)) {
  process.exitCode = 1;
}
