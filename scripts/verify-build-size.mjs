import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';

const html=fs.readFileSync('dist/index.html','utf8');
const source=fs.readFileSync('index.html','utf8');
const styles=text=>[...text.matchAll(/<(script|style)([^>]*)>([\s\S]*?)<\/\1>/gi)]
  .filter(match=>match[1].toLowerCase()==='style').map(match=>match[2]);
assert.deepEqual(styles(html),styles(source),'style element identity and cascade order must survive');
for(const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)){
  if(!/\bsrc\s*=|\btype\s*=/.test(match[1]))new vm.Script(match[2]);
}
const files=['index.html'];
for(const match of html.matchAll(/(?:src|href)="(\/assets\/([^"?]+)-([a-f0-9]{10})\.(js|css))"/g)){
  const file=match[1].slice(1),bytes=fs.readFileSync('dist/'+file);
  // Split scripts historically trim the transformed trailing newline.
  const digest=crypto.createHash('sha256').update(bytes).digest('hex').slice(0,10);
  assert.equal(digest,match[3],`content hash must identify ${file}`);
  if(match[4]==='js')new vm.Script(bytes.toString());
  if(file.startsWith('assets/vecta-inline-'))files.push(file);
}
assert.equal(files.length,4,'all three protected app scripts must remain linked');
let raw=0,gzip=0;
for(const file of files){const bytes=fs.readFileSync('dist/'+file);raw+=bytes.length;gzip+=gzipSync(bytes).length;}
assert.ok(raw<1_900_000,`main payload exceeded the 1.9 MB budget: ${raw}`);
assert.ok(gzip<400_000,`gzip main payload exceeded the 400 kB budget: ${gzip}`);
console.log(JSON.stringify({mainPayloadBytes:raw,mainPayloadGzipBytes:gzip,indexBytes:Buffer.byteLength(html)}));
