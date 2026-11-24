// Adds every t('ns:key', { defaultValue: '...' }) that is missing from src/locales/en/<ns>.json, using the English
// fallback written in the code as the source text. A key that the code uses with different wording in several places
// keeps each wording: the later uses are moved to a new key (<key>_v2, ...) and the call site is rewritten.
// Run: node scripts/i18n-harvest.cjs [--write]
const fs = require('fs');
const path = require('path');

const write = process.argv.includes('--write');
const EN = 'src/locales/en';
const SKIP = ['node_modules', 'backend', 'android', 'ios', 'locales', 'dist', '.expo'];
const walk = (d) =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    SKIP.includes(e.name) ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : []
  );
const files = ['app', 'components', 'src', 'hooks', 'services', 'utils', 'store', 'context'].filter(fs.existsSync).flatMap(walk);

const unescape = (s) => s.replace(/\\(n|t|\\|'|"|`|\$)/g, (_, c) => ({ n: '\n', t: '\t' }[c] ?? c));

const en = {};
for (const f of fs.readdirSync(EN)) en[f.replace('.json', '')] = JSON.parse(fs.readFileSync(path.join(EN, f), 'utf8'));

const found = {};
const notes = [];
const patches = {}; // file -> [{ at, len, text }]
const callRe = /\bt\(\s*(['"`])([^'"`$]+)\1\s*,\s*\{\s*defaultValue:\s*(['"`])((?:\\.|(?!\3)[^\\])*)\3/g;
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const nsM = /useTranslation(?:Safe)?\(\s*(\[[^\]]*\]|'[^']*')/.exec(src);
  const defNs = (nsM && /'([^']+)'/.exec(nsM[1])?.[1]) || 'common';
  for (const m of src.matchAll(callRe)) {
    const [ns, key] = m[2].includes(':') ? m[2].split(':') : [defNs, m[2]];
    const text = unescape(m[4]);
    if (!en[ns]) { notes.push(`no locale file for namespace "${ns}" (${file}: ${key})`); continue; }
    const known = (k) => (k in en[ns] ? en[ns][k] : found[`${ns}:${k}`]?.text);
    let useKey = key;
    // an existing English entry is the source of truth for its own key; only new keys can be re-keyed
    if (key in en[ns]) continue;
    for (let n = 2; known(useKey) !== undefined && known(useKey) !== text; n++) useKey = `${key}_v${n}`;
    if (useKey !== key) {
      const at = m.index + m[0].indexOf(m[2]);
      (patches[file] ??= []).push({ at, len: m[2].length, text: (m[2].includes(':') ? ns + ':' : '') + useKey });
      notes.push(`${ns}:${key} -> ${useKey} in ${file} ("${text}")`);
    }
    if (!found[`${ns}:${useKey}`]) found[`${ns}:${useKey}`] = { ns, key: useKey, text, file };
  }
}
const ids = Object.keys(found);
console.log(`${ids.length} missing keys`);
notes.forEach((c) => console.log('NOTE', c));
if (write) {
  for (const id of ids) en[found[id].ns][found[id].key] = found[id].text;
  for (const ns of Object.keys(en)) fs.writeFileSync(path.join(EN, ns + '.json'), JSON.stringify(en[ns], null, 2) + '\n');
  for (const [file, list] of Object.entries(patches)) {
    let src = fs.readFileSync(file, 'utf8');
    for (const p of list.sort((a, b) => b.at - a.at)) src = src.slice(0, p.at) + p.text + src.slice(p.at + p.len);
    fs.writeFileSync(file, src);
  }
  console.log('written');
}
