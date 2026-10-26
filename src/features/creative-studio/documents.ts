import type { PostSizeId } from '../post-design/templates';
import type { PlatformVariant } from './platforms';
import type { CreativeDirection } from './design-plan';
import type { LayeredDesign } from './creative-renderer';
import type { LogoVariant } from '../brand/approved';

export interface DesignSnapshot {
  id: string;
  savedAt: string;
  templateId: string;
  direction?: CreativeDirection;
  platform: string;
  sizeId: PostSizeId;
  variants?: PlatformVariant[];
  canvasDocument?: LayeredDesign;
  logoVariant?: LogoVariant | 'auto';
  layers: {
    backgroundImage: string;
    eyebrow: string;
    headline: string;
    body: string;
    detail: string;
    cta: string;
    approvedLogo: { locked: true; assetId: string };
  };
}
export interface DesignDocument { id: string; name: string; updatedAt: string; versions: DesignSnapshot[] }

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('engosoft-creative-studio', 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('documents')) request.result.createObjectStore('documents', { keyPath: 'id' }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, done: (value: T) => void) => void): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', mode);
    let value: T;
    action(tx.objectStore('documents'), (next) => { value = next; });
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
export async function getDesignDocument(id: string): Promise<DesignDocument | undefined> {
  return transaction('readonly', (store, done) => { const request = store.get(id); request.onsuccess = () => done(request.result as DesignDocument | undefined); });
}
export async function listDesignDocuments(): Promise<DesignDocument[]> {
  const records = await transaction<DesignDocument[]>('readonly', (store, done) => { const request = store.getAll(); request.onsuccess = () => done(request.result as DesignDocument[]); });
  return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function saveDesignVersion(id: string, name: string, snapshot: Omit<DesignSnapshot, 'id' | 'savedAt'>): Promise<DesignDocument> {
  const prior = await getDesignDocument(id);
  const version: DesignSnapshot = { ...snapshot, id: crypto.randomUUID(), savedAt: new Date().toISOString() };
  const record: DesignDocument = { id, name, updatedAt: version.savedAt, versions: [version, ...(prior?.versions ?? [])].slice(0, 20) };
  await transaction<void>('readwrite', (store, done) => { store.put(record); done(); });
  return record;
}
