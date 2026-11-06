// Managed installations contain supplier- and PC-specific updates which can
// predate or postdate Main. Replace only the two known statements in those
// installed sources. Fail before activation if an unknown variant is present.
function replaceOnce(text, before, after, name) {
  const index = text.indexOf(before);
  if (index < 0 || text.indexOf(before, index + before.length) !== -1)
    throw Error('Unrecognised ' + name + '. The installed version was kept.');
  return text.slice(0,index) + after + text.slice(index + before.length);
}

function patch(text, before, after, extraImport, name) {
  text = text.replaceAll('\r\n','\n');
  if (text.includes(extraImport)) {
    if (!text.includes(after) || text.includes(before)) throw Error('Incomplete ' + name + ' repair.');
    return text;
  }
  return extraImport + '\n' + replaceOnce(text, before, after, name);
}

const oldWriter = `  const writeRecovery=(state,reason)=>{
    const file=statusFile+'.supervisor.tmp';
    fs.writeFileSync(file,JSON.stringify({name:env.VECTA_WORKER_NAME||'Worker',pid:process.pid,state,reason,attentionReason,updatedAt:new Date().toISOString()}));
    fs.renameSync(file,statusFile);
  };`;
const newWriter = `  const publishRecovery = recoveryStatusWriter(statusFile, log);
  const writeRecovery = (state, reason) => publishRecovery({
    name:env.VECTA_WORKER_NAME || 'Worker', pid:process.pid, state, reason,
    attentionReason, updatedAt:new Date().toISOString()
  });`;

export function patchSupervisor(source) {
  return patch(source, oldWriter, newWriter,
    "import { recoveryStatusWriter } from './recovery-status.mjs';", 'worker supervisor');
}
export function patchTyreStartup(source) {
  return patch(source,'await page.goto(SUPPLIER,{timeout:20000});','await openTyreSupplier(page, SUPPLIER);',
    "import { openTyreSupplier } from './open-supplier.mjs';", 'tyre worker startup');
}
