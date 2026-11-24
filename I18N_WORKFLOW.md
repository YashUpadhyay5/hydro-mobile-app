# Translating the app

All screen text goes through `t('namespace:key', { defaultValue: 'English text' })`. In plain TypeScript (no hooks) use
`i18n.t(...)` from `@/src/i18n`. Dates and times use `getDateLocale()` from `@/src/i18n/dateLocale`, so they follow the
language chosen in the app, not the phone's.

## Adding or changing text

1. Write the English text in the code as the `defaultValue`.
2. `node scripts/i18n-harvest.cjs --write` adds every missing key to `src/locales/en/<namespace>.json`.
   If the same key is used with different wording in two places, the later use gets `<key>_v2` and its call site is rewritten.
3. Translate the new keys into the other languages. The helper checks that every string is present and that every
   `{{placeholder}}` matches the English:
   `node scripts/i18n-merge.cjs <lang> <index.json> <translations.txt> --write`
   (`index.json` = `[{ns,key,text}]` in order; `translations.txt` = one `N|translated text` per line, `\n` for a line break).
4. If you add a language folder or a namespace file: `node scripts/i18n-build-config.cjs` regenerates `src/i18n/config.ts`.
5. `node scripts/i18n-scan.cjs` lists user-visible text still written directly in the code.

Languages: en, hi, mr, gu, pa, bn, as, or, ta, te, kn, ml, es. Bhojpuri (`bho`) and Awadhi (`awadhi`) have no files of
their own and fall back to Hindi (see `FALLBACK_LANGUAGES` in `src/i18n/index.ts`).

## Not translated on purpose

- `app/developer-diagnostics.tsx` (internal tool).
- The long legal paragraphs in `components/PrivacyPolicyConsentModal.tsx` and `components/LegalComplianceModal.tsx`
  (titles, buttons and alerts are translated). Legal wording should be translated and approved by a person.
- Values that are sent to the server or stored (leave type codes, ticket categories, work modes): only their labels are translated.
- Native Android reminder text (the notifications scheduled by the cellular-tracker module).
