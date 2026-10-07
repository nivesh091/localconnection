import { Message, UserProfile } from '../types';
import { safeStorage } from './storage';

export interface ConversationSnapshot {
  conversationId: string;
  messages: Message[];
  otherUser?: UserProfile | null;
  updatedAt: number;
}

const DB_NAME = 'KaamMitraChatDB';
const DB_VERSION = 1;
const STORE_NAME = 'conversation_snapshots';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function getDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'conversationId' });
          }
        };

        request.onsuccess = () => {
          resolve(request.result);
        };

        request.onerror = (e) => {
          console.warn('[ChatIndexedDB] Error opening IndexedDB:', e);
          resolve(null);
        };

        request.onblocked = () => {
          console.warn('[ChatIndexedDB] IndexedDB blocked');
          resolve(null);
        };
      } catch (err) {
        console.warn('[ChatIndexedDB] Failed to initialize IndexedDB:', err);
        resolve(null);
      }
    });
  }

  return dbPromise;
}

export class ChatIndexedDB {
  /**
   * Save the most recent conversation snapshot into IndexedDB
   */
  static async saveSnapshot(
    conversationId: string,
    messages: Message[],
    otherUser?: UserProfile | null
  ): Promise<void> {
    if (!conversationId || !Array.isArray(messages)) return;

    // Filter out temporary pending items from persistent authoritative snapshot
    const serverMsgs = messages
      .filter((m) => m.status !== 'pending' && !m.id.startsWith('pending_'))
      .slice(-250);

    const snapshot: ConversationSnapshot = {
      conversationId,
      messages: serverMsgs,
      otherUser: otherUser || null,
      updatedAt: Date.now(),
    };

    // Keep immediate synchronous fallback in safeStorage
    try {
      safeStorage.setItem(`km_idb_fallback_${conversationId}`, JSON.stringify(snapshot));
    } catch {}

    try {
      const db = await getDB();
      if (!db) return;

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
        const store = tx.objectStore(STORE_NAME);
        store.put(snapshot);
      });
    } catch (err) {
      console.warn('[ChatIndexedDB] Failed to save snapshot into IndexedDB:', err);
    }
  }

  /**
   * Get the most recent conversation snapshot from IndexedDB
   */
  static async getSnapshot(conversationId: string): Promise<ConversationSnapshot | null> {
    if (!conversationId) return null;

    try {
      const db = await getDB();
      if (db) {
        const snapshot = await new Promise<ConversationSnapshot | null>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          tx.onerror = () => reject(tx.error);
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(conversationId);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => reject(req.error);
        });

        if (snapshot && Array.isArray(snapshot.messages)) {
          return snapshot;
        }
      }
    } catch (err) {
      console.warn('[ChatIndexedDB] Failed to read snapshot from IndexedDB:', err);
    }

    // Fallback to safeStorage
    try {
      const raw = safeStorage.getItem(`km_idb_fallback_${conversationId}`);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {}

    return null;
  }

  /**
   * Delete a conversation snapshot from IndexedDB
   */
  static async deleteSnapshot(conversationId: string): Promise<void> {
    if (!conversationId) return;

    try {
      safeStorage.removeItem(`km_idb_fallback_${conversationId}`);
      const db = await getDB();
      if (!db) return;

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        const store = tx.objectStore(STORE_NAME);
        store.delete(conversationId);
      });
    } catch {}
  }
}
