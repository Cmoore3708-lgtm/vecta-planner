import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {canonicalBrand} from '../workers/tyres/tiers.mjs';
import {parseSize} from '../workers/tyres/guide.mjs';

const secret=()=>process.env.GSF_SERVICE_QUOTE_SECRET;
const key=value=>{if(typeof value!=='string'||value.length<32)throw Error('TYRE_COST_KEY_UNAVAILABLE');return createHash('sha256').update('vecta-tyre-cost-v1:'+value).digest();};
const aad=Buffer.from('vecta-tyre-cost-v1');
function seal(value,password){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(password),iv);cipher.setAAD(aad);
 const encrypted=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);
 return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
}
function open(token,password){
 if(typeof token!=='string'||token.length>3000||!/^[\w-]+$/.test(token))throw Error('INVALID_TYRE_COST');
 const bytes=Buffer.from(token,'base64url');if(bytes.length<29)throw Error('INVALID_TYRE_COST');
 const decipher=createDecipheriv('aes-256-gcm',key(password),bytes.subarray(0,12));decipher.setAAD(aad);decipher.setAuthTag(bytes.subarray(12,28));
 return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString());
}
// The customer receives only an authenticated, opaque receipt. Trade costs stay private.
export function attachTyreCosts(guide,catalogue,password=secret()){
 if(!password||password.length<32)return guide;
 const attach=choice=>{
  const rows=catalogue.filter(row=>row.size===guide.size&&canonicalBrand(row)===choice.brand&&row.model===choice.model&&row.unitPence===choice.unitPence&&row.defaultStockMinimum>=guide.quantity);
  // Ambiguous catalogue lines must never pick an arbitrary supplier cost.
  const values=new Set(rows.map(row=>Number.isSafeInteger(row.costNetPence)&&row.costNetPence>0&&row.costNetPence<=500000?row.costNetPence:null));
  const costNetPence=values.size===1?[...values][0]:null;
  return {...choice,costToken:seal({size:guide.size,quantity:guide.quantity,category:choice.category,brand:choice.brand,model:choice.model,unitPence:choice.unitPence,checkedAt:guide.checkedAt,costNetPence},password)};
 };
 return {...guide,options:guide.options.map(option=>{
  if(!option.available)return option;
  const choices=option.choices.map(attach);return {...option,...choices[0],choices};
 })};
}
export function bookingTyreParts(body,types,password=secret(),now=Date.now()){
 if(!types.some(type=>/^tyres$/i.test(type)))return [];
 const guide=body.tyre_guide,token=guide?.costToken;
 let saved=null;
 if(token){
  saved=open(token,password);
  const checked=Date.parse(saved.checkedAt);
  if(!Number.isFinite(checked)||now-checked>30*60*1000||checked>now+60000)throw Error('EXPIRED_TYRE_COST');
  for(const field of ['size','quantity','category','brand','model','unitPence'])if(saved[field]!==guide[field])throw Error('TYRE_COST_MISMATCH');
  if(saved.size!==parseSize(body.tyre_size).key||saved.quantity!==Number(body.tyre_quantity)||saved.category!==({'Budget':'budget','Mid Range':'midrange','Premium':'premium'}[body.tyre_choice]||body.tyre_choice)||(body.tyre_brand&&saved.brand!==body.tyre_brand))throw Error('TYRE_COST_MISMATCH');
  if(!Number.isInteger(saved.quantity)||saved.quantity<1||saved.quantity>4||!(saved.costNetPence===null||Number.isSafeInteger(saved.costNetPence)&&saved.costNetPence>0&&saved.costNetPence<=500000))throw Error('INVALID_TYRE_COST');
 }
 const quantity=saved?.quantity||Number(body.tyre_quantity);
 if(!Number.isInteger(quantity)||quantity<1||quantity>4)return [];
 const clean=value=>String(value||'').replace(/[\r\n\[\]]/g,' ').trim().slice(0,180);
 const label=saved?[saved.size,saved.brand,saved.model].join(' '):[clean(body.tyre_size),clean(body.tyre_brand)||clean(body.tyre_choice)].filter(Boolean).join(' ');
 const positions=Array.isArray(body.tyre_positions)?body.tyre_positions.map(clean).join(', '):'';
 const cost=saved?.costNetPence??null;
 return [{id:'tyre-booking',description:'Tyres · '+(label||'Specification to confirm')+(positions?' · '+positions:'')+(cost===null?' · Supplier cost unavailable':''),quantity,cost_price:cost===null?null:cost/100,ordered:false,arrived:false}];
}
