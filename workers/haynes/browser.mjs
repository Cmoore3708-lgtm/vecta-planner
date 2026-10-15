import { chromium } from 'playwright';
import { profileOptions } from './profile-options.mjs';

export { START, browserLookup } from './vehicle-browser.mjs';
export async function openProfile({ headless = true } = {}) {
  const profile = profileOptions();
  return chromium.launchPersistentContext(profile.directory, { ...profile.options, headless });
}
