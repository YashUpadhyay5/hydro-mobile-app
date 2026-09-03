import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { NAMESPACES, DEFAULT_NAMESPACE } from './namespaces';
import { DEFAULT_LANGUAGE_CODE } from './index';

import enCommon from '../locales/en/common.json';
import enDashboard from '../locales/en/dashboard.json';
import enLeave from '../locales/en/leave.json';
import enExpense from '../locales/en/expense.json';
import enDocuments from '../locales/en/documents.json';
import enCamera from '../locales/en/camera.json';
import enTracking from '../locales/en/tracking.json';
import enCommunication from '../locales/en/communication.json';
import enNav from '../locales/en/nav.json';
import enAuth from '../locales/en/auth.json';
import enSettings from '../locales/en/settings.json';
import enPermissions from '../locales/en/permissions.json';
import enAttendance from '../locales/en/attendance.json';
import enPayroll from '../locales/en/payroll.json';
import enEmployee from '../locales/en/employee.json';
import enValidation from '../locales/en/validation.json';

import hiCommon from '../locales/hi/common.json';
import hiDashboard from '../locales/hi/dashboard.json';
import hiLeave from '../locales/hi/leave.json';
import hiExpense from '../locales/hi/expense.json';
import hiDocuments from '../locales/hi/documents.json';
import hiCamera from '../locales/hi/camera.json';
import hiTracking from '../locales/hi/tracking.json';
import hiCommunication from '../locales/hi/communication.json';
import hiNav from '../locales/hi/nav.json';
import hiAuth from '../locales/hi/auth.json';
import hiSettings from '../locales/hi/settings.json';
import hiPermissions from '../locales/hi/permissions.json';
import hiAttendance from '../locales/hi/attendance.json';
import hiPayroll from '../locales/hi/payroll.json';
import hiEmployee from '../locales/hi/employee.json';
import hiValidation from '../locales/hi/validation.json';

import mrCommon from '../locales/mr/common.json';
import mrDashboard from '../locales/mr/dashboard.json';
import mrLeave from '../locales/mr/leave.json';
import mrExpense from '../locales/mr/expense.json';
import mrDocuments from '../locales/mr/documents.json';
import mrCamera from '../locales/mr/camera.json';
import mrTracking from '../locales/mr/tracking.json';
import mrCommunication from '../locales/mr/communication.json';
import mrNav from '../locales/mr/nav.json';
import mrAuth from '../locales/mr/auth.json';
import mrSettings from '../locales/mr/settings.json';
import mrPermissions from '../locales/mr/permissions.json';
import mrAttendance from '../locales/mr/attendance.json';
import mrPayroll from '../locales/mr/payroll.json';
import mrEmployee from '../locales/mr/employee.json';
import mrValidation from '../locales/mr/validation.json';

import guCommon from '../locales/gu/common.json';
import guDashboard from '../locales/gu/dashboard.json';
import guLeave from '../locales/gu/leave.json';
import guExpense from '../locales/gu/expense.json';
import guDocuments from '../locales/gu/documents.json';
import guCamera from '../locales/gu/camera.json';
import guTracking from '../locales/gu/tracking.json';
import guCommunication from '../locales/gu/communication.json';
import guNav from '../locales/gu/nav.json';
import guAuth from '../locales/gu/auth.json';
import guSettings from '../locales/gu/settings.json';
import guPermissions from '../locales/gu/permissions.json';
import guAttendance from '../locales/gu/attendance.json';
import guPayroll from '../locales/gu/payroll.json';
import guEmployee from '../locales/gu/employee.json';
import guValidation from '../locales/gu/validation.json';

import taCommon from '../locales/ta/common.json';
import taDashboard from '../locales/ta/dashboard.json';
import taLeave from '../locales/ta/leave.json';
import taExpense from '../locales/ta/expense.json';
import taDocuments from '../locales/ta/documents.json';
import taCamera from '../locales/ta/camera.json';
import taTracking from '../locales/ta/tracking.json';
import taCommunication from '../locales/ta/communication.json';
import taNav from '../locales/ta/nav.json';
import taAuth from '../locales/ta/auth.json';
import taSettings from '../locales/ta/settings.json';
import taPermissions from '../locales/ta/permissions.json';
import taAttendance from '../locales/ta/attendance.json';
import taPayroll from '../locales/ta/payroll.json';
import taEmployee from '../locales/ta/employee.json';
import taValidation from '../locales/ta/validation.json';

import teCommon from '../locales/te/common.json';
import teDashboard from '../locales/te/dashboard.json';
import teLeave from '../locales/te/leave.json';
import teExpense from '../locales/te/expense.json';
import teDocuments from '../locales/te/documents.json';
import teCamera from '../locales/te/camera.json';
import teTracking from '../locales/te/tracking.json';
import teCommunication from '../locales/te/communication.json';
import teNav from '../locales/te/nav.json';
import teAuth from '../locales/te/auth.json';
import teSettings from '../locales/te/settings.json';
import tePermissions from '../locales/te/permissions.json';
import teAttendance from '../locales/te/attendance.json';
import tePayroll from '../locales/te/payroll.json';
import teEmployee from '../locales/te/employee.json';
import teValidation from '../locales/te/validation.json';

import knCommon from '../locales/kn/common.json';
import knDashboard from '../locales/kn/dashboard.json';
import knLeave from '../locales/kn/leave.json';
import knExpense from '../locales/kn/expense.json';
import knDocuments from '../locales/kn/documents.json';
import knCamera from '../locales/kn/camera.json';
import knTracking from '../locales/kn/tracking.json';
import knCommunication from '../locales/kn/communication.json';
import knNav from '../locales/kn/nav.json';
import knAuth from '../locales/kn/auth.json';
import knSettings from '../locales/kn/settings.json';
import knPermissions from '../locales/kn/permissions.json';
import knAttendance from '../locales/kn/attendance.json';
import knPayroll from '../locales/kn/payroll.json';
import knEmployee from '../locales/kn/employee.json';
import knValidation from '../locales/kn/validation.json';

import mlCommon from '../locales/ml/common.json';
import mlDashboard from '../locales/ml/dashboard.json';
import mlLeave from '../locales/ml/leave.json';
import mlExpense from '../locales/ml/expense.json';
import mlDocuments from '../locales/ml/documents.json';
import mlCamera from '../locales/ml/camera.json';
import mlTracking from '../locales/ml/tracking.json';
import mlCommunication from '../locales/ml/communication.json';
import mlNav from '../locales/ml/nav.json';
import mlAuth from '../locales/ml/auth.json';
import mlSettings from '../locales/ml/settings.json';
import mlPermissions from '../locales/ml/permissions.json';
import mlAttendance from '../locales/ml/attendance.json';
import mlPayroll from '../locales/ml/payroll.json';
import mlEmployee from '../locales/ml/employee.json';
import mlValidation from '../locales/ml/validation.json';

import paCommon from '../locales/pa/common.json';
import paDashboard from '../locales/pa/dashboard.json';
import paLeave from '../locales/pa/leave.json';
import paExpense from '../locales/pa/expense.json';
import paDocuments from '../locales/pa/documents.json';
import paCamera from '../locales/pa/camera.json';
import paTracking from '../locales/pa/tracking.json';
import paCommunication from '../locales/pa/communication.json';
import paNav from '../locales/pa/nav.json';
import paAuth from '../locales/pa/auth.json';
import paSettings from '../locales/pa/settings.json';
import paPermissions from '../locales/pa/permissions.json';
import paAttendance from '../locales/pa/attendance.json';
import paPayroll from '../locales/pa/payroll.json';
import paEmployee from '../locales/pa/employee.json';
import paValidation from '../locales/pa/validation.json';

import bnCommon from '../locales/bn/common.json';
import bnDashboard from '../locales/bn/dashboard.json';
import bnLeave from '../locales/bn/leave.json';
import bnExpense from '../locales/bn/expense.json';
import bnDocuments from '../locales/bn/documents.json';
import bnCamera from '../locales/bn/camera.json';
import bnTracking from '../locales/bn/tracking.json';
import bnCommunication from '../locales/bn/communication.json';
import bnNav from '../locales/bn/nav.json';
import bnAuth from '../locales/bn/auth.json';
import bnSettings from '../locales/bn/settings.json';
import bnPermissions from '../locales/bn/permissions.json';
import bnAttendance from '../locales/bn/attendance.json';
import bnPayroll from '../locales/bn/payroll.json';
import bnEmployee from '../locales/bn/employee.json';
import bnValidation from '../locales/bn/validation.json';

import orCommon from '../locales/or/common.json';
import orDashboard from '../locales/or/dashboard.json';
import orLeave from '../locales/or/leave.json';
import orExpense from '../locales/or/expense.json';
import orDocuments from '../locales/or/documents.json';
import orCamera from '../locales/or/camera.json';
import orTracking from '../locales/or/tracking.json';
import orCommunication from '../locales/or/communication.json';
import orNav from '../locales/or/nav.json';
import orAuth from '../locales/or/auth.json';
import orSettings from '../locales/or/settings.json';
import orPermissions from '../locales/or/permissions.json';
import orAttendance from '../locales/or/attendance.json';
import orPayroll from '../locales/or/payroll.json';
import orEmployee from '../locales/or/employee.json';
import orValidation from '../locales/or/validation.json';

import asCommon from '../locales/as/common.json';
import asDashboard from '../locales/as/dashboard.json';
import asLeave from '../locales/as/leave.json';
import asExpense from '../locales/as/expense.json';
import asDocuments from '../locales/as/documents.json';
import asCamera from '../locales/as/camera.json';
import asTracking from '../locales/as/tracking.json';
import asCommunication from '../locales/as/communication.json';
import asNav from '../locales/as/nav.json';
import asAuth from '../locales/as/auth.json';
import asSettings from '../locales/as/settings.json';
import asPermissions from '../locales/as/permissions.json';
import asAttendance from '../locales/as/attendance.json';
import asPayroll from '../locales/as/payroll.json';
import asEmployee from '../locales/as/employee.json';
import asValidation from '../locales/as/validation.json';

export const resources = {
  en: {
    common: enCommon,
    dashboard: enDashboard,
    leave: enLeave,
    expense: enExpense,
    documents: enDocuments,
    camera: enCamera,
    tracking: enTracking,
    communication: enCommunication,
    nav: enNav,
    auth: enAuth,
    settings: enSettings,
    permissions: enPermissions,
    attendance: enAttendance,
    payroll: enPayroll,
    employee: enEmployee,
    validation: enValidation,
  },
  hi: {
    common: hiCommon,
    dashboard: hiDashboard,
    leave: hiLeave,
    expense: hiExpense,
    documents: hiDocuments,
    camera: hiCamera,
    tracking: hiTracking,
    communication: hiCommunication,
    nav: hiNav,
    auth: hiAuth,
    settings: hiSettings,
    permissions: hiPermissions,
    attendance: hiAttendance,
    payroll: hiPayroll,
    employee: hiEmployee,
    validation: hiValidation,
  },
  mr: {
    common: mrCommon,
    dashboard: mrDashboard,
    leave: mrLeave,
    expense: mrExpense,
    documents: mrDocuments,
    camera: mrCamera,
    tracking: mrTracking,
    communication: mrCommunication,
    nav: mrNav,
    auth: mrAuth,
    settings: mrSettings,
    permissions: mrPermissions,
    attendance: mrAttendance,
    payroll: mrPayroll,
    employee: mrEmployee,
    validation: mrValidation,
  },
  gu: {
    common: guCommon,
    dashboard: guDashboard,
    leave: guLeave,
    expense: guExpense,
    documents: guDocuments,
    camera: guCamera,
    tracking: guTracking,
    communication: guCommunication,
    nav: guNav,
    auth: guAuth,
    settings: guSettings,
    permissions: guPermissions,
    attendance: guAttendance,
    payroll: guPayroll,
    employee: guEmployee,
    validation: guValidation,
  },
  ta: {
    common: taCommon,
    dashboard: taDashboard,
    leave: taLeave,
    expense: taExpense,
    documents: taDocuments,
    camera: taCamera,
    tracking: taTracking,
    communication: taCommunication,
    nav: taNav,
    auth: taAuth,
    settings: taSettings,
    permissions: taPermissions,
    attendance: taAttendance,
    payroll: taPayroll,
    employee: taEmployee,
    validation: taValidation,
  },
  te: {
    common: teCommon,
    dashboard: teDashboard,
    leave: teLeave,
    expense: teExpense,
    documents: teDocuments,
    camera: teCamera,
    tracking: teTracking,
    communication: teCommunication,
    nav: teNav,
    auth: teAuth,
    settings: teSettings,
    permissions: tePermissions,
    attendance: teAttendance,
    payroll: tePayroll,
    employee: teEmployee,
    validation: teValidation,
  },
  kn: {
    common: knCommon,
    dashboard: knDashboard,
    leave: knLeave,
    expense: knExpense,
    documents: knDocuments,
    camera: knCamera,
    tracking: knTracking,
    communication: knCommunication,
    nav: knNav,
    auth: knAuth,
    settings: knSettings,
    permissions: knPermissions,
    attendance: knAttendance,
    payroll: knPayroll,
    employee: knEmployee,
    validation: knValidation,
  },
  ml: {
    common: mlCommon,
    dashboard: mlDashboard,
    leave: mlLeave,
    expense: mlExpense,
    documents: mlDocuments,
    camera: mlCamera,
    tracking: mlTracking,
    communication: mlCommunication,
    nav: mlNav,
    auth: mlAuth,
    settings: mlSettings,
    permissions: mlPermissions,
    attendance: mlAttendance,
    payroll: mlPayroll,
    employee: mlEmployee,
    validation: mlValidation,
  },
  pa: {
    common: paCommon,
    dashboard: paDashboard,
    leave: paLeave,
    expense: paExpense,
    documents: paDocuments,
    camera: paCamera,
    tracking: paTracking,
    communication: paCommunication,
    nav: paNav,
    auth: paAuth,
    settings: paSettings,
    permissions: paPermissions,
    attendance: paAttendance,
    payroll: paPayroll,
    employee: paEmployee,
    validation: paValidation,
  },
  bn: {
    common: bnCommon,
    dashboard: bnDashboard,
    leave: bnLeave,
    expense: bnExpense,
    documents: bnDocuments,
    camera: bnCamera,
    tracking: bnTracking,
    communication: bnCommunication,
    nav: bnNav,
    auth: bnAuth,
    settings: bnSettings,
    permissions: bnPermissions,
    attendance: bnAttendance,
    payroll: bnPayroll,
    employee: bnEmployee,
    validation: bnValidation,
  },
  or: {
    common: orCommon,
    dashboard: orDashboard,
    leave: orLeave,
    expense: orExpense,
    documents: orDocuments,
    camera: orCamera,
    tracking: orTracking,
    communication: orCommunication,
    nav: orNav,
    auth: orAuth,
    settings: orSettings,
    permissions: orPermissions,
    attendance: orAttendance,
    payroll: orPayroll,
    employee: orEmployee,
    validation: orValidation,
  },
  as: {
    common: asCommon,
    dashboard: asDashboard,
    leave: asLeave,
    expense: asExpense,
    documents: asDocuments,
    camera: asCamera,
    tracking: asTracking,
    communication: asCommunication,
    nav: asNav,
    auth: asAuth,
    settings: asSettings,
    permissions: asPermissions,
    attendance: asAttendance,
    payroll: asPayroll,
    employee: asEmployee,
    validation: asValidation,
  },
};

let isInitialized = false;

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
      console.warn(`[i18n Warning] Missing key '${key}' in namespace '${ns}' for languages [${lngs.join(', ')}]. Fallback used.`);
    },
  });

  isInitialized = true;
  return i18n;
};

export default initI18n;
