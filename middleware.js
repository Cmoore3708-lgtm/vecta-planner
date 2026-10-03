import { next } from '@vercel/functions';

// The public booking and approval pages share this deployment with Main.
// The mechanic dashboard is a separate Vercel project and is unaffected.
const PUBLIC_PATHS = new Set(['/booking', '/booking/', '/booking.html', '/approval.html']);
const PREVIEW_ADMIN_PATHS = new Set(['/admin.html', '/site-preview.html', '/booking-preview.html']);
const PUBLIC_PREFIXES = ['/api/', '/assets/', '/icons/', '/js/'];
const PUBLIC_FILES = new Set(['/favicon.ico', '/manifest.webmanifest', '/service-worker.js', '/supabase.min.js']);
const PUBLIC_WEBSITE_HOSTS = new Set(['www.vectamotors.co.uk', 'vectamotors.co.uk']);
const PUBLIC_WEBSITE_PATHS = new Set(['/', '/booking', '/booking/', '/privacy', '/terms', '/vecta-site-index.html', '/vecta-site-booking.html']);

function isPublicWebsiteRequest(request) {
  const url = new URL(request.url);
  return PUBLIC_WEBSITE_HOSTS.has(url.hostname.toLowerCase()) && PUBLIC_WEBSITE_PATHS.has(url.pathname);
}

export function requiresManagerLogin(pathname) {
  return !PUBLIC_PATHS.has(pathname)
    && !PUBLIC_FILES.has(pathname)
    && !PUBLIC_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

function matchesBasicCredentials(header, user, password) {
  if (!header || !header.startsWith('Basic ')) return false;
  try {
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(header.slice(6)), c => c.charCodeAt(0)));
    const separator = decoded.indexOf(':');
    if (separator < 0) return false;
    // Equal-length comparisons avoid leaking password prefixes via string comparison.
    const suppliedUser = decoded.slice(0, separator);
    const suppliedPassword = decoded.slice(separator + 1);
    let different = suppliedUser.length ^ user.length;
    for (let i = 0; i < Math.max(suppliedUser.length, user.length); i++) {
      different |= (suppliedUser.charCodeAt(i) || 0) ^ (user.charCodeAt(i) || 0);
    }
    different |= suppliedPassword.length ^ password.length;
    for (let i = 0; i < Math.max(suppliedPassword.length, password.length); i++) {
      different |= (suppliedPassword.charCodeAt(i) || 0) ^ (password.charCodeAt(i) || 0);
    }
    return different === 0;
  } catch {
    return false;
  }
}

export function managerGate(request, credentials) {
  const pathname = new URL(request.url).pathname;
  // Vercel Preview Authentication protects these Test-only Admin/preview pages.
  // Never bypass the manager gate for these paths in production.
  if (process.env.VERCEL_ENV === 'preview' && PREVIEW_ADMIN_PATHS.has(pathname)) return null;
  if (!requiresManagerLogin(pathname)) return null;

  const user = credentials.user;
  const password = credentials.password;
  if (!user || !password) {
    return new Response('Main access is not configured.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' }
    });
  }
  if (matchesBasicCredentials(request.headers.get('authorization'), user, password)) return null;

  return new Response('Manager sign-in required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="VECTA Main", charset="UTF-8"',
      'Cache-Control': 'no-store'
    }
  });
}

const SESSION_COOKIE = '__Host-vecta-manager';
const SESSION_SECONDS = 30 * 24 * 60 * 60;

async function sessionKey(credentials){
  return crypto.subtle.importKey('raw',new TextEncoder().encode(
    'VECTA manager session v1\n'+credentials.user+'\n'+credentials.password
  ),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}

function signatureBytes(hex){
  if(!/^[a-f0-9]{64}$/.test(hex)) return null;
  return Uint8Array.from(hex.match(/../g),part=>parseInt(part,16));
}

export async function managerSessionCookie(credentials,now=Date.now()){
  const expires=Math.floor(now/1000)+SESSION_SECONDS;
  const payload='v1.'+expires;
  const signature=await crypto.subtle.sign('HMAC',await sessionKey(credentials),new TextEncoder().encode(payload));
  const hex=Array.from(new Uint8Array(signature),b=>b.toString(16).padStart(2,'0')).join('');
  return SESSION_COOKIE+'='+payload+'.'+hex+'; Path=/; Max-Age='+SESSION_SECONDS+'; Secure; HttpOnly; SameSite=Strict';
}

export async function validManagerSession(request,credentials,now=Date.now()){
  if(!credentials.user || !credentials.password) return false;
  const cookies=String(request.headers.get('cookie')||'').split(';').map(value=>value.trim());
  const found=cookies.filter(value=>value.startsWith(SESSION_COOKIE+'='));
  if(found.length!==1) return false;
  const token=found[0].slice(SESSION_COOKIE.length+1);
  const match=/^v1\.([0-9]{10})\.([a-f0-9]{64})$/.exec(token);
  if(!match) return false;
  const expiry=Number(match[1]),current=Math.floor(now/1000);
  if(expiry<=current || expiry>current+SESSION_SECONDS) return false;
  try{
    return await crypto.subtle.verify('HMAC',await sessionKey(credentials),
      signatureBytes(match[2]),new TextEncoder().encode('v1.'+match[1]));
  }catch{ return false; }
}

export default async function middleware(request) {
  if (isPublicWebsiteRequest(request)) return next();
  const credentials = {
    user: process.env.VECTA_MAIN_USER,
    password: process.env.VECTA_MAIN_PASSWORD
  };
  const protectedPath=requiresManagerLogin(new URL(request.url).pathname);
  const remembered=protectedPath && await validManagerSession(request,credentials);
  const result = remembered ? null : managerGate(request,credentials);
  if (result) return result;
  const response = next();
  // Only a server-authorised Main response may become an offline planner.
  if (requiresManagerLogin(new URL(request.url).pathname)) {
    response.headers.set('X-Vecta-Manager-Authenticated', '1');
    response.headers.append('Set-Cookie',await managerSessionCookie(credentials));
  }
  return response;
}
