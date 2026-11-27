// The service worker's file list (sw.js) must match the files the page uses: a listed file that is missing
// breaks the offline install, and a used file that is not listed is missing when offline.
import { existsSync, readFileSync } from 'node:fs';

const listed = [...readFileSync('sw.js', 'utf8').match(/const FILES = \[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)]
  .map(match => match[1])
  .filter(file => file !== './');
const used = [
  ...readFileSync('index.html', 'utf8').matchAll(/(?:src|href)="([^"]+)"/g),
  ...readFileSync('mascot.css', 'utf8').matchAll(/url\("(fonts\/[^"]+)"\)/g),
  ...readFileSync('manifest.webmanifest', 'utf8').matchAll(/"src": "([^"]+)"/g),
  ...readFileSync('config.js', 'utf8').matchAll(/promptFile: '([^']+)'/g),
].map(match => match[1]);

const problems = [
  ...listed.filter(file => !existsSync(file)).map(file => `sw.js lists ${file}, which does not exist`),
  ...used.filter(file => !listed.includes(file)).map(file => `${file} is used but missing from FILES in sw.js`),
];
for (const problem of problems) console.error(`✗ ${problem}`);
if (problems.length) process.exit(1);
console.log(`✓ ${listed.length} files listed, all exist; all ${new Set(used).size} used files listed`);
