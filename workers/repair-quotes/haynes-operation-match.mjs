import {repairOperation,structuredRepairSelection} from '../../lib/repair-operation-catalogue.js';
const fail=detail=>{throw Object.assign(Error('LABOUR_REVIEW_REQUIRED'),{code:'LABOUR_REVIEW_REQUIRED',detail});};
const normal=value=>String(value||'').toLowerCase().replace(/\b([a-z]+)\s+s\b/g,'$1s').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
// A main replacement row must start with its operation ID. Follow-up increments
// are never an independent fitting time, even when the label/ID is the same.
export function parseHaynesReplacementRow(text){
 const match=String(text||'').trim().replace(/\s+/g,' ').match(/^([0-9][A-Z0-9]{9,23})\s+(Renew|Replace)\s+(?:the\s+)?(.+?)\s+(?:OE:\s*\S+\s+)?\+\s*(\d{1,2}[.,]\d{2})$/i);
 if(!match||match[1].length===17)return null;
 const label=match[3].trim();if(/\*/.test(label))return null;
 const hoursMilli=Math.round(Number(match[4].replace(',','.'))*1000);if(hoursMilli<=0||hoursMilli>100000)return null;
 return {operationId:match[1],operationLabel:match[2]+' the '+label,subject:normal(label),hoursMilli};
}
export function matchHaynesReplacement(snapshot,rawSelection){
 const selection=structuredRepairSelection(rawSelection),definition=repairOperation(selection.partId);
 if(snapshot?.unitHoursConfirmed!==true||!Array.isArray(snapshot.jobs))fail('HOURS_UNIT_NOT_CONFIRMED');
 const matches=[];
 for(const text of snapshot.jobs){
  const row=parseHaynesReplacementRow(text);if(!row)continue;
  // Remove only the explicitly chosen scope. Remaining words must name the
  // complete part: "alternator drive belt" cannot match "alternator".
  let subject=row.subject;
  const axleWords=subject.match(/\b(?:front|rear)\b/g)||[],sideWords=subject.match(/\b(?:left|right|both|all)\b/g)||[];
  if(selection.axle){if(!axleWords.length||axleWords.some(x=>x!==selection.axle))continue;}else if(axleWords.length)continue;
  if(selection.side==='both'){if(!sideWords.includes('both')||sideWords.some(x=>x!=='both'))continue;}
  else if(selection.side){if(!sideWords.length||sideWords.some(x=>x!==selection.side))continue;}
  else if(sideWords.length)continue;
  subject=subject.replace(/\b(?:front|rear|left|right|both|axle|side|the)\b/g,' ').replace(/\s+/g,' ').trim();
  // Transmission scope is an exact exception for a clutch assembly, not a
  // generic substring match for release bearings, cylinders or hydraulics.
  if(selection.partId==='clutch-kit')subject=subject.replace(/\s+manual transmission$/,'');
  if(!definition.nouns.some(noun=>normal(noun)===subject))continue;
  matches.push(row);
 }
 const unique=[...new Map(matches.map(row=>[row.operationId+'|'+row.hoursMilli,row])).values()];
 if(unique.length!==1)fail(unique.length?'MULTIPLE_REPLACEMENT_OPERATIONS':'EXACT_REPLACEMENT_NOT_FOUND');
 const {subject,...result}=unique[0];return {...result,scopeConfirmed:true,unit:'hours'};
}
