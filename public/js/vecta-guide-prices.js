(function(root){
'use strict';
const bands=[
 {maxCc:1200,band:'Up to 1.2L',oil:80,full:140,major:195},
 {maxCc:1600,band:'1.3–1.6L',oil:85,full:155,major:210},
 {maxCc:2000,band:'1.7–2.0L',oil:90,full:165,major:220},
 {maxCc:2500,band:'2.1–2.5L',oil:95,full:180,major:230},
 {maxCc:3000,band:'2.6–3.0L',oil:105,full:195,major:250}
];
function defaults(){return bands.map(row=>({...row}));}
function validate(rows){
 if(!Array.isArray(rows)||rows.length!==bands.length)throw Error('Enter all five engine-size bands.');
 return bands.map((band,index)=>{
  const row=rows[index];if(!row||row.maxCc!==band.maxCc)throw Error('Engine-size bands cannot be changed.');
  const result={maxCc:band.maxCc,band:band.band};
  for(const key of ['oil','full','major']){
   const price=row[key];
   if(typeof price!=='number'||!Number.isFinite(price)||price<=0||price>10000||Math.abs(price*100-Math.round(price*100))>0.000001)throw Error('Each price must be between £0.01 and £10,000, with no more than two decimal places.');
   result[key]=price;
  }
  return result;
 });
}
function priceForCc(cc,rows=defaults()){
 cc=Number(cc);if(!Number.isFinite(cc)||cc<=0)return null;
 return rows.find(row=>cc<=row.maxCc)||{band:'Over 3.0L',individual:true};
}
let currentRows=null;
function current(){return currentRows;}
async function load(fetcher=root.fetch.bind(root)){
 const response=await fetcher('/api/service-guide-prices',{cache:'no-store',signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error('Website prices could not be loaded.');
 const data=await response.json();currentRows=validate(data.prices);return currentRows;
}
root.VectaGuidePrices={defaults,validate,priceForCc,current,load};
})(typeof window==='undefined'?globalThis:window);
