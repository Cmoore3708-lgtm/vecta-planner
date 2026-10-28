import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {dirname} from 'node:path';
export const bookingSource='website/booking/index.html';
export const bookingOutput='public/booking.html';
export function syncBookingPage({check=false}={}){
 const pairs=[[bookingSource,bookingOutput],['public/js/vecta-booking-updates.js','website/js/vecta-booking-updates.js'],['public/js/vecta-tyre-positions.js','website/js/vecta-tyre-positions.js'],['public/js/vecta-tyre-positions.css','website/js/vecta-tyre-positions.css'],['public/js/vecta-service-pricing.js','website/js/vecta-service-pricing.js'],['public/js/vecta-work-photos.js','website/js/vecta-work-photos.js'],['public/js/vecta-work-photos.css','website/js/vecta-work-photos.css'],['public/js/vecta-tyre-photo.js','website/js/vecta-tyre-photo.js'],['public/js/vecta-tyre-photo.css','website/js/vecta-tyre-photo.css'],['public/js/vecta-tyre-booking.js','website/js/vecta-tyre-booking.js'],['public/js/vecta-tyre-booking.css','website/js/vecta-tyre-booking.css'],['public/assets/tyre-guide-cutout.webp','website/assets/tyre-guide-cutout.webp'],['public/assets/tyre-axle-still.webp','website/assets/tyre-axle-still.webp'],['public/assets/tyre-axle-rolling.webp','website/assets/tyre-axle-rolling.webp']];
 for(const name of fs.readdirSync('public/assets/tyre-brands').filter(name=>name.endsWith('.png')))pairs.push(['public/assets/tyre-brands/'+name,'website/assets/tyre-brands/'+name]);
 const changed=pairs.filter(([source,output])=>!fs.existsSync(output)||!fs.readFileSync(output).equals(fs.readFileSync(source)));
 if(!changed.length)return false;
 if(check)throw Error('Booking pages or tyre assets differ. Run node scripts/sync-booking-page.mjs.');
 for(const [source,output]of changed){fs.mkdirSync(dirname(output),{recursive:true});fs.copyFileSync(source,output);}
 return true;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{if(process.argv.slice(2).some(arg=>arg!=='--check'))throw Error('Usage: sync-booking-page.mjs [--check]');console.log(syncBookingPage({check:process.argv.includes('--check')})?'Updated generated Workshop booking page.':'Booking pages match the shared source.');}
 catch(error){console.error(error.message);process.exitCode=1;}
}
