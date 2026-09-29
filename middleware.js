import { next } from '@vercel/functions';

// The public booking and approval pages share this deployment with Main.
// The mechanic dashboard is a separate Vercel project and is unaffected.
const PUBLIC_PATHS = new Set(['/booking', '/booking/', '/booking.html', '/approval.html']);
const PUBLIC_PREFIXES = ['/api/', '/assets/', '/icons/', '/js/'];
const PUBLIC_FILES = new Set(['/favicon.ico', '/manifest.webmanifest', '/service-worker.js', '/supabase.min.js']);

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

export default function middleware(request) {
  const result = managerGate(request, {
    user: process.env.VECTA_MAIN_USER,
    password: process.env.VECTA_MAIN_PASSWORD
  });
  return result || next();
}
