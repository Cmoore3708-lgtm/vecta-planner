import { next } from '@vercel/functions';

export const config = {
  matcher: ['/booking/:path*', '/booking.html', '/track/:path*', '/track.html', '/invoice/:path*', '/api/:path*']
};

const previewUnavailable = () => new Response('Use the matching Workshop Pro preview to test this booking.', {
  status: 503,
  headers: { 'Cache-Control': 'no-store' }
});

export default async function middleware(request) {
  if (process.env.VERCEL_ENV === 'production') return next();

  const url = new URL(request.url);
  // The standalone project's release probe is local. All booking APIs belong
  // to the paired workshop once the browser has moved to its preview.
  if (url.pathname === '/api/availability' && url.search === '?action=release' && request.method === 'GET') return next();
  if (url.pathname.startsWith('/api/') || !['GET', 'HEAD'].includes(request.method)) return previewUnavailable();

  const branch = /^vecta-website-git-([a-z0-9-]+)-vectaplanner\.vercel\.app$/.exec(process.env.VERCEL_BRANCH_URL || '');
  const commit = process.env.VERCEL_GIT_COMMIT_SHA;
  if (!branch || !/^[0-9a-f]{40}$/.test(commit || '')) return previewUnavailable();
  const origin = 'https://vecta-planner-git-' + branch[1] + '-vectaplanner.vercel.app';
  try {
    const probe = await fetch(origin + '/api/supabase-config?action=release', {
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000)
    });
    if (!probe.ok) return previewUnavailable();
    const release = await probe.json();
    if (release.application !== 'workshop' || release.environment !== 'preview' || release.commit !== commit) return previewUnavailable();
  } catch {
    return previewUnavailable();
  }

  const pathname = /^\/booking(?:\/|\.html|$)/.test(url.pathname) ? '/booking.html' : url.pathname;
  return new Response(null, {
    status: 307,
    headers: { Location: origin + pathname + url.search, 'Cache-Control': 'no-store' }
  });
}
