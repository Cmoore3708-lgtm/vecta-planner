import { copyFileSync } from 'node:fs';

copyFileSync('website/index.html','dist/vecta-site-index.html');
copyFileSync('website/booking/index.html','dist/vecta-site-booking.html');
