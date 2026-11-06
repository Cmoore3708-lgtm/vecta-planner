import { next } from '@vercel/functions';

export const config = {
  matcher: ['/booking/:path*', '/booking.html', '/track/:path*', '/track.html', '/invoice/:path*', '/api/:path*']
};

const previewUnavailable = () => new Response('Use the matching Workshop Pro preview to test this booking.', {
  status: 503,
  headers: { 'Cache-Control': 'no-store' }
});

export default function middleware(request) {
  if (process.env.VERCEL_ENV === 'production') return next();

  const url = new URL(request.url);
  // The standalone project's release probe is local. All booking APIs belong
  // to the paired workshop once the browser has moved to its preview.
  if (url.pathname === '/api/availability' && url.search === '?action=release' && request.method === 'GET') return next();
  if (url.pathname.startsWith('/api/') || !['GET', 'HEAD'].includes(request.method)) return previewUnavailable();

  const branchUrl = process.env.VERCEL_BRANCH_URL;
  const branch = branchUrl
    ? /^vecta-website-git-([a-z0-9-]+)-vectaplanner\.vercel\.app$/.exec(branchUrl)?.[1]
    : (process.env.VERCEL_GIT_COMMIT_REF || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  const commit = process.env.VERCEL_GIT_COMMIT_SHA;
  if (!branch || !/^[0-9a-f]{40}$/.test(commit || '')) return previewUnavailable();
  const target = new URL('https://vecta-planner-git-' + branch + '-vectaplanner.vercel.app/api/supabase-config');
  const pathname = /^\/booking(?:\/|\.html|$)/.test(url.pathname) ? '/booking.html' : url.pathname;
  // Let the receiving deployment check its own commit and database. A browser
  // can complete deployment sign-in here without a server-to-server bypass.
  target.search = new URLSearchParams({action:'open-website-preview', commit, to:pathname + url.search}).toString();
  return new Response(null, {
    status: 307,
    headers: { Location: target.href, 'Cache-Control': 'no-store' }
  });
}
