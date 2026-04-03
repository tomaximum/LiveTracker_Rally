/**
 * Storage Manager using IndexedDB to overcome localStorage 5MB limit.
 */
const DB_NAME = 'LiveTrackRallyDB';
const DB_VERSION = 1;
const STORE_GPX = 'gpx';
const STORE_PILOTS = 'pilots';

let db = null;
let dbPromise = null;

async function initDB() {
    if (dbPromise) return dbPromise;
    
    dbPromise = new Promise((resolve, reject) => {
        console.log('[DB] Initialization...');
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_GPX)) {
                database.createObjectStore(STORE_GPX, { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains(STORE_PILOTS)) {
                database.createObjectStore(STORE_PILOTS, { keyPath: 'id' });
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            console.log('[DB] Connected.');
            resolve(db);
        };

        request.onerror = (event) => {
            console.error('[DB] Error opening database:', event.target.error);
            dbPromise = null; // Allow retry
            reject(event.target.error);
        };
    });
    
    return dbPromise;
}

/**
 * Save a GPX file to IndexedDB with metadata (color, visibility)
 */
async function dbSaveGpx(id, name, xml, color, visible) {
    if (!db) await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_GPX], 'readwrite');
        const store = transaction.objectStore(STORE_GPX);
        const payload = { 
            id, name, xml, 
            color: color || '#3b82f6', 
            visible: visible !== undefined ? visible : true,
            timestamp: Date.now() 
        };
        const request = store.put(payload);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Remove a GPX file from IndexedDB
 */
async function dbDeleteGpx(id) {
    if (!db) await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_GPX], 'readwrite');
        const store = transaction.objectStore(STORE_GPX);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get all GPX files from IndexedDB
 */
async function dbGetAllGpx() {
    if (!db) await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_GPX], 'readonly');
        const store = transaction.objectStore(STORE_GPX);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Save participant state (id, name, history, etc.)
 */
async function dbSavePilot(id, data) {
    if (!db) await initDB();
    // Only save serializable data (no Leaflet objects)
    const payload = {
        id: id,
        name: data.name,
        lat: data.lat,
        lng: data.lng,
        lastUpdate: data.lastUpdate,
        history: data.history || [],
        color: data.color,
        avatar: data.avatar
    };

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_PILOTS], 'readwrite');
        const store = transaction.objectStore(STORE_PILOTS);
        const request = store.put(payload);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Remove a pilot from IndexedDB
 */
async function dbDeletePilot(id) {
    if (!db) await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_PILOTS], 'readwrite');
        const store = transaction.objectStore(STORE_PILOTS);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get all saved pilots
 */
async function dbGetAllPilots() {
    if (!db) await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_PILOTS], 'readonly');
        const store = transaction.objectStore(STORE_PILOTS);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Clear everything
 */
async function dbClearAll() {
    if (!db) await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_GPX, STORE_PILOTS], 'readwrite');
        transaction.objectStore(STORE_GPX).clear();
        transaction.objectStore(STORE_PILOTS).clear();
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}
