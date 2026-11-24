// Merges a translation list into src/locales/<lang>/*.json.
// Usage: node scripts/i18n-merge.cjs <lang> <index.json> <translations.txt> [--write]
// index.json: [{ ns, key, text }]  (the English source, in order)
// translations.txt: one "N|translated text" per line, N = 1-based position in index.json; a line break inside a
// string is written as the two characters \n.
// Checks every string is present and has exactly the same {{placeholders}} as the English; nothing is written
// unless all checks pass.
const fs = require('fs');
const path = require('path');

const [lang, indexFile, trFile, ...rest] = process.argv.slice(2);
const write = rest.includes('--write');
const rows = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
const tr = new Map();
for (const line of fs.readFileSync(trFile, 'utf8').split(/\r?\n/)) {
  if (!line.trim()) continue;
  const i = line.indexOf('|');
  const n = Number(line.slice(0, i));
  if (!Number.isInteger(n)) { console.log('BAD LINE', line.slice(0, 60)); process.exitCode = 1; continue; }
  tr.set(n, line.slice(i + 1).replace(/\\n/g, '\n'));
}
const ph = (s) => (s.match(/\{\{\s*\w+\s*\}\}/g) || []).map((x) => x.replace(/\s/g, '')).sort().join(',');
let problems = 0;
rows.forEach((r, idx) => {
  const t = tr.get(idx + 1);
  if (t === undefined || t.trim() === '') { console.log(`MISSING #${idx + 1} ${r.ns}:${r.key} (${r.text.slice(0, 40)})`); problems++; return; }
  if (ph(t) !== ph(r.text)) { console.log(`PLACEHOLDERS #${idx + 1} en=${ph(r.text)} ${lang}=${ph(t)}`); problems++; }
  if ((r.text.match(/\n/g) || []).length !== (t.match(/\n/g) || []).length) { console.log(`LINE BREAKS #${idx + 1}`); problems++; }
});
const extra = [...tr.keys()].filter((n) => n < 1 || n > rows.length);
if (extra.length) { console.log('EXTRA NUMBERS', extra.slice(0, 10)); problems++; }
console.log(`${lang}: ${tr.size}/${rows.length} strings, ${problems} problems`);
if (problems || !write) process.exit(problems ? 1 : 0);

const dir = path.join('src/locales', lang);
const files = {};
rows.forEach((r, idx) => {
  const f = path.join(dir, r.ns + '.json');
  files[f] ??= JSON.parse(fs.readFileSync(f, 'utf8'));
  files[f][r.key] = tr.get(idx + 1);
});
for (const [f, obj] of Object.entries(files)) fs.writeFileSync(f, JSON.stringify(obj, null, 2) + '\n');
console.log(`written ${Object.keys(files).length} files`);
