import { openProfile, START } from './browser.mjs';
import { createInterface } from 'node:readline/promises';
// Run on the host's private desktop, with the worker stopped. No passwords in CLI.
const context = await openProfile({ headless: false });
try {
  const page = await context.newPage();
  await page.goto(START);
  const input = createInterface({ input: process.stdin, output: process.stdout });
  await input.question('Sign in directly in the browser. When the makes page is visible, press Enter here. ');
  input.close();
  if (await page.locator('#numberPlate,input[name="numberPlate"]').count() !== 1) throw Error('Login is not complete.');
} finally { await context.close(); }
