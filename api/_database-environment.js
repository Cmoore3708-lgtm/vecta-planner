const PRODUCTION_PROJECT_REF = 'jywufozycuwuoshlulwl';
const TEST_PROJECT_URL = 'https://rmbmbpqwvghxuyeykjhh.supabase.co';
const TEST_PUBLISHABLE_KEY = 'sb_publishable_g_Ey4NLLhW6aZye_bPZWlw_nE7Skh0z';

function cleanUrl(value) {
  return String(value || '').replace(/\/$/, '');
}

export function isPreviewEnvironment() {
  return process.env.VERCEL_ENV === 'preview';
}

export function databaseEnvironment({ requireService = false } = {}) {
  const preview = isPreviewEnvironment();
  const url = cleanUrl(preview
    ? (process.env.VECTA_TEST_SUPABASE_URL || TEST_PROJECT_URL)
    : (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL));
  const publishableKey = preview
    ? (process.env.VECTA_TEST_SUPABASE_PUBLISHABLE_KEY || TEST_PUBLISHABLE_KEY)
    : (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY);
  const serviceKey = preview
    ? process.env.VECTA_TEST_SUPABASE_SERVICE_ROLE_KEY
    : process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (preview) {
    if (!url) throw new Error('Preview database is not configured. Live data access is blocked.');
    if (url.includes(PRODUCTION_PROJECT_REF)) {
      throw new Error('Safety lock: a preview deployment cannot use the production database.');
    }
  }
  if (!url) throw new Error('Supabase URL is not configured.');
  if (requireService && !serviceKey) throw new Error('Supabase service access is not configured.');
  if (!requireService && !publishableKey && !serviceKey) throw new Error('Supabase public access is not configured.');

  return {
    url,
    publishableKey,
    serviceKey,
    key: requireService ? serviceKey : (serviceKey || publishableKey),
    preview
  };
}

export const productionProjectRef = PRODUCTION_PROJECT_REF;
