import fs from 'node:fs';
import path from 'node:path';

const [htmlArgument = 'index.html', scriptArgument = 'js/vecta-app.js', logoArgument = 'assets/vecta-logo.webp'] = process.argv.slice(2);
const htmlPath = path.resolve(htmlArgument);
const scriptPath = path.resolve(scriptArgument);
const logoPath = path.resolve(logoArgument);
let html = fs.readFileSync(htmlPath, 'utf8');

const scriptPattern = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
const candidates = [...html.matchAll(scriptPattern)].filter(([, attributes, body]) =>
  !/\bsrc\s*=/.test(attributes) &&
  body.includes("var VERSION=") &&
  body.includes('function init()') &&
  body.trimStart().startsWith('(function(){')
);

if (candidates.length !== 1) {
  throw new Error(`Expected one canonical application script, found ${candidates.length}`);
}

const [wholeScript, , inlineProgram] = candidates[0];
const logoMatch = inlineProgram.match(/var BRAND_LOGO_SRC='data:image\/webp;base64,([^']+)';/);
if (!logoMatch) throw new Error('Embedded WebP brand logo was not found in the application script');

const externalProgram = inlineProgram.replace(
  /var BRAND_LOGO_SRC='data:image\/webp;base64,[^']+';/,
  'var BRAND_LOGO_SRC=BRAND_LOGO_FILE_SRC;'
);
if (externalProgram === inlineProgram) throw new Error('Brand logo was not externalised');

html = html.replace(wholeScript, '<script src="/js/vecta-app.js"></script>');
if (html.includes("var VERSION='v41.23-job-card-due-dates'")) {
  throw new Error('Canonical application program remains embedded in index.html');
}

fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
fs.mkdirSync(path.dirname(logoPath), { recursive: true });
fs.writeFileSync(scriptPath, `${externalProgram.trim()}\n`);
fs.writeFileSync(logoPath, Buffer.from(logoMatch[1], 'base64'));
fs.writeFileSync(htmlPath, html);

console.log(JSON.stringify({
  htmlBytes: Buffer.byteLength(html),
  scriptBytes: Buffer.byteLength(externalProgram.trim()) + 1,
  logoBytes: Buffer.byteLength(Buffer.from(logoMatch[1], 'base64')),
}));
