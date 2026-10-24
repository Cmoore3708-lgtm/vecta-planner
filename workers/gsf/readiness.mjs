import {existsSync,mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
try {
  if(Number(process.versions.node.split('.')[0])<22)throw Error('Node.js 22 or newer is required.');
  if(process.platform!=='win32')throw Error('This setup package is for the Windows workshop PC.');
  const roots=[process.env['PROGRAMFILES(X86)'],process.env.PROGRAMFILES,process.env.LOCALAPPDATA].filter(Boolean);
  if(!roots.some(root=>existsSync(join(root,'Microsoft','Edge','Application','msedge.exe'))))throw Error('Microsoft Edge was not found. Install Edge before running the check.');
  if(!process.env.LOCALAPPDATA)throw Error('The Windows local app-data folder is unavailable.');
  const directory=join(process.env.LOCALAPPDATA,'VectaGSF');mkdirSync(directory,{recursive:true});
  const temporary=join(directory,'setup-check-'+randomUUID()+'.tmp');
  try {writeFileSync(temporary,'setup check',{flag:'wx'});}finally{if(existsSync(temporary))unlinkSync(temporary);}
  console.log('PASS: Node version, Microsoft Edge and local profile folder.');
} catch(error) {console.error(error.message);process.exitCode=1;}
