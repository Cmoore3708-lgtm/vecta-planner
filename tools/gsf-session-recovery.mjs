// GSF sign-in recovery. Only submit an existing browser-autofilled form on GSF origin.
// Never read, log, save, or transmit credentials; do not retry failed logins repeatedly.
const ORIGIN='https://trade.gsfcarparts.com';
export function createGsfRecovery({now=Date.now,cooldownMs=30*60*1000}={}){
 let lastAttempt=-Infinity;
 const isLogin=page=>{try{const u=new URL(page.url());return u.origin===ORIGIN&&/\/signin(?:[/?]|$)/i.test(u.pathname);}catch{return false;}};
 async function ensure(page){
  const u=new URL(page.url());
  if(u.origin!==ORIGIN)throw Error('LOGIN_REQUIRED');
  if(!isLogin(page))return true;
  if(now()-lastAttempt<cooldownMs)throw Error('LOGIN_REQUIRED');
  const user=page.locator('input[type="email"],input[autocomplete="username"],input[name="email"],input[name="username"],input[name="Email"]');
  const pass=page.locator('input[type="password"]');
  const submit=page.getByRole('button',{name:/^(?:sign\s*in|log\s*in)$/i});
  if(await user.count()!==1||await pass.count()!==1||await submit.count()!==1||!await user.isVisible()||!await pass.isVisible()||!await submit.isVisible())throw Error('LOGIN_REQUIRED');
  // The boolean result never exposes the credential values outside the browser.
  const filled=await page.evaluate(()=>{const u=document.querySelector('input[type="email"],input[autocomplete="username"],input[name="email"],input[name="username"],input[name="Email"]');const p=document.querySelector('input[type="password"]');return !!(u?.value?.trim()&&p?.value);});
  if(!filled)throw Error('LOGIN_REQUIRED');
  lastAttempt=now();
  await submit.click({timeout:10000});
  await page.waitForURL(url=>url.origin===ORIGIN&&!/\/signin(?:[/?]|$)/i.test(url.pathname),{timeout:15000}).catch(()=>{});
  if(isLogin(page)||new URL(page.url()).origin!==ORIGIN)throw Error('LOGIN_REQUIRED');
  return true;
 }
 return {ensure};
}
