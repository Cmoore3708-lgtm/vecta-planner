"""Rebuild the decorative tyre's physical axle-roll assets (Node + Pillow)."""
from pathlib import Path
from tempfile import TemporaryDirectory
import subprocess
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
with TemporaryDirectory() as scratch:
    subprocess.run(['node','-e',r'''
const fs=require('node:fs'),path=require('node:path'),{frame}=require(process.argv[1]);
for(let i=0;i<32;i++)frame({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:im=>fs.writeFileSync(path.join(process.argv[2],`frame-${i}.rgba`),im.data)},i/32*(Math.PI*2/14),360);
''',str(ROOT/'scripts/tyre-roll-model.cjs'),scratch],check=True)
    frames=[Image.frombytes('RGBA',(360,360),Path(scratch,f'frame-{i}.rgba').read_bytes()).resize((240,240),Image.Resampling.LANCZOS) for i in range(32)]
    for target in [ROOT/'public/assets',ROOT/'website/assets']:
        frames[0].save(target/'tyre-axle-still.webp',quality=90,method=6)
        frames[0].save(target/'tyre-axle-rolling.webp',save_all=True,append_images=frames[1:],loop=0,duration=[round((i+1)*1000/32)-round(i*1000/32) for i in range(32)],quality=86,method=4,minimize_size=True)
