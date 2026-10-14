/**
 * Safe storage wrapper with in-memory fallback for sandboxed/restricted iframe environments
 * Prevents DOMException / SecurityError from crashing the app when third-party cookies or storage are blocked.
 */

const memoryStore: Record<string, string> = {};
const sessionMemoryStore: Record<string, string> = {};

function isLocalStorageAvailable(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const testKey = '__km_storage_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

function isSessionStorageAvailable(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const testKey = '__km_session_test__';
    window.sessionStorage.setItem(testKey, '1');
    window.sessionStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

const localAvailable = isLocalStorageAvailable();
const sessionAvailable = isSessionStorageAvailable();

export const safeStorage = {
  getItem(key: string): string | null {
    if (localAvailable) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        // Fallback to memory
      }
    }
    return memoryStore[key] ?? null;
  },

  setItem(key: string, value: string): void {
    if (localAvailable) {
      try {
        window.localStorage.setItem(key, value);
        return;
      } catch {
        // Fallback to memory
      }
    }
    memoryStore[key] = value;
  },

  removeItem(key: string): void {
    if (localAvailable) {
      try {
        window.localStorage.removeItem(key);
        return;
      } catch {
        // Fallback to memory
      }
    }
    delete memoryStore[key];
  },

  clear(): void {
    if (localAvailable) {
      try {
        window.localStorage.clear();
      } catch {}
    }
    for (const k in memoryStore) {
      delete memoryStore[k];
    }
  },
};

export const safeSessionStorage = {
  getItem(key: string): string | null {
    if (sessionAvailable) {
      try {
        return window.sessionStorage.getItem(key);
      } catch {
        // Fallback to memory
      }
    }
    return sessionMemoryStore[key] ?? null;
  },

  setItem(key: string, value: string): void {
    if (sessionAvailable) {
      try {
        window.sessionStorage.setItem(key, value);
        return;
      } catch {
        // Fallback to memory
      }
    }
    sessionMemoryStore[key] = value;
  },

  removeItem(key: string): void {
    if (sessionAvailable) {
      try {
        window.sessionStorage.removeItem(key);
        return;
      } catch {
        // Fallback to memory
      }
    }
    delete sessionMemoryStore[key];
  },

  clear(): void {
    if (sessionAvailable) {
      try {
        window.sessionStorage.clear();
      } catch {}
    }
    for (const k in sessionMemoryStore) {
      delete sessionMemoryStore[k];
    }
  },
};

