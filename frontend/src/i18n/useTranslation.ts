import { useState, useEffect } from 'react';
import { translations } from './translations';
import type { Language, TranslationKey } from './translations';

// Hook for internationalization
export const useTranslation = () => {
  const [language, setLanguage] = useState<Language>(() => {
    // Get language from localStorage or default to 'vi'
    const savedLanguage = localStorage.getItem('language') as Language;
    return savedLanguage && (savedLanguage === 'vi' || savedLanguage === 'en') ? savedLanguage : 'vi';
  });

  // Function to translate a key with optional interpolation
  const t = (key: TranslationKey, params?: Record<string, string | number>): string => {
    const langTranslations = translations[language];
    let translation: string = (langTranslations as any)[key] || key;
    
    if (params) {
      Object.keys(params).forEach(param => {
        translation = translation.replace(new RegExp(`{{${param}}}`, 'g'), String(params[param]));
      });
    }
    
    return translation;
  };

  // Function to change language
  const changeLanguage = (newLanguage: Language) => {
    setLanguage(newLanguage);
    localStorage.setItem('language', newLanguage);
  };

  // Effect to update document language attribute
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return {
    language,
    changeLanguage,
    t
  };
};

// Export for direct usage
export { translations, type Language, type TranslationKey };