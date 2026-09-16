import fs from 'node:fs';
import path from 'node:path';

const htmlPath=path.resolve('dist/index.html');
const assetsDir=path.resolve('dist/assets');
let html=fs.readFileSync(htmlPath,'utf8');
let scriptNumber=0;
const written=[];

html=html.replace(/<script([^>]*)>([\s\S]*?)<\/script>/gi,(whole,attributes,source)=>{
  scriptNumber+=1;
  if(Buffer.byteLength(source)<100000||/\bsrc\s*=/.test(attributes))return whole;
  const filename=`vecta-inline-${String(scriptNumber).padStart(2,'0')}.js`;
  fs.mkdirSync(assetsDir,{recursive:true});
  fs.writeFileSync(path.join(assetsDir,filename),`${source.trim()}\n`);
  written.push(filename);
  return `<script${attributes} src="/assets/${filename}"></script>`;
});

if(written.length!==3)throw new Error(`Expected to extract 3 large inline scripts, extracted ${written.length}`);
fs.writeFileSync(htmlPath,html);
console.log(JSON.stringify({indexBytes:Buffer.byteLength(html),extractedScripts:written}));
