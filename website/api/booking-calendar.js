// Public calendar export contains no database access or customer contact details.
export default function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const q=req.query||{};
 if(Object.values(q).some(v=>typeof v!=='string'))return res.status(400).json({error:'Invalid calendar details'});
 const registration=String(q.registration||'').toUpperCase().replace(/[^A-Z0-9 ]/g,'').slice(0,12);
 const work=String(q.work||'Vehicle booking').replace(/[\r\n]/g,' ').slice(0,200);
 const state={form:{registration,vehicle:'',job_types:[work],work_required:''}};
 function calendarEscape(value){return String(value||'').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');}
function bookingCalendarContent(date,requestId){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return '';
 const start=new Date(date+'T00:00:00Z');if(!Number.isFinite(start.getTime())||start.toISOString().slice(0,10)!==date)return '';
 const end=new Date(start);end.setUTCDate(end.getUTCDate()+1);
 const f=state.form,work=f.job_types.map(type=>type==='Service'?(f.service_choice||type):type==='Other'?'Something else':type).join(', ');
 const description=[f.vehicle,work,f.work_required,f.job_types.includes('Tyres')?`Tyres: ${f.tyre_size} · ${f.tyre_choice} · Quantity ${f.tyre_quantity||1}`:'','Please drop your car off before you start your shift.','Before 8 am: park in a workshop parking bay and leave your keys through the key-drop letterbox.','Directions: https://maps.app.goo.gl/M3d34Pt96byKtDQV6?g_st=ic'].filter(Boolean).join('\n');
 const compact=value=>value.replace(/-/g,''),uid=String(requestId||f.registration+'-'+date).replace(/[^a-zA-Z0-9_.-]/g,'_');
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Vecta Motors//Booking//EN','CALSCALE:GREGORIAN','BEGIN:VEVENT','UID:'+uid+'@vectamotors.co.uk','DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z'),'DTSTART;VALUE=DATE:'+compact(date),'DTEND;VALUE=DATE:'+compact(end.toISOString().slice(0,10)),'SUMMARY:'+calendarEscape('Vecta Motors · '+f.registration+' · '+work),'LOCATION:'+calendarEscape('Vecta Motors, Contractors Compound, Nissan Sunderland'),'DESCRIPTION:'+calendarEscape(description),'STATUS:CONFIRMED','TRANSP:TRANSPARENT','END:VEVENT','END:VCALENDAR'];
 // Fold at 75 UTF-8 bytes so long vehicle/work descriptions import correctly.
 const fold=line=>{let output='',row='',bytes=0;for(const char of line){const size=encodeURIComponent(char).replace(/%[A-F\d]{2}|./gi,'x').length;if(bytes+size>75){output+=row+'\r\n';row=' ';bytes=1;}row+=char;bytes+=size;}return output+row;};
 return lines.map(fold).join('\r\n')+'\r\n';
}

 const calendar=bookingCalendarContent(q.date,String(q.id||'').slice(0,80));
 if(!calendar)return res.status(400).json({error:'Invalid booking date'});
 res.setHeader('Content-Type','text/calendar; charset=utf-8');
 res.setHeader('Content-Disposition','attachment; filename="Vecta-'+registration.replace(/ /g,'')+'-'+q.date+'.ics"');
 return res.status(200).send(calendar);
}
