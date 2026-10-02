import { chromium } from 'playwright';
import { readVehicle } from './dom.mjs';
import { HaynesError, vehicleResult } from '../../lib/haynes-vehicle.js';

export const START = 'https://www.workshopdata.com/touch/site/layout/makesOverview';
export async function openProfile({ headless = true } = {}) {
  return chromium.launchPersistentContext(process.env.HAYNES_PROFILE_DIR || './profile', {
    headless, acceptDownloads: false, chromiumSandbox: true
  });
}
export function browserLookup(context) {
  return async registration => {
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const deadline = setTimeout(() => page.close().catch(() => {}), 23000);
    try {
      // Only the supplier and its static assets may be loaded by this worker.
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        return ['https://www.workshopdata.com', 'https://www.haynespro-assets.com'].includes(url.origin) ? route.continue() : route.abort();
      });
      await page.goto(START, { waitUntil: 'domcontentloaded' });
      let data = await page.evaluate(readVehicle);
      if (data.login) throw new HaynesError('LOGIN_REQUIRED');
      if (data.blocked) throw new HaynesError('VERIFICATION_REQUIRED');
      await page.locator('#numberPlate,input[name="numberPlate"]').fill(registration);
      await page.locator('#licencePlateBtn').click();
      await page.waitForFunction(() => {
        const text = document.body.innerText || '';
        return document.querySelector('input[type="password"]') || /Verify you are human|Checking your browser|unusual traffic|automated traffic/.test(text) || /Vehicle Registration Number:/.test(text) || Array.from(document.querySelectorAll('a')).some(a => a.href.includes('/modelDetail?'));
      });
      data = await page.evaluate(readVehicle);
      if (data.login) throw new HaynesError('LOGIN_REQUIRED');
      if (data.blocked) throw new HaynesError('VERIFICATION_REQUIRED');
      return vehicleResult(data, registration);
    } catch (error) {
      if (error instanceof HaynesError) throw error;
      throw new HaynesError('UNAVAILABLE');
    } finally { clearTimeout(deadline); await page.close().catch(() => {}); }
  };
}
