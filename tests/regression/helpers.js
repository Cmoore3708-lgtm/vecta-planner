import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function source(name = 'index.html') {
  return fs.readFileSync(path.join(root, name), 'utf8');
}

export function extractFunction(name, text = source()) {
  const marker = `function ${name}(`;
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`Function ${name} was not found`);
  const brace = text.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = brace; i < text.length; i += 1) {
    const char = text[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error(`Function ${name} is incomplete`);
}

export function loadFunctions(names, context = {}) {
  const sandbox = vm.createContext({ console, ...context });
  vm.runInContext(names.map(name => extractFunction(name)).join('\n'), sandbox);
  return sandbox;
}
