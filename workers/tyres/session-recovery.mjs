import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const exec = promisify(execFile);
export const SUPPLIER_ORIGIN = 'https://esp.thevirtualwarehouse.co.uk';
export function isLoginPage(url) {
  const parsed = new URL(url);
  if (parsed.origin !== SUPPLIER_ORIGIN) throw Error('SUPPLIER_ORIGIN_CHANGED');
  return /^\/Account\/LogOn\/?$/i.test(parsed.pathname);
}
async function localCredentials() {
  if (process.platform !== 'win32') return null;
  try {
    const {stdout} = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', fileURLToPath(new URL('./read-login.ps1', import.meta.url))], {timeout:10000, windowsHide:true, maxBuffer:16384});
    const credentials = JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
    return typeof credentials.username === 'string' && credentials.username && typeof credentials.password === 'string' && credentials.password ? credentials : null;
  } catch { return null; }
}
// One shared recovery controller serializes sign-ins and limits failed attempts.
export function createSessionRecovery({readCredentials=localCredentials, now=Date.now, cooldownMs=300000}={}) {
  let nextAttempt = 0;
  let inFlight;
  async function recover(page) {
    if (!isLoginPage(page.url())) return true;
    if (now() < nextAttempt) return false;
    const credentials = await readCredentials();
    if (!credentials) { nextAttempt = now() + cooldownMs; return false; }
    nextAttempt = now() + cooldownMs;
    // Credentials are only filled into the verified supplier login page.
    if (!isLoginPage(page.url())) return true;
    const username = page.locator('input#username[type="text"]');
    const password = page.locator('input#password[type="password"]');
    const submit = page.locator('input#input_login_submit[type="submit"]');
    for (const control of [username,password,submit]) {
      if (await control.count() !== 1 || !await control.isVisible()) throw Error('SUPPLIER_LOGIN_FORM_CHANGED');
    }
    const safeForm = await password.evaluate(el => {
      const form = el.form;
      return !!form && form.method.toLowerCase() === 'post' && new URL(form.action).origin === 'https://esp.thevirtualwarehouse.co.uk' && /^\/Account\/LogOn\/?$/i.test(new URL(form.action).pathname);
    });
    if (!safeForm) throw Error('SUPPLIER_LOGIN_FORM_CHANGED');
    await username.fill(credentials.username);
    await password.fill(credentials.password);
    const remember = page.locator('input#rememberMe[type="checkbox"]');
    if (await remember.count() === 1) await remember.check();
    await submit.click();
    try { await page.waitForURL(url => url.origin === SUPPLIER_ORIGIN && !/^\/Account\/LogOn\/?$/i.test(url.pathname), {timeout:10000}); }
    catch { return false; }
    return !isLoginPage(page.url());
  }
  return async page => {
    if (!isLoginPage(page.url())) return true;
    if (inFlight) { await inFlight; return !isLoginPage(page.url()); }
    inFlight = recover(page);
    try { return await inFlight; } finally { inFlight = null; }
  };
}
