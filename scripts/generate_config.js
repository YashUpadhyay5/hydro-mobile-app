const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../src/i18n/config.ts');

const LANGUAGES = ['en', 'hi', 'mr', 'gu', 'ta', 'te', 'kn', 'ml', 'pa', 'bn', 'or', 'as'];
const NAMESPACES = ['common', 'dashboard', 'leave', 'expense', 'documents', 'camera', 'tracking', 'communication', 'nav', 'auth', 'settings', 'permissions', 'attendance', 'payroll', 'employee', 'validation'];

let imports = `import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { NAMESPACES, DEFAULT_NAMESPACE } from './namespaces';
import { DEFAULT_LANGUAGE_CODE } from './index';\n\n`;

LANGUAGES.forEach(lang => {
  NAMESPACES.forEach(ns => {
    const varName = `${lang}${ns.charAt(0).toUpperCase() + ns.slice(1)}`;
    imports += `import ${varName} from '../locales/${lang}/${ns}.json';\n`;
  });
  imports += '\n';
});

imports += `export const resources = {\n`;
LANGUAGES.forEach(lang => {
  imports += `  ${lang}: {\n`;
  NAMESPACES.forEach(ns => {
    const varName = `${lang}${ns.charAt(0).toUpperCase() + ns.slice(1)}`;
    imports += `    ${ns}: ${varName},\n`;
  });
  imports += `  },\n`;
});
imports += `};\n\n`;

imports += `let isInitialized = false;

export const initI18n = async (initialLang: string = DEFAULT_LANGUAGE_CODE) => {
  if (isInitialized) return i18n;

  await i18n.use(initReactI18next).init({
    resources,
    lng: initialLang,
    fallbackLng: DEFAULT_LANGUAGE_CODE,
    ns: NAMESPACES,
    defaultNS: DEFAULT_NAMESPACE,
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
    missingKeyHandler: (lngs, ns, key, fallbackValue) => {
      console.warn(\`[i18n Warning] Missing key '\${key}' in namespace '\${ns}' for languages [\${lngs.join(', ')}]. Fallback used.\`);
    },
  });

  isInitialized = true;
  return i18n;
};

export default initI18n;
`;

fs.writeFileSync(CONFIG_PATH, imports, 'utf8');
console.log('Successfully generated src/i18n/config.ts with all 15+ namespaces across 12 languages!');
