import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2] || 'index.html';
const names = [
  'vectaMissingColumns',
  'vectaRememberMissingColumn',
  'vectaStripKnownMissingColumns',
  'jobVehicleDueItem',
  'jobVehicleDuePanelHtml',
  'updateJobRegistrationDueAlert',
  'updateJobVehicleDuePanel',
  'knownRegistrationDetails',
  'openVehicleFromReg',
  'knownVehicles',
  'knownCustomers',
  'customerSearchRows',
  'openCustomerDetails',
  'vehicleRows'
];

let source = readFileSync(file, 'utf8');
if (source.length < 1_800_000) {
  throw new Error(`Safety stop: ${file} is unexpectedly small (${source.length} characters)`);
}

for (const token of [
  'VECTA IO-GUARD 2026-09-04',
  'function scheduleCloudRefresh(payload)',
  'persistMainSettings',
  'fleetMotAuthorityLastPersisted',
  'fleetCloudLastPersistedPayload',
  'vecta_legacy_local_only'
]) {
  if (!source.includes(token)) throw new Error(`Safety stop: missing ${token}`);
}

function declarationStarts(text, name) {
  const pattern = new RegExp(`function\\s+${name}\\s*\\(`, 'g');
  return [...text.matchAll(pattern)].map(match => match.index);
}

function functionEnd(text, start) {
  const open = text.indexOf('{', start);
  if (open < 0) throw new Error(`Could not find function body at ${start}`);
  let depth = 0;
  let quote = '';
  let lineComment = false;
  let blockComment = false;
  let escaped = false;

  for (let i = open; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1] || '';
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') { blockComment = false; i += 1; }
      continue;
    }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') { lineComment = true; i += 1; continue; }
    if (char === '/' && next === '*') { blockComment = true; i += 1; continue; }
    if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  throw new Error(`Could not find function end at ${start}`);
}

function replaceFunction(text,name,replacement){
  const starts=declarationStarts(text,name);
  if(starts.length!==1)throw new Error(`Safety stop: expected one ${name} definition before extraction, found ${starts.length}`);
  const start=starts[0],end=functionEnd(text,start);
  return text.slice(0,start)+replacement+text.slice(end);
}

let removed = 0;
for (const name of names) {
  const starts = declarationStarts(source, name);
  if (starts.length === 1) continue;
  if (starts.length !== 2) {
    throw new Error(`Safety stop: expected one or two ${name} definitions, found ${starts.length}`);
  }
  const start = starts[0];
  let end = functionEnd(source, start);
  if (source[end] === '\r') end += 1;
  if (source[end] === '\n') end += 1;
  source = source.slice(0, start) + source.slice(end);
  if (declarationStarts(source, name).length !== 1) {
    throw new Error(`Safety stop: ${name} did not resolve to one definition`);
  }
  removed += 1;
}

const moduleTag='<script src="/js/vecta-job-rules.js"></script>';
if(!source.includes(moduleTag)){
  const mainMarker="<script>\n(function(){\n'use strict';\nvar VERSION='v41.23-job-card-due-dates';";
  if(!source.includes(mainMarker))throw new Error('Safety stop: main application script marker was not found');
  source=source.replace(mainMarker,moduleTag+'\n'+mainMarker);
  const wrappers={
    vectaSoftDeleteMeta:"function vectaSoftDeleteMeta(job){return window.VectaJobRules.softDeleteMeta(job)}",
    isSoftDeletedJob:"function isSoftDeletedJob(job){return window.VectaJobRules.isSoftDeleted(job)}",
    vectaJobIsDeletedForLists:"function vectaJobIsDeletedForLists(job){return window.VectaJobRules.isDeleted(job,{terminalState:function(id){return typeof vectaTerminalJobState==='function'?vectaTerminalJobState(id):null},isTombstone:function(id){return typeof vectaIsDeletedJobTombstone==='function'&&vectaIsDeletedJobTombstone(id)}})}"
  };
  for(const [name,replacement] of Object.entries(wrappers))source=replaceFunction(source,name,replacement);
}

writeFileSync(file, source, 'utf8');
console.log(`Protected maintenance complete; removed ${removed} overridden function definitions`);
