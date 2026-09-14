import fs from 'node:fs';
import path from 'node:path';

const files = [
  'app.css',
  'service-worker.js',
  'supabase.min.js',
  'manifest.webmanifest',
  'assets/vecta-header.png',
  'icons/vecta-180.png',
  'icons/vecta-192.png',
  'icons/vecta-512.png',
  'icons/vecta-badge-96.png',
  'js/vecta-booking-rules.js',
  'js/vecta-finance-rules.js',
  'js/vecta-fleet-rules.js',
  'js/vecta-invoice-rules.js',
  'js/vecta-job-rules.js',
  'js/vecta-offline-sync-rules.js',
  'js/vecta-planner-rules.js'
];

for (const file of files) {
  if (!fs.existsSync(file)) throw new Error(`Required static asset is missing: ${file}`);
  const destination = path.join('dist', file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(file, destination);
}

console.log(`Copied ${files.length} required static assets into dist`);
