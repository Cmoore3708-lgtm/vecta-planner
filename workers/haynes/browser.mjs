import { chromium } from 'playwright';
import { readVehicle } from './dom.mjs';
import { profileOptions } from './profile-options.mjs';
import { HaynesError, vehicleResult } from '../../lib/haynes-vehicle.js';

export const START = 'https://www.workshopdata.com/touch/site/layout/makesOverview';
export async function openProfile({ headless = true } = {}) {
  const profile = profileOptions();
  return chromium.launchPersistentContext(profile.directory, { ...profile.options, headless });
}
export function browserLookup(context, { keepFailedPage = false } = {}) {
  return async registration => {
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const deadline = keepFailedPage ? null : setTimeout(() => page.close().catch(() => {}), 23000);
    let failed = false, stage = 'OPEN_SEARCH';
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
      stage = 'ENTER_REGISTRATION';
      await page.locator('#numberPlate,input[name="numberPlate"]').fill(registration);
      stage = 'SUBMIT_SEARCH';
      await page.locator('#licencePlateBtn').click();
      stage = 'WAIT_RESULT';
      await page.waitForFunction(() => {
        const text = document.body.innerText || '';
        return document.querySelector('input[type="password"]') || /Verify you are human|Checking your browser|unusual traffic|automated traffic/.test(text) || /Vehicle Registration Number:/.test(text) || Array.from(document.querySelectorAll('a')).some(a => a.href.includes('/modelDetail?'));
      });
      data = await page.evaluate(readVehicle);
      if (data.login) throw new HaynesError('LOGIN_REQUIRED');
      if (data.blocked) throw new HaynesError('VERIFICATION_REQUIRED');
      stage = 'VALIDATE_VEHICLE';
      return vehicleResult(data, registration);
    } catch (error) {
      failed = true;
      const safeError = error instanceof HaynesError ? error : new HaynesError('UNAVAILABLE');
      safeError.stage = stage;
      safeError.reason = error.name === 'TimeoutError' ? 'TIMEOUT' : error instanceof HaynesError ? error.code : 'BROWSER_ERROR';
      throw safeError;
    } finally { clearTimeout(deadline); if (!failed || !keepFailedPage) await page.close().catch(() => {}); }
  };
}
