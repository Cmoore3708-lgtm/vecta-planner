// A separate identity boundary: mechanic cookies never authorise Main or its APIs.
const COOKIE = '__Host-vecta-mechanic';
const MAX_AGE = 30 * 24 * 60 * 60;
export function isMechanicHost(host) {
  return ['vecta-mechanic-dashboard.vercel.app','vecta-mechanic-dashboard-vectaplanner.vercel.app'].includes(String(host||'').toLowerCase().split(':')[0]);
}
export function mechanicCredentials() {
  return {user:process.env.VECTA_MECHANIC_USER,password:process.env.VECTA_MECHANIC_PASSWORD};
}
async function key(credentials) {
  return crypto.subtle.importKey('raw',new TextEncoder().encode(
    'VECTA mechanic session v1\n'+credentials.user+'\n'+credentials.password
  ),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
function equal(a,b) {
  let diff=a.length^b.length;
  for(let i=0;i<Math.max(a.length,b.length);i++) diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
  return diff===0;
}
export async function mechanicAuthorised(request,credentials=mechanicCredentials(),now=Date.now()) {
  if(!credentials.user||!credentials.password)return false;
  const header=request.headers.get('authorization')||'';
  if(header.startsWith('Basic ')) {
    try {
      const value=new TextDecoder().decode(Uint8Array.from(atob(header.slice(6)),c=>c.charCodeAt(0)));
      const split=value.indexOf(':');
      if(split>=0&&equal(value.slice(0,split),credentials.user)&&equal(value.slice(split+1),credentials.password))return true;
    } catch { /* A malformed login is unauthorised. */ }
  }
  const cookies=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(COOKIE+'='));
  if(cookies.length!==1)return false;
  const match=/^v1\.([0-9]{10})\.([a-f0-9]{64})$/.exec(cookies[0].slice(COOKIE.length+1));
  if(!match)return false;
  const current=Math.floor(now/1000),expiry=Number(match[1]);
  if(expiry<=current||expiry>current+MAX_AGE)return false;
  try {
    return await crypto.subtle.verify('HMAC',await key(credentials),
      Uint8Array.from(match[2].match(/../g),x=>parseInt(x,16)),new TextEncoder().encode('v1.'+match[1]));
  } catch { return false; }
}
export async function mechanicCookie(credentials=mechanicCredentials(),now=Date.now()) {
  const payload='v1.'+(Math.floor(now/1000)+MAX_AGE);
  const bytes=await crypto.subtle.sign('HMAC',await key(credentials),new TextEncoder().encode(payload));
  const signature=Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
  return COOKIE+'='+payload+'.'+signature+'; Path=/; Max-Age='+MAX_AGE+'; Secure; HttpOnly; SameSite=Strict';
}
export async function mechanicGate(request,credentials=mechanicCredentials()) {
  const headers={'Cache-Control':'no-store'};
  if(!credentials.user||!credentials.password)return new Response('Mechanics access is not configured.',{status:503,headers});
  if(await mechanicAuthorised(request,credentials))return null;
  return new Response('Mechanics sign-in required.',{status:401,headers:{...headers,'WWW-Authenticate':'Basic realm="VECTA Mechanics", charset="UTF-8"'}});
}
