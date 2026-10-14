import { useSyncExternalStore, useCallback } from 'react';
import { brandingStore, WebsiteBranding, DEFAULT_BRANDING } from '../services/brandingService';
import { useTranslation } from './useTranslation';

export function useWebsiteBranding() {
  const { lang } = useTranslation();

  const branding = useSyncExternalStore(
    useCallback((onStoreChange) => brandingStore.subscribe(onStoreChange), []),
    useCallback(() => brandingStore.getBranding(), [])
  );

  const websiteName = brandingStore.getName(lang);
  const websiteNameEn = branding.name_en || DEFAULT_BRANDING.name_en;
  const websiteNameHi = branding.name_hi || DEFAULT_BRANDING.name_hi;
  const websiteNameCombined = brandingStore.getCombinedName();
  const logoUrl = branding.logo_url || null;
  const shareUrl = branding.share_url || null;
  const resolvedShareUrl = brandingStore.getResolvedShareUrl();

  const updateBranding = useCallback(
    async (newBranding: Partial<WebsiteBranding>) => {
      return await brandingStore.setBranding(newBranding);
    },
    []
  );

  return {
    branding,
    websiteName,
    websiteNameEn,
    websiteNameHi,
    websiteNameCombined,
    logoUrl,
    shareUrl,
    resolvedShareUrl,
    updateBranding,
    getName: (customLang?: 'hi' | 'en') => brandingStore.getName(customLang || lang),
  };
}
