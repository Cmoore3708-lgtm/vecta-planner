import { HaynesError } from '../../lib/haynes-vehicle.js';
import { readVehicle } from './dom.mjs';
import { windowsLogin } from './saved-login.mjs';

const origin = 'https://www.workshopdata.com';
const loginPath = '/touch/site/layout/wsdLogin';
export const START = origin + '/touch/site/layout/makesOverview';
function loginPage(page) {
  try { const url = new URL(page.url()); return url.origin === origin && url.pathname === loginPath; }
  catch { return false; }
}

// Runs in the page. Check the displayed form and its exact effective POST
// destination in the same operation that fills it. Never touch the Preview form.
function submitLogin({ credentials, endpoint }) {
  if (location.origin + location.pathname !== endpoint || window.top !== window) return false;
  const user = document.querySelector('#loginContent input#username[name=username]');
  const form = user?.form;
  const pass = form?.querySelector('input#password[name=password][type=password]');
  const submit = form?.querySelector('input[type=submit][name=submit]');
  if (!form || form.action !== endpoint || form.method !== 'post' ||
      form.target && form.target !== '_self' || ![user,pass,submit].every(el => el?.getClientRects().length && !el.disabled) ||
      ['formaction','formmethod','formtarget'].some(attr => submit.hasAttribute(attr))) return false;
  user.value = credentials.username;
  pass.value = credentials.password;
  const remember = form.querySelector('input[type=checkbox][name=savePassword]');
  if (remember) remember.checked = true;
  form.requestSubmit(submit);
  return true;
}

async function inspect(page) {
  const data = await page.evaluate(readVehicle);
  if (data.blocked) throw new HaynesError('VERIFICATION_REQUIRED');
  return data;
}

export function createHaynesSession({ loadLogin = windowsLogin, waitMs = 6000 } = {}) {
  let signingIn = null;
  async function renew(page) {
    await inspect(page);
    // A different tab may already have renewed the shared Edge session.
    await page.goto(START, { waitUntil: 'domcontentloaded', timeout: 6000 });
    const initial = await inspect(page);
    if (!initial.login && !loginPage(page) && initial.searchReady) return;
    if (!initial.login || !loginPage(page)) throw new HaynesError('LOGIN_REQUIRED');
    const saved = await loadLogin();
    if (!saved || !await page.evaluate(submitLogin, { credentials: saved.credentials, endpoint: origin + loginPath })) {
      throw new HaynesError('LOGIN_REQUIRED');
    }
    const until = Date.now() + waitMs;
    do {
      try {
        const state = await inspect(page);
        if (!state.login && state.searchReady && new URL(page.url()).origin === origin && !loginPage(page)) {
          await saved.confirmed();
          return;
        }
      } catch (error) {
        if (!/Execution context was destroyed|Cannot find context/i.test(error.message)) throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (Date.now() < until);
    throw new HaynesError('LOGIN_REQUIRED');
  }
  return async function withSession(page, operation) {
    try {
      const result = await operation();
      if (!loginPage(page)) return result;
    } catch (error) {
      if (error.code === 'VERIFICATION_REQUIRED' || !loginPage(page)) throw error;
    }
    // The exact sign-in page is the only reason to replay a read. The first
    // caller owns recovery; another caller reopens its own registration after it.
    try {
      signingIn ??= renew(page).finally(() => { signingIn = null; });
      await signingIn;
    } catch (error) {
      // Never pass PowerShell output, form data or browser errors to the relay.
      throw new HaynesError(error.code === 'VERIFICATION_REQUIRED' ? error.code : 'LOGIN_REQUIRED');
    }
    const result = await operation();
    if (loginPage(page)) throw new HaynesError('LOGIN_REQUIRED');
    return result;
  };
}
export const withHaynesSession = createHaynesSession();
