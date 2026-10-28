import { chromium } from 'playwright';
import { profileOptions } from './profile-options.mjs';
import { START } from './vehicle-browser.mjs';

export { START, browserLookup } from './vehicle-browser.mjs';

// Edge can start with an about:blank tab even when the saved Haynes session
// is healthy. Navigate that tab to the supplier without clearing its profile.
// Leave any login/verification page visible for the operator.
export async function openProfile({ headless = true } = {}) {
  const profile = profileOptions();
  const context = await chromium.launchPersistentContext(profile.directory, { ...profile.options, headless });
  try {
    const page = context.pages().find(p => !p.isClosed()) || await context.newPage();
    if (page.url() === 'about:blank') {
      await page.goto(START, { waitUntil: 'domcontentloaded', timeout: 15000 });
    }
  } catch (error) {
    console.warn('Haynes startup navigation failed; leaving browser visible for manual login:', error.message);
  }
  return context;
}
