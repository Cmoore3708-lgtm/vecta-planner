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
      // Poll through the browser protocol instead of injecting a polling script
      // into the supplier page (which can reject it under its script policy).
      const resultDeadline = Date.now() + 12000;
      while (Date.now() < resultDeadline) {
        try {
          data = await page.evaluate(readVehicle);
          if (data.login || data.blocked || data.registration || data.ambiguous) break;
        } catch (error) {
          // Navigation replaces the execution context during a successful search.
          if (!/Execution context was destroyed|Cannot find context/.test(error.message || '')) throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      if (!(data.login || data.blocked || data.registration || data.ambiguous)) {
        const error = new Error('Result did not become ready');
        error.name = 'TimeoutError';
        throw error;
      }
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
