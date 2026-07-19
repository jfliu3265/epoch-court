import { migrateSave } from './migrate';
import type { GameState } from './types';

const DB_NAME = 'epoch-court';
const STORE = 'saves';
const CURRENT = 'current';
const FALLBACK_KEY = 'epoch-court-save-v2';

export class SaveManager {
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  async load(): Promise<GameState | null> {
    const stored = await this.read(CURRENT);
    if (!stored) return null;
    try {
      return migrateSave(stored);
    } catch {
      for (let index = 1; index <= 3; index += 1) {
        const backup = await this.read(`backup-${index}`);
        if (!backup) continue;
        try {
          return migrateSave(backup);
        } catch {
          // Try the next recovery point.
        }
      }
      return null;
    }
  }

  async save(state: GameState): Promise<void> {
    const safe = migrateSave(structuredClone(state));
    const current = await this.read(CURRENT);
    if (current) {
      const b2 = await this.read('backup-2');
      const b1 = await this.read('backup-1');
      if (b2) await this.write('backup-3', b2);
      if (b1) await this.write('backup-2', b1);
      await this.write('backup-1', current);
    }
    await this.write('pending', safe);
    const pending = await this.read('pending');
    migrateSave(pending);
    await this.write(CURRENT, safe);
  }

  export(state: GameState): string {
    return JSON.stringify(migrateSave(structuredClone(state)), null, 2);
  }

  async import(serialized: string): Promise<GameState> {
    const state = migrateSave(JSON.parse(serialized));
    await this.save(state);
    return state;
  }

  async clear(): Promise<void> {
    const db = await this.openDb();
    if (db) {
      await new Promise<void>((resolve, reject) => {
        const request = db.transaction(STORE, 'readwrite').objectStore(STORE).clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
    localStorage.removeItem(FALLBACK_KEY);
  }

  private async read(key: string): Promise<unknown | null> {
    const db = await this.openDb();
    if (!db) {
      if (key !== CURRENT) return null;
      const raw = localStorage.getItem(FALLBACK_KEY);
      return raw ? JSON.parse(raw) : null;
    }
    return new Promise((resolve) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
    });
  }

  private async write(key: string, value: unknown): Promise<void> {
    const db = await this.openDb();
    if (!db) {
      if (key === CURRENT) localStorage.setItem(FALLBACK_KEY, JSON.stringify(value));
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private openDb(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve) => {
      if (!('indexedDB' in globalThis)) return resolve(null);
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
    return this.dbPromise;
  }
}
