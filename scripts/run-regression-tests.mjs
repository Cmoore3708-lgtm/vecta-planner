import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const files=readdirSync(new URL('../tests/regression/',import.meta.url)).filter(name=>/\.test\.(?:js|mjs|cjs)$/.test(name)).sort().map(name=>'tests/regression/'+name);
if(!files.length)throw Error('No regression tests found');
const result=spawnSync(process.execPath,['--test',...files],{stdio:'inherit',cwd:new URL('../',import.meta.url)});
if(result.error)throw result.error;
process.exit(result.status??1);
