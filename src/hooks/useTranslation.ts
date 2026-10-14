import { useSyncExternalStore } from 'react';
import { languageStore, Language } from '../lib/i18n';

export function useTranslation() {
  const lang = useSyncExternalStore(
    (onStoreChange) => languageStore.subscribe(onStoreChange),
    () => languageStore.getLanguage()
  );

  const t = languageStore.getStrings();

  return {
    lang,
    t,
    setLanguage: (newLang: Language) => languageStore.setLanguage(newLang),
    toggleLanguage: () => languageStore.toggleLanguage(),
  };
}
