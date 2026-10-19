import { chromium } from '../haynes/node_modules/playwright/index.mjs';
import { resolve } from 'node:path';
import { SUPPLIER } from './browser.mjs';
const context = await chromium.launchPersistentContext(resolve(process.env.TYRE_PROFILE_DIR || '.tyre-browser-profile'), { channel: 'msedge', headless: false });
const page = context.pages()[0] || await context.newPage();
await page.goto(SUPPLIER);
console.log('Sign into the supplier in Edge. Credentials remain in this browser profile. Close Edge when finished.');
await new Promise(resolve => context.on('close', resolve));
