import {DOMParser} from 'linkedom';
const NS='http://www.w3.org/2000/svg';
const tags=new Set(['svg','g','defs','path','polygon','polyline','rect','circle','ellipse','line','linearGradient','radialGradient','stop','filter','feGaussianBlur','clipPath']);
const attributes=new Set(['id','d','points','viewBox','width','height','x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','fx','fy','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-miterlimit','fill-rule','clip-rule','opacity','fill-opacity','stroke-opacity','transform','gradientTransform','gradientUnits','offset','stop-color','stop-opacity','filter','clip-path','stdDeviation','color-interpolation-filters','display']);
// Supplier Illustrator exports contain executable fallback wrappers and an external
// DTD. Never execute them or pass the DTD to a renderer. Rebuild drawing primitives
// only, matching the established browser vehicle-image sanitiser.
export function sceneModelSvg(value){
 if(typeof value!=='string'||value.length>2000000)throw Error('Invalid model drawing');
 const start=value.indexOf('<svg');if(start<0)throw Error('No model drawing');
 const source=value.slice(start).replace(/&ns_([\w]+);/g,'urn:vecta-supplier:$1');
 const doc=new DOMParser().parseFromString(source,'image/svg+xml');
 if(doc.documentElement?.localName!=='svg')throw Error('Invalid model drawing');
 function copy(node){
  if(!tags.has(node.localName)&&node.localName!=='switch')return null;
  const next=doc.createElementNS(NS,node.localName==='switch'?'g':node.localName);
  for(const attr of node.attributes){
   const name=attr.name,value=attr.value;
   if(attributes.has(name)&&!/[<&]/.test(value)&&(!/url\s*\(/i.test(value)||/^url\(#[\w.-]+\)$/.test(value)))next.setAttribute(name,value);
   if(name==='style')for(const part of value.split(';')){const colon=part.indexOf(':'),property=part.slice(0,colon).trim(),setting=part.slice(colon+1).trim();if(attributes.has(property)&&/^(?:#[a-f\d]{3,8}|[\d.]+|none|sRGB|url\(#[\w.-]+\))$/i.test(setting))next.setAttribute(property,setting);}
  }
  for(const child of node.children){const safe=copy(child);if(safe)next.appendChild(safe);}
  return next;
 }
 const safe=copy(doc.documentElement);safe.setAttribute('xmlns',NS);return safe.outerHTML;
}
