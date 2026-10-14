import { useState, useEffect, useCallback } from 'react';
import { WorkerProfile } from '../types';
import { safeStorage } from '../lib/storage';

const STORAGE_KEY = 'km_favorite_workers';
const EVENT_NAME = 'km_favorites_updated';

export const getStoredFavorites = (): WorkerProfile[] => {
  try {
    const raw = safeStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (err) {
    console.error('Error loading favorites from storage:', err);
  }
  return [];
};

export const saveStoredFavorites = (favorites: WorkerProfile[]): void => {
  try {
    safeStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: favorites }));
    }
  } catch (err) {
    console.error('Error saving favorites to storage:', err);
  }
};

export function useFavorites(targetWorkerUserId?: string | null) {
  const [favorites, setFavorites] = useState<WorkerProfile[]>(() => getStoredFavorites());

  const syncFavorites = useCallback(() => {
    setFavorites(getStoredFavorites());
  }, []);

  useEffect(() => {
    syncFavorites();

    const handleUpdate = () => {
      syncFavorites();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(EVENT_NAME, handleUpdate);
      window.addEventListener('storage', handleUpdate);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener(EVENT_NAME, handleUpdate);
        window.removeEventListener('storage', handleUpdate);
      }
    };
  }, [syncFavorites]);

  const isFavorite = Boolean(
    targetWorkerUserId &&
      favorites.some(
        (w) => w.user_id === targetWorkerUserId || (w as any).id === targetWorkerUserId
      )
  );

  const toggleFavorite = useCallback(
    async (worker: WorkerProfile): Promise<boolean> => {
      if (!worker || !worker.user_id) return false;
      const current = getStoredFavorites();
      const existsIndex = current.findIndex(
        (w) => w.user_id === worker.user_id || (w as any).id === worker.user_id
      );

      let updated: WorkerProfile[];
      let nowFavorited: boolean;

      if (existsIndex >= 0) {
        updated = current.filter(
          (w) => w.user_id !== worker.user_id && (w as any).id !== worker.user_id
        );
        nowFavorited = false;
      } else {
        updated = [worker, ...current];
        nowFavorited = true;
      }

      saveStoredFavorites(updated);
      setFavorites(updated);
      return nowFavorited;
    },
    []
  );

  const removeFavorite = useCallback((workerUserId: string) => {
    const current = getStoredFavorites();
    const updated = current.filter(
      (w) => w.user_id !== workerUserId && (w as any).id !== workerUserId
    );
    saveStoredFavorites(updated);
    setFavorites(updated);
  }, []);

  const clearAllFavorites = useCallback(() => {
    saveStoredFavorites([]);
    setFavorites([]);
  }, []);

  return {
    favorites,
    isFavorite,
    toggleFavorite,
    removeFavorite,
    clearAllFavorites,
  };
}
