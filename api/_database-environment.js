const PRODUCTION_PROJECT_REF = 'jywufozycuwuoshlulwl';
const TEST_PROJECT_REF = 'brqsejjykrubxuofavuu';
const TEST_PROJECT_URL = `https://${TEST_PROJECT_REF}.supabase.co`;
/* This is the browser-safe anonymous key for the isolated Test project. It is
   intentionally a fallback, not a secret: the same key is sent to every Test
   browser. Keeping the Test identity here prevents a missing Vercel Preview
   variable from silently switching the app to its stale embedded fleet. */
const TEST_PUBLISHABLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJycXNlamp5a3J1Ynh1b2ZhdnV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NTQyOTAsImV4cCI6MjEwMzIzMDI5MH0.P3Lonmn5yqe7uLDkk--KK9tHgz2AH2Xu70w1PAqObNs';

function cleanUrl(value) {
  return String(value || '').replace(/\/$/, '');
}

export function isPreviewEnvironment() {
  return process.env.VERCEL_ENV === 'preview';
}

export function isTestProject() {
  return isPreviewEnvironment()
    || /vecta-(?:workshop-pro-test|synthetic-test)/.test(String(process.env.VERCEL_PROJECT_PRODUCTION_URL || ''))
    || /^vecta-(?:workshop-pro-test|synthetic-test)(?:-|$)/.test(String(process.env.VERCEL_PROJECT_NAME || ''));
}

export function isAuditPreviewEnvironment() {
  const branch = String(process.env.VERCEL_GIT_COMMIT_REF || '');
  return isPreviewEnvironment() && /^audit\/system-simplification-v355$/i.test(branch);
}

export function databaseEnvironment({ requireService = false } = {}) {
  const preview = isPreviewEnvironment();
  const testProject = isTestProject();
  const url = cleanUrl(testProject
    ? (process.env.VECTA_TEST_SUPABASE_URL || TEST_PROJECT_URL)
    : (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL));
  const publishableKey = testProject
    ? (process.env.VECTA_TEST_SUPABASE_PUBLISHABLE_KEY || TEST_PUBLISHABLE_KEY)
    : (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY);
  const serviceKey = testProject
    ? process.env.VECTA_TEST_SUPABASE_SERVICE_ROLE_KEY
    : process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (testProject) {
    if (!url) throw new Error('Preview database is not configured. Live data access is blocked.');
    if (url.includes(PRODUCTION_PROJECT_REF)) {
      throw new Error('Safety lock: a Test deployment cannot use the production database.');
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
    preview,
    testProject
  };
}

export const productionProjectRef = PRODUCTION_PROJECT_REF;
export const testProjectRef = TEST_PROJECT_REF;
