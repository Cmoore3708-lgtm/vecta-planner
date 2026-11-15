// Rebuild shortcut assets without changing either approved logo.
import {mkdir, readFile, writeFile, copyFile} from 'node:fs/promises';
import sharp from 'sharp';

const revision='20261115';
async function build(source,directory,prefix){
 await mkdir(directory,{recursive:true});
 const input=await readFile(source),frames=[];
 for(const size of [16,32,48,180,192,512]){
  const pipeline=sharp(input).resize(size,size).flatten({background:'#080808'}).toColourspace('srgb');
  const png=await pipeline.clone().png({compressionLevel:9}).toBuffer();
  await writeFile(`${directory}/${prefix}-${size}-${revision}.png`,png);
  if(size<=48){
   // Standard 32-bit bitmap ICO frames for browser compatibility.
   const rgba=await pipeline.ensureAlpha().raw().toBuffer();
   const maskBytes=Math.ceil(size/32)*4*size;
   const dib=Buffer.alloc(40+size*size*4+maskBytes);
   dib.writeUInt32LE(40,0);dib.writeInt32LE(size,4);dib.writeInt32LE(size*2,8);
   dib.writeUInt16LE(1,12);dib.writeUInt16LE(32,14);dib.writeUInt32LE(size*size*4+maskBytes,20);
   for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const from=(y*size+x)*4,to=40+((size-1-y)*size+x)*4;
    dib[to]=rgba[from+2];dib[to+1]=rgba[from+1];dib[to+2]=rgba[from];dib[to+3]=255;
   }
   frames.push({size,dib});
  }
 }
 const header=Buffer.alloc(6+frames.length*16);header.writeUInt16LE(1,2);header.writeUInt16LE(frames.length,4);
 let offset=header.length;
 frames.forEach(({size,dib},i)=>{const at=6+i*16;header[at]=size;header[at+1]=size;header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(dib.length,at+8);header.writeUInt32LE(offset,at+12);offset+=dib.length;});
 await writeFile(`${directory}/favicon-${revision}.ico`,Buffer.concat([header,...frames.map(f=>f.dib)]));
 return {directory,prefix};
}
const pro=await build('public/icons/vecta-512.png','public/icons/pro','v-pro');
const mechanic=await build('design/icons/mechanic-v.png','public/icons/mechanic','v');
await mkdir('website/icons',{recursive:true});
for(const size of [16,32,180,192,512])await copyFile(`${pro.directory}/${pro.prefix}-${size}-${revision}.png`,`website/icons/v-pro-${size}-${revision}.png`);
await copyFile(`${pro.directory}/favicon-${revision}.ico`,`website/icons/favicon-${revision}.ico`);
for(const directory of ['public','website']){
 for(const file of ['apple-touch-icon.png','apple-touch-icon-precomposed.png','apple-touch-icon-180x180.png'])await copyFile(`${pro.directory}/v-pro-180-${revision}.png`,`${directory}/${file}`);
 await copyFile(`${pro.directory}/favicon-${revision}.ico`,`${directory}/favicon.ico`);
 await copyFile(`${pro.directory}/v-pro-32-${revision}.png`,`${directory}/favicon.png`);
}
const inset=await sharp('design/icons/mechanic-v.png').resize(352,352).toBuffer();
await sharp({create:{width:512,height:512,channels:3,background:'#080808'}}).composite([{input:inset,left:80,top:80}]).png().toFile(`${mechanic.directory}/v-maskable-512-${revision}.png`);
console.log('Built V PRO and mechanics V shortcut assets.');
