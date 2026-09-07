// src/i18n/index.js
// i18next initialization for IDVRS — Hindi (hi) + English (en)
// Default language: Hindi (matches current hardcoded UI)
// Persistence: localStorage key 'idvrs_lang'

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import hi from './hi.json';
import en from './en.json';

const savedLang = localStorage.getItem('idvrs_lang') || 'hi';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      hi: { translation: hi },
      en: { translation: en },
    },
    lng: savedLang,
    fallbackLng: 'hi',
    interpolation: {
      escapeValue: false, // React already escapes by default
    },
  });

export default i18n;
