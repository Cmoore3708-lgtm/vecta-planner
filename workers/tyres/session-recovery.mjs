// Supplier login is optional, encrypted by Windows and scoped to this origin.
// No account details or browser content are included in logs or relay results.
export function createSessionRecovery({supplier,username='',password='',now=Date.now,cooldownMs=30*60*1000}={}){
 const origin=new URL(supplier).origin;let lastAttempt=-Infinity;
 const isLogin=page=>new URL(page.url()).origin===origin&&/\/Account\/LogOn/i.test(page.url());
 async function ensure(page){
  await page.goto(supplier,{waitUntil:'domcontentloaded',timeout:15000});
  if(new URL(page.url()).origin!==origin)throw Error('SUPPLIER_LOGIN_REQUIRED');
  if(!isLogin(page))return;
  // A fresh navigation can restore a valid cookie session without credentials.
  if(!username||!password||now()-lastAttempt<cooldownMs)throw Error('SUPPLIER_LOGIN_REQUIRED');
  const user=page.locator('input[name="UserName"],input[name="Username"],input[name="username"],input[autocomplete="username"]');
  const pass=page.locator('input[type="password"]');
  const submit=page.getByRole('button',{name:/^(?:log\s*in|sign\s*in)$/i});
  if(await user.count()!==1||await pass.count()!==1||await submit.count()!==1||!await user.isVisible()||!await pass.isVisible())throw Error('SUPPLIER_LOGIN_REQUIRED');
  // One attempt per cooldown, shared by all lookups. Never repeat a bad password.
  lastAttempt=now();await user.fill(username);await pass.fill(password);
  await submit.click({timeout:10000});
  await page.waitForURL(url=>url.origin===origin&&!/\/Account\/LogOn/i.test(url.pathname),{timeout:15000}).catch(()=>{});
  if(new URL(page.url()).origin!==origin||isLogin(page))throw Error('SUPPLIER_LOGIN_REQUIRED');
 }
 return {ensure};
}
export function timeout(promise,ms,label='LOOKUP_TIMEOUT'){
 let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),ms);})]).finally(()=>clearTimeout(timer));
}
