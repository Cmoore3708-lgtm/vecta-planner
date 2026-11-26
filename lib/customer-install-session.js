// iOS seeds a newly installed Home Screen app with the browser's cookies.
// Keep the existing revocable garage session and booking binding server-validated.
const sessionName='__Host-vecta-customer';
const bookingName='__Host-vecta-booking';
const lifetime=180*86400;
const cookie=(name,value)=>name+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+(value?lifetime:0);
function read(req,name){
 const prefix=name+'=';
 return String(req.headers?.cookie||'').split(';').map(value=>value.trim()).find(value=>value.startsWith(prefix))?.slice(prefix.length)||'';
}
export function installedSession(req){return read(req,sessionName);}
export function installedBooking(req){return read(req,bookingName);}
export function rememberInstall(res,session,booking=''){
 res.setHeader('Set-Cookie',[cookie(sessionName,session),cookie(bookingName,booking)]);
}
export function forgetInstallBooking(res){res.setHeader('Set-Cookie',cookie(bookingName,''));}
