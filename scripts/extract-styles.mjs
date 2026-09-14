import fs from 'node:fs';
import path from 'node:path';

const [htmlArgument = 'index.html', cssArgument = 'app.css'] = process.argv.slice(2);
const htmlPath = path.resolve(htmlArgument);
const cssPath = path.resolve(cssArgument);
let html = fs.readFileSync(htmlPath, 'utf8');

const styles = [];
let insertedLink = false;
html = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_whole, css) => {
  styles.push(css.trim());
  if (insertedLink) return '';
  insertedLink = true;
  return '<link rel="stylesheet" href="/app.css">';
});

if (!styles.length) throw new Error(`No inline styles were found in ${htmlArgument}`);
if (!insertedLink) throw new Error('The stylesheet link was not inserted');

const stylesheet = `${styles.join('\n')}\n`;
fs.mkdirSync(path.dirname(cssPath), { recursive: true });
fs.writeFileSync(cssPath, stylesheet);
fs.writeFileSync(htmlPath, html);

console.log(JSON.stringify({
  htmlBytes: Buffer.byteLength(html),
  cssBytes: Buffer.byteLength(stylesheet),
  extractedBlocks: styles.length,
}));
