import fs from 'node:fs';
import path from 'node:path';

const files = [
  'index.html',
  'booking.html',
  'approval.html',
  'supabase.min.js',
  'service-worker.js',
  'manifest.webmanifest',
  'js/vecta-job-rules.js',
  'js/vecta-invoice-rules.js',
  'assets/vecta-header.png',
  'assets/vecta-180-BW_Lkc6O.png',
  'icons/vecta-512.png',
  'icons/vecta-192.png'
];

fs.rmSync('dist', { recursive: true, force: true });
for (const file of files) {
  const target = path.join('dist', file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(file, target);
}
console.log('Built isolated synthetic VECTA deployment.');
