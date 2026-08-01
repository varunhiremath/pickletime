// Dexie needs an IndexedDB. Node has none, so the live backend tests run against
// an in-memory implementation — the mirror behaviour is real, only the storage
// engine is substituted.
import 'fake-indexeddb/auto';
