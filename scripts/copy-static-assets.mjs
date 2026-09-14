import fs from 'node:fs';
import path from 'node:path';

const files = [
  'index.html',
  'approval.html',
  'booking.html',
  'app.css',
  'service-worker.js',
  'supabase.min.js',
  'manifest.webmanifest',
  'assets/vecta-header.png',
  'assets/vecta-logo.webp',
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
  'js/vecta-planner-rules.js',
  'js/vecta-app.js'
];

fs.rmSync('dist', { recursive: true, force: true });

for (const file of files) {
  if (!fs.existsSync(file)) throw new Error(`Required static asset is missing: ${file}`);
  const destination = path.join('dist', file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(file, destination);
}

console.log(`Built ${files.length} canonical static assets into dist`);
