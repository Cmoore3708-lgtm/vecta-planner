// Screenshot-informed capture helper. Live Haynes DOM verification is pending.
// Captures the selected operation only; never persists page HTML or login data.
export function readAlternatorTime(doc=document){
 const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
 const nodes=[...doc.querySelectorAll('td,span,a,div')].filter(el=>clean(el.textContent)==='Renew the alternator'&&!el.querySelector('*'));
 if(nodes.length!==1)throw Error('LABOUR_REVIEW_REQUIRED');
 let node=nodes[0],matched=null;
 for(let depth=0;node&&depth<7;depth++,node=node.parentElement){
  const label=clean([...node.childNodes].map(child=>child.innerText||child.textContent).join(' '));if(label.length>300)break;
  const times=[...label.matchAll(/(?:^|\s)(\d{1,2}\.\d{2})(?=\s|$)/g)].map(m=>m[1]);
  if(times.length===1){matched={operationText:label,hoursText:times[0]};break;}
 }
 if(!matched)throw Error('LABOUR_REVIEW_REQUIRED');
 const unitsConfirmed=/TOTAL TIME\s*\(H\)/i.test(doc.body.textContent)||/Time is shown in hours and hundredths of hours/i.test(doc.body.textContent);
 if(!unitsConfirmed)throw Error('LABOUR_REVIEW_REQUIRED');
 const hoursMilli=Math.round(Number(matched.hoursText)*1000);
 if(hoursMilli<=0||hoursMilli>100000)throw Error('LABOUR_REVIEW_REQUIRED');
 const plate=doc.querySelector('#numberPlate,input[name="numberPlate"]');
 return {...matched,hoursMilli,unit:'hours',registrationVisible:String(plate?.value||'').toUpperCase().replace(/\s/g,''),fitmentConfirmed:false};
}
