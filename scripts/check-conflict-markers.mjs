import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.md']);
const MARKERS = ['<<<<<<<', '=======', '>>>>>>>'];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.git')) continue;
      walk(full, out);
      continue;
    }
    out.push(full);
  }
  return out;
}

const offenders = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    if (![...EXTENSIONS].some((ext) => file.endsWith(ext))) continue;
    const content = readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (MARKERS.some((m) => line.startsWith(m))) {
        offenders.push(`${file}:${idx + 1}: ${line.trim()}`);
      }
    });
  }
}

if (offenders.length > 0) {
  console.error('Merge conflict markers detected. Resolve these before running the app:');
  offenders.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('No merge conflict markers found.');
