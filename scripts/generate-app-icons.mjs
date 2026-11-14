// Rebuild browser icons from Chris's approved red V + silver PRO artwork.
// Run manually after replacing design/vecta-app-icon.png; outputs are committed.
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const source = new URL('../design/vecta-app-icon.png', import.meta.url);
const output = new URL('../public/icons/', import.meta.url);
await mkdir(output, { recursive: true });
const icons = new Map();
for (const size of [16, 32, 48, 180, 192, 512]) {
  const png = await sharp(source.pathname).resize(size, size).removeAlpha()
    .png({ compressionLevel: 9 }).toBuffer();
  icons.set(size, png);
  if (size >= 180 || size === 32) {
    await writeFile(new URL(`vecta-${size}.png`, output), png);
  }
}
// A separate padded icon keeps the entire mark inside Android's maskable safe area.
const inset = await sharp(source.pathname).resize(352, 352).removeAlpha().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 3, background: '#0b0b0d' } })
  .composite([{ input: inset, left: 80, top: 80 }])
  .png({ compressionLevel: 9 }).toFile(new URL('vecta-maskable-512.png', output).pathname);

// Root favicon fallback for browsers fetching it before the protected app HTML.
const sizes = [16, 32, 48];
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (let i = 0; i < sizes.length; i++) {
  const size = sizes[i], png = icons.get(size), entry = 6 + i * 16;
  header[entry] = size;
  header[entry + 1] = size;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(24, entry + 6);
  header.writeUInt32LE(png.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
}
await writeFile(new URL('../public/favicon.ico', import.meta.url),
  Buffer.concat([header, ...sizes.map(size => icons.get(size))]));
console.log('Generated VECTA touch, browser, install and maskable icons.');
