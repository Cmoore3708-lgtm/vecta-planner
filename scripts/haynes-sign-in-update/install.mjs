import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { patchSupervisor, patchTyreStartup } from './managed-repair.mjs';

const run = promisify(execFile);
const hash = data => createHash('sha256').update(data).digest('hex');
const expected = {
  'dom.mjs': 'dc0beadf1508faf2d02922d01d5d64246dbc1c20e047f0d709a5e096dc2a1c54',
  'vehicle-browser.mjs': '7c833e9ca02f9965f74df5fbe9e9f58c567f4637e31558e851b9f491457493ff',
  'service-browser.mjs': 'c3ae0689c3e4c0c247184864adc48319633e79d2691102e69a633a366e2485b1'
};
const patches = [...Object.keys(expected),'session-recovery.mjs','saved-login.mjs','save-login.ps1'];
const hashText = bytes => hash(bytes.toString('utf8').replaceAll('\r\n','\n'));
const patchDir = path.dirname(fileURLToPath(import.meta.url));

// Only stage distributable source files, as accepted by the installed release
// store. Pairing, credentials and private runtime files live outside releases.
async function sourceFiles(source) {
  const files = new Map([['package.json',await fs.readFile(path.join(source,'package.json'))]]);
  for (const folder of ['lib','workers/control','workers/haynes','workers/gsf','workers/tyres','workers/repair-quotes']) {
    for (const entry of await fs.readdir(path.join(source,folder), {withFileTypes:true})) {
      const accepted = folder === 'lib' ? /^[\w-]+\.(?:js|mjs)$/ : /^[\w-]+\.(?:js|mjs|json|ps1)$/;
      if (!accepted.test(entry.name)) continue;
      if (!entry.isFile()) throw Error('Unexpected release entry: ' + entry.name);
      const name = folder + '/' + entry.name;
      files.set(name,await fs.readFile(path.join(source,name)));
    }
  }
  return files;
}
async function prepare(source, staged) {
  for (const folder of ['haynes','tyres','gsf']) {
    const relative = path.join('workers', folder, 'node_modules');
    await fs.cp(path.join(source,relative), path.join(staged,relative), { recursive:true, dereference:true });
  }
  for (const name of ['workers/control/supervisor.mjs','workers/tyres/live-worker.mjs']) {
    await run(process.execPath,['--check',path.join(staged,name)],{windowsHide:true});
  }
  for (const name of ['service-browser.mjs','vehicle-browser.mjs']) {
    const url = pathToFileURL(path.join(staged,'workers','haynes',name)).href;
    await run(process.execPath,['--input-type=module','--eval','await import('+JSON.stringify(url)+')'],{windowsHide:true});
  }
}
export async function install(root) {
  const state = JSON.parse((await fs.readFile(path.join(root,'state.json'),'utf8')).replace(/^\uFEFF/,''));
  if (state.format !== 1 || !/^[a-f0-9]{40}$/.test(state.active)) throw Error('Unrecognised VECTA Workers installation.');
  const source = path.join(root,'releases',state.active);
  const control = name => import(pathToFileURL(path.join(source,'workers','control',name)).href);
  const { withLock } = await control('release-cli.mjs');
  const { readState, assertWorkersStopped, stageRelease, activate } = await control('release-store.mjs');
  return withLock(root, async () => {
    const current = await readState(root);
    if (current.active !== state.active) throw Error('Another update changed the installed version. Run setup again.');
    await assertWorkersStopped(root);
    const files = await sourceFiles(source);
    for (const name of patches) {
      const key = 'workers/haynes/' + name;
      const replacement = await fs.readFile(path.join(patchDir,key));
      const previous = files.get(key);
      if (previous && hashText(previous) === hashText(replacement)) continue;
      if (previous ? hashText(previous) !== expected[name] : expected[name]) {
        throw Error('Installed ' + name + ' differs from the supported version. The active workers were kept.');
      }
      files.set(key,replacement);
    }
    for (const [key, repair] of [
      ['workers/control/supervisor.mjs',patchSupervisor],
      ['workers/tyres/live-worker.mjs',patchTyreStartup]
    ]) {
      const installed = files.get(key);
      if (!installed) throw Error('Installed worker file missing: ' + key);
      files.set(key,Buffer.from(repair(installed.toString('utf8'))));
    }
    for (const key of ['workers/control/recovery-status.mjs','workers/tyres/open-supplier.mjs']) {
      const bytes = await fs.readFile(path.join(patchDir,key));
      if (files.has(key) && hashText(files.get(key)) !== hashText(bytes)) throw Error('Unrecognised installed helper: ' + key);
      files.set(key,bytes);
    }
    const entries = Array.from(files).sort(([a],[b]) => a.localeCompare(b)).map(([name,bytes]) => ({
      path:name, size:bytes.length, sha256:hash(bytes), content:bytes.toString('base64')
    }));
    const version = hash(JSON.stringify({ kind:'haynes-sign-in-v1', files:entries })).slice(0,40);
    if (version === current.active) return 'Haynes sign-in and tyre recovery are already installed.';
    if (current.blocked?.includes(version)) throw Error('This release was rolled back. Existing workers were kept.');
    const bytes = gzipSync(JSON.stringify({format:1,version,files:entries}));
    await stageRelease(root,bytes,{prepare:directory => prepare(source,directory)});
    await activate(root,version);
    return 'Haynes sign-in and tyre recovery installed.';
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(await install(path.resolve(process.argv[2]))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
