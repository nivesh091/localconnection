import { useState, useEffect } from 'react';
import { AdminService, CallingSettingsControls } from '../services/adminService';

export interface UseCallingSettingsResult {
  mobileCallingEnabled: boolean;
  internetCallingEnabled: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useCallingSettings(): UseCallingSettingsResult {
  const initial = AdminService.getCachedCallingSettings();

  const [settings, setSettings] = useState<CallingSettingsControls>(() => ({
    mobile_calling_enabled: initial ? initial.mobile_calling_enabled : true,
    internet_calling_enabled: initial ? initial.internet_calling_enabled : true,
  }));
  const [isLoading, setIsLoading] = useState<boolean>(!initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    // Fast path: load or subscribe
    AdminService.getCallingSettings()
      .then((s) => {
        if (isMounted) {
          setSettings(s);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load calling settings');
          // Fail safely: do not allow a disabled calling method to be used
          setSettings({
            mobile_calling_enabled: false,
            internet_calling_enabled: false,
          });
          setIsLoading(false);
        }
      });

    // Realtime subscription
    const unsubscribe = AdminService.subscribeToCallingSettings((updated) => {
      if (isMounted) {
        setSettings(updated);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  return {
    mobileCallingEnabled: settings.mobile_calling_enabled,
    internetCallingEnabled: settings.internet_calling_enabled,
    isLoading,
    error,
  };
}
