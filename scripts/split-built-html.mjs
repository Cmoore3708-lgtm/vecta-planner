import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const htmlPath=path.resolve('dist/index.html');
const assetsDir=path.resolve('dist/assets');
let html=fs.readFileSync(htmlPath,'utf8');
let scriptNumber=0;
const written=[];

html=html.replace(/<script([^>]*)>([\s\S]*?)<\/script>/gi,(whole,attributes,source)=>{
  scriptNumber+=1;
  if(Buffer.byteLength(source)<100000||/\bsrc\s*=/.test(attributes))return whole;
  /* Content hashes are essential: the Workshop service worker deliberately keeps
     offline assets, so fixed filenames can leave a browser running old Fleet code
     after a successful deployment. */
  const hash=crypto.createHash('sha256').update(source).digest('hex').slice(0,10);
  const filename=`vecta-inline-${String(scriptNumber).padStart(2,'0')}-${hash}.js`;
  fs.mkdirSync(assetsDir,{recursive:true});
  fs.writeFileSync(path.join(assetsDir,filename),`${source.trim()}\n`);
  written.push(filename);
  return `<script${attributes} src="/assets/${filename}"></script>`;
});

if(written.length!==3)throw new Error(`Expected to extract 3 large inline scripts, extracted ${written.length}`);
// Give Haynes helpers and stylesheets the same cache-safe treatment.
for(const name of ['haynes-job-tools.js','haynes-job-tools.css','haynes-service-sheet.js','haynes-service-sheet.css','vecta-vehicle-image.js','vecta-fleet-images.js','vecta-fleet-images.css']){
  const source=fs.readFileSync(path.resolve('dist/js',name));
  const hash=crypto.createHash('sha256').update(source).digest('hex').slice(0,10);
  const ext=path.extname(name),filename=`${path.basename(name,ext)}-${hash}${ext}`;
  fs.mkdirSync(assetsDir,{recursive:true});
  fs.writeFileSync(path.join(assetsDir,filename),source);
  html=html.replaceAll(`/js/${name}`,`/assets/${filename}`);
}
fs.writeFileSync(htmlPath,html);
console.log(JSON.stringify({indexBytes:Buffer.byteLength(html),extractedScripts:written}));
