import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
export const bookingSource='website/booking/index.html';
export const bookingOutput='public/booking.html';
export function syncBookingPage({check=false}={}){
 const source=fs.readFileSync(bookingSource),output=fs.existsSync(bookingOutput)?fs.readFileSync(bookingOutput):null;
 if(output?.equals(source))return false;
 if(check)throw Error('Booking pages differ. Edit website/booking/index.html, then run node scripts/sync-booking-page.mjs.');
 fs.writeFileSync(bookingOutput,source);return true;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{if(process.argv.slice(2).some(arg=>arg!=='--check'))throw Error('Usage: sync-booking-page.mjs [--check]');console.log(syncBookingPage({check:process.argv.includes('--check')})?'Updated generated Workshop booking page.':'Booking pages match the shared source.');}
 catch(error){console.error(error.message);process.exitCode=1;}
}
