(function(root){
 'use strict';
 // Catalogue-led: these are examples and grammar rules, never a parts whitelist.
 var examples=['Front brake pads','Rear brake discs','Alternator','Starter motor','Fuel pressure regulator','ABS sensor','Front left lower suspension arm','Door lock actuator','Air conditioning compressor'];
 var normal=function(value){return String(value||'').trim().replace(/\s+/g,' ');};
 var plural=function(word){return word.endsWith('ies')?word.slice(0,-3)+'y':word.endsWith('s')&&!/(ss|abs|gas)$/.test(word)?word.slice(0,-1):word;};
 function words(value){return normal(value).toLowerCase().replace(/[-/]/g,' ').split(/\s+/).filter(function(w){return !['the','a','an','and','of','for','with'].includes(w);}).map(plural);}
 function pattern(value){return words(value).map(function(w){return '(?=[\\s\\S]*\\b'+w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:s|es)?\\b)';}).join('');}
 function matchesDescription(description,query){
  var base=normal(description).split(/\s+[-–]\s+|\s*\(/)[0];
  var actual=words(base),wanted=words(query);
  if(wanted.join(' ')==='brake pad')actual=actual.filter(function(w){return w!=='set';});
  return actual.slice().sort().join(' ')===wanted.slice().sort().join(' ');
 }
 function resolve(work){
  var value=normal(work).replace(/[.!]$/,'').toLowerCase();
  if(!value||value.length>220||/[\n\r;]/.test(String(work))||/\b(?:if|diagnose|inspect|check|possibly|maybe|suspect|unless)\b/.test(value))return {status:'UNSUPPORTED_OPERATION'};
  value=value.replace(/^(?:(?:supply\s*(?:and|&)\s*fit|replace|fit|renew)\s+)(?:a |an |the )?/,'').replace(/^(?:a |an |the )/,'');
  value=value.replace(/\b(?:n\/?s|nearside)\b/g,'left').replace(/\b(?:o\/?s|offside)\b/g,'right').replace(/[–-]/g,' ');
  if(/(?:\band\b|[&,+])/.test(value)&&!(/\bkit\b/.test(value)))return {status:'UNSUPPORTED_OPERATION'};
  var count=value.match(/^(\d{1,2})\s+(?:x\s+)?/),quantity=count?Number(count[1]):null;
  if(count)value=value.slice(count[0].length);
  var axles=value.match(/\b(?:front|rear)\b/g)||[],sides=value.match(/\b(?:left|right)\b/g)||[];
  if(axles.length>1||sides.length>1)return {status:'POSITION_REQUIRED'};
  var axle=axles[0]||'',side=sides[0]||'';
  var part=normal(value.replace(/\b(?:front|rear|left|right)\b/g,'')).replace(/\s+/g,' ');
  if(!/^[a-z0-9][a-z0-9 /&()'.,+]*$/.test(part)||part.length<2||part.length>150||!/[a-z]/.test(part)||words(part).length>16)return {status:'UNSUPPORTED_OPERATION'};
  // Brake pads are sold as an axle set; discs are two individually priced parts.
  // Other catalogue quantities remain explicit and visible in the editor.
  var pads=/^(?:brake )?pads$/.test(part),discs=/^(?:brake )?(?:discs|disks|rotors)$/.test(part);
  if(pads)part='brake pads';if(discs)part='brake discs';
  if((pads||discs)&&!axle)return {status:'POSITION_REQUIRED',part:part,axle:'',side:side,quantity:discs?2:1};
  if((pads||discs)&&side)return {status:'AXLE_SCOPE_REQUIRED',part:part,axle:axle,side:side};
  quantity=quantity===null?(discs?2:1):quantity;
  if(quantity<1||quantity>20||pads&&quantity!==1||discs&&quantity!==2)return {status:'QUANTITY_REQUIRED',part:part,axle:axle,side:side};
  var label=[axle,side,part].filter(Boolean).join(' '),unit=pads?'axle set':discs?'disc':'item';
  return {status:'SUPPORTED',part:part,query:part,axle:axle,side:side,quantity:quantity,operation:part==='alternator'&&!axle&&!side&&quantity===1?'alternator-replacement':'catalogue-replacement',label:label,work:'Supply and fit '+(quantity!==1&&!discs?quantity+' ':'')+label,unit:unit};
 }
 function scope(part,axle,side,quantity){return resolve('Supply and fit '+(quantity?quantity+' ':'')+[axle,side,part].filter(Boolean).join(' '));}
 root.VectaRepairScope={examples:examples,resolve:resolve,scope:scope,words:words,pattern:pattern,matchesDescription:matchesDescription};
})(typeof globalThis!=='undefined'?globalThis:this);
