# 🌍 HRMS Enterprise Internationalization (i18n) Documentation

Welcome to the **Enterprise i18n Architecture** documentation for the HRMS Web Dashboard and Mobile Application (React / Expo React Native).

This architecture provides modular, offline-first, scalable localization supporting **12 languages** across **8 distinct domain namespaces**.

---

## 📋 Table of Contents
1. [Supported Languages](#1-supported-languages)
2. [Project Architecture & Directory Structure](#2-project-architecture--directory-structure)
3. [Namespaces](#3-namespaces)
4. [Core Custom Hooks](#4-core-custom-hooks)
5. [Reusable UI Components](#5-reusable-ui-components)
6. [Locale-Aware Formatters](#6-locale-aware-formatters)
7. [Localized Report Exports](#7-localized-report-exports)
8. [Language Detection & Persistence](#8-language-detection--persistence)
9. [How to Add a New Language](#9-how-to-add-a-new-language)
10. [Naming Conventions & Best Practices](#10-naming-conventions--best-practices)
11. [Common Mistakes to Avoid](#11-common-mistakes-to-avoid)
12. [Future Extensions (V2 AI Translation Roadmap)](#12-future-extensions-v2-ai-translation-roadmap)

---

## 1. Supported Languages

| Code | English Name | Native Name | Script / Family | Direction |
|:---:|:---|:---|:---|:---:|
| `en` | English | English | Latin | LTR |
| `hi` | Hindi | हिन्दी | Devanagari | LTR |
| `mr` | Marathi | मराठी | Devanagari | LTR |
| `gu` | Gujarati | ગુજરાતી | Gujarati | LTR |
| `ta` | Tamil | தமிழ் | Tamil | LTR |
| `te` | Telugu | తెలుగు | Telugu | LTR |
| `kn` | Kannada | ಕನ್ನಡ | Kannada | LTR |
| `ml` | Malayalam | മലയാളം | Malayalam | LTR |
| `pa` | Punjabi | ਪੰਜਾਬੀ | Gurmukhi | LTR |
| `bn` | Bengali | বাংলা | Bengali | LTR |
| `or` | Odia | ଓଡ଼ିଆ | Odia | LTR |
| `as` | Assamese | অসমীয়া | Bengali-Assamese | LTR |

---

## 2. Project Architecture & Directory Structure

```text
C:\Projects\HRMS_App\
├── src/
│   ├── i18n/
│   │   ├── index.ts               # Core i18n exports, supported language constants & helpers
│   │   ├── config.ts              # i18next configuration & resource loader
│   │   ├── detector.ts            # Device & browser language detector (Expo & Web)
│   │   ├── languageService.ts     # Persistence (AsyncStorage) & backend user profile sync
│   │   └── namespaces.ts          # Namespace definitions
│   ├── locales/                   # 96 JSON files (12 languages x 8 namespaces)
│   │   ├── en/
│   │   │   ├── common.json
│   │   │   ├── dashboard.json
│   │   │   ├── attendance.json
│   │   │   ├── payroll.json
│   │   │   ├── employee.json
│   │   │   ├── settings.json
│   │   │   ├── validation.json
│   │   │   └── notifications.json
│   │   ├── hi/ ...
│   │   ├── mr/ ...
│   │   └── ... (gu, ta, te, kn, ml, pa, bn, or, as)
│   ├── hooks/
│   │   ├── useLanguage.ts         # Main hook for language switching & state
│   │   ├── useTranslationSafe.ts  # Safe translation hook with key fallback
│   │   ├── useLocale.ts           # Regional locale metadata
│   │   ├── useCurrentLanguage.ts  # Convenience hook for current language
│   │   └── useLanguagePersistence.ts # Automatic detection & user sync
│   ├── utils/
│   │   ├── formatters.ts          # Date, time, currency, and number formatters
│   │   └── exportUtils.ts         # Localized report exporter (CSV, PDF)
│   └── components/
│       └── i18n/
│           ├── LanguageProvider.tsx # Context Provider
│           ├── LanguageSwitcher.tsx # Compact / Full toggle button
│           ├── LanguageDropdown.tsx # Dropdown menu picker
│           ├── LanguageModal.tsx    # Modal selection sheet with search
│           ├── LanguageSearch.tsx   # Search input component
│           └── LanguageBadge.tsx    # Visual active language tag
```

---

## 3. Namespaces

Translation strings are split across **8 modular domain namespaces** to avoid massive JSON files and improve maintainability:

1. `common`: Buttons (Save, Cancel, Delete, Submit, Search, Filter, etc.), dialogs, general actions.
2. `dashboard`: Dashboard overview, metrics, check-in cards, quick actions.
3. `attendance`: Check In, Check Out, working hours, GPS signal status, geofencing, route replay.
4. `payroll`: Salary, payslips, basic pay, allowances, deductions, net pay.
5. `employee`: Employee directory, employee ID, designation, department, joining date, profile.
6. `settings`: Language settings, themes, auto-detect, reset options.
7. `validation`: Form validation messages, missing fields, password strength, network error messages.
8. `notifications`: Alert popups, push notifications, status change toasts.

---

## 4. Core Custom Hooks

### `useLanguage()`
Returns language state and actions:
```tsx
import { useLanguage } from '@/src/hooks/useLanguage';

const { currentLanguage, language, supportedLanguages, changeLanguage, resetLanguage, isRTL } = useLanguage();
```

### `useTranslationSafe(namespaces)`
Returns a safe `t` translation function that never crashes:
```tsx
import { useTranslationSafe } from '@/src/hooks/useTranslationSafe';

const { t } = useTranslationSafe(['common', 'dashboard']);
return <Text>{t('common:save', { defaultValue: 'Save' })}</Text>;
```

### `useLocale()`
Provides regional locale metadata (e.g. `hi-IN`, `ta-IN`):
```tsx
import { useLocale } from '@/src/hooks/useLocale';

const { locale, currencyCode, timeZone } = useLocale();
```

### `useLanguagePersistence()`
Called automatically in `app/_layout.tsx` to restore and persist language settings across app restarts.

---

## 5. Reusable UI Components

### `<LanguageSwitcher variant="compact" />`
A clean pill button to open language selection sheet.

### `<LanguageModal visible={isOpen} onClose={close} />`
Searchable full-screen or bottom sheet listing all 12 languages with native script titles.

### `<LanguageDropdown />`
An inline dropdown select input for forms and settings screens.

---

## 6. Locale-Aware Formatters

Use standard Intl components and functions for dates, currency, and numbers:

```tsx
import { DateFormatter, CurrencyFormatter, NumberFormatter, formatDate } from '@/src/utils/formatters';

// Component usage
<DateFormatter date={new Date()} />
<CurrencyFormatter amount={45000} currency="INR" />
<NumberFormatter value={1250} />

// Function usage
const formattedDate = formatDate(new Date(), 'hi-IN');
```

---

## 7. Localized Report Exports

Generate CSV and PDF reports with column headers translated into the active user language:

```ts
import { ExportUtils } from '@/src/utils/exportUtils';

const csvData = ExportUtils.generateLocalizedCSV({
  title: 'Attendance Report',
  data: attendanceList,
  columns: [
    { key: 'name', labelKey: 'employee:name' },
    { key: 'status', labelKey: 'common:status' },
    { key: 'date', labelKey: 'common:date' },
  ],
});
```

---

## 8. Language Detection & Persistence

1. **First Launch**: App detects device language using `expo-localization` (on Expo native) or `navigator.language` (on Web).
2. **Fallback**: If device language is not one of the 12 supported languages, defaults to English (`en`).
3. **Login & Profile Sync**: When logged in, user's saved language preference (`user.language`) is loaded from backend database and synced back on change.
4. **Offline Capability**: All 96 JSON files are bundled locally so language switching works completely offline without network requests.

---

## 9. How to Add a New Language

To add a 13th language (e.g., German `de` or Spanish `es`):

1. **Add Language Definition** in `src/i18n/index.ts`:
   ```ts
   { code: 'de', name: 'German', nativeName: 'Deutsch', dir: 'ltr' }
   ```
2. **Create Locale Folder**: Create `src/locales/de/`
3. **Create Namespace JSON Files**: Copy the 8 JSON files from `src/locales/en/` and translate the values.
4. **Register Resources** in `src/i18n/config.ts`:
   ```ts
   import deCommon from '../locales/de/common.json';
   // import other 7 namespaces
   resources.de = { common: deCommon, ... };
   ```

---

## 10. Naming Conventions & Best Practices

- Use camelCase for JSON keys (e.g. `checkIn`, `workingHours`, `requiredField`).
- Always namespace keys when calling `t()` (e.g., `t('dashboard:checkIn')` or `t('common:save')`).
- Provide default values in `t('key', { defaultValue: 'Default Text' })` as a defensive safety fallback.
- Keep translations modular per feature component rather than creating massive unstructured JSON files.

---

## 11. Common Mistakes to Avoid

- ❌ Hardcoding UI text in JSX elements like `<Text>Check In</Text>`.
- ❌ Hardcoding alert titles/messages without `t()`.
- ❌ Manual string concatenation for dates or currency instead of `Intl` formatters.
- ❌ Modifying third-party i18next global state directly without `useLanguage()` or `LanguageService`.

---

## 12. Future Extensions (V2 AI Translation Roadmap)

The i18n architecture is designed to support Version 2 features cleanly:

- 🤖 **Dynamic AI Translation**: Integrate OpenAI/Azure translation middleware for dynamic employee chat messages and comments.
- 🗣️ **Voice & Speech Translation**: Plug in Indian language Speech-to-Text (STT) and Text-to-Speech (TTS) models.
- 📲 **AI Push Notifications**: Automatically translate automated push alerts into user's preferred language before dispatching.
- 🛠️ **Admin Translation Panel**: Manage over-the-air (OTA) JSON translation file updates without re-building the mobile app.
