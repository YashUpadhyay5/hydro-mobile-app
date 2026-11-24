// Lists user-visible text that is written directly in the code instead of going through t().
// Heuristic (line based): JSX text, text-like props, Alert/notify arguments. Run: node scripts/i18n-scan.cjs [file...]
const fs = require('fs');
const path = require('path');

const SKIP = ['node_modules', 'backend', 'android', 'ios', 'locales', 'dist', '.expo', 'ios-build', 'modules'];
const walk = (d) =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    SKIP.includes(e.name) ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : /\.tsx$/.test(e.name) ? [path.join(d, e.name)] : []
  );
const args = process.argv.slice(2);
const files = args.length ? args : ['app', 'components', 'src'].flatMap(walk);

const hasWords = (s) => /[A-Za-zऀ-෿]{3,}/.test(s) && !/^[a-z0-9_.:/#-]+$/.test(s.trim()) && !/^(https?:|\/|@|#|[a-z]+-[a-z0-9-]+$)/.test(s.trim());
const PROP = /\b(title|placeholder|label|accessibilityLabel|headerTitle|subtitle|message|description|text|name)\s*[:=]\s*\{?\s*(['"`])((?:(?!\2).)*)\2/g;
const CALL = /\b(Alert\.alert|notify|window\.alert|showToast|Toast\.show)\(\s*(['"`])((?:(?!\2).)*)\2/g;
let total = 0;
for (const file of files) {
  const hits = [];
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith('//') || t.startsWith('*') || t.startsWith('import ') || /className=|console\./.test(t) && !/>[^<]*[A-Za-z]{3,}/.test(t)) {
      /* keep scanning below for className lines that also hold text */
    }
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('import ') || /console\.(log|warn|error)/.test(t)) return;
    for (const m of t.matchAll(/>([^<>{}]*[A-Za-zऀ-෿][^<>{}]*)</g)) if (hasWords(m[1])) hits.push([i + 1, 'text', m[1].trim()]);
    // text on its own line inside JSX
    if (/^[A-Zऀ-෿][^<>{}=;]*$/.test(t) && /\s/.test(t) && !/^(return|const|let|if|else|export|function)\b/.test(t) && lineLooksJsx(file, i)) hits.push([i + 1, 'text', t]);
    for (const m of t.matchAll(PROP)) if (hasWords(m[3]) && !/t\(/.test(m[0])) hits.push([i + 1, m[1], m[3]]);
    for (const m of t.matchAll(CALL)) if (hasWords(m[3])) hits.push([i + 1, m[1], m[3]]);
    // second string argument of Alert.alert(t(...), 'literal') and notify(t(...), 'literal')
    const a = /\b(?:Alert\.alert|notify)\(.*?,\s*(['"`])((?:(?!\1).)+)\1/.exec(t);
    if (a && hasWords(a[2]) && !hits.some((h) => h[0] === i + 1 && h[2] === a[2])) hits.push([i + 1, 'alert-arg', a[2]]);
  });
  if (hits.length) {
    total += hits.length;
    console.log(`\n${file}  (${hits.length})`);
    hits.forEach(([n, k, s]) => console.log(`  ${n}\t${k}\t${s.slice(0, 110)}`));
  }
}
console.log(`\n${total} candidates`);

function lineLooksJsx(file, i) {
  const lines = (lineLooksJsx.cache ??= {})[file] ??= fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (let j = i - 1; j >= Math.max(0, i - 3); j--) if (/<(Text|Button|Animated\.Text|TouchableOpacity)\b[^>]*>\s*$/.test(lines[j]) || /^\s*>\s*$/.test(lines[j])) return true;
  return false;
}
