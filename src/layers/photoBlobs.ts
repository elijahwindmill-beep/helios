// Full-size photos live in IndexedDB (browser storage for files); the layer store keeps only
// the metadata and a small thumbnail, so localStorage stays small.

const DB = 'helios-photos';
const STORE = 'photos';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const savePhotoBlob = (id: string, blob: Blob) => run('readwrite', (s) => s.put(blob, id)).then(() => undefined);
export const loadPhotoBlob = (id: string) => run<Blob | undefined>('readonly', (s) => s.get(id));
export const deletePhotoBlob = (id: string) => run('readwrite', (s) => s.delete(id)).then(() => undefined);
