/**
 * Safe storage wrapper with in-memory fallback for sandboxed/restricted iframe environments
 * Prevents DOMException / SecurityError from crashing the app when third-party cookies or storage are blocked.
 */

const memoryStore: Record<string, string> = {};

export const safeStorage = {
  getItem(key: string): string | null {
    try {
      if (typeof window !== 'undefined' && 'localStorage' in window && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {
      // restricted iframe or storage disabled
    }
    return memoryStore[key] ?? null;
  },

  setItem(key: string, value: string): void {
    try {
      if (typeof window !== 'undefined' && 'localStorage' in window && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch {
      // restricted iframe or storage disabled
    }
    memoryStore[key] = value;
  },

  removeItem(key: string): void {
    try {
      if (typeof window !== 'undefined' && 'localStorage' in window && window.localStorage) {
        window.localStorage.removeItem(key);
        return;
      }
    } catch {
      // restricted iframe or storage disabled
    }
    delete memoryStore[key];
  },
};
