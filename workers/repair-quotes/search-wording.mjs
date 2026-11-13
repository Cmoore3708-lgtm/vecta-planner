import {repairScope} from '../../lib/repair-quote.js';
import {choiceId} from './choice-result.mjs';

// Suggestions are search terms, never confirmed fitment or labour. Derive
// alternatives from the selected supplier description, not a parts whitelist.
export function haynesWordingOptions(request,query,selectedPart){
 const normal=value=>String(value||'').replace(/\s+/g,' ').trim().toLowerCase();
 const identity=value=>repairScope.words(normal(value)).join(' ');
 const found=new Map(),failed=identity(query);
 const add=(value,detail)=>{
  const label=normal(value),key=identity(label);
  if(!label||label.length>150||key===failed||found.has(key)||!/[a-z]/i.test(label)||/[<>@\r\n]/.test(label))return;
  found.set(key,{id:choiceId('haynes-wording',request.registration,label),label,searchQuery:label,detail});
 };
 const description=normal(selectedPart?.description).split(/\s+[-–]\s+|\s*\(/)[0]
  .replace(/\b(?:front|rear)(?:\s+axle)?\b|\b(?:left|right|lh|rh|nearside|offside)\b/g,' ').replace(/\s+/g,' ').replace(/^[\s/,-]+|[\s/,-]+$/g,'').trim();
 if(description){
  const aliases=description.split(/\s*\/\s*/).filter(Boolean),detail='Alternative wording from the selected GSF part; search Haynes again';
  // Supplier shorthand such as "Wheel Speed / ABS Sensor" shares the
  // trailing noun. Keep the literal alternatives as well for confirmation.
  if(aliases.length>1){
   const finalWords=aliases.at(-1).split(' '),noun=finalWords.length>1?finalWords.at(-1):'';
   const abbreviations=String(selectedPart.description).match(/\b[A-Z]{2,6}\b/g)||[];
   for(const alias of aliases){
    const shared=noun&&(abbreviations.some(a=>a.toLowerCase()===alias)||finalWords.length===2&&abbreviations.some(a=>a.toLowerCase()===finalWords[0]));
    add(shared&&!alias.endsWith(noun)?alias+' '+noun:alias,detail);
   }
  }else add(description,detail);
 }
 const scope=repairScope.resolve(request.work);
 if(scope.status==='SUPPORTED')add(scope.query,'Your original part description; search Haynes again');
 return [...found.values()].slice(0,6);
}
