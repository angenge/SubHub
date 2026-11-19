import { AsyncLocalStorage } from 'node:async_hooks';
import * as schema from './schema.js';

export const dbContext = new AsyncLocalStorage<any>();

let defaultDb: any = null;

/**
 * Raw better-sqlite3 handle, registered only by the Node.js entry point.
 * It stays null on Cloudflare Workers, which is how the backup service decides
 * whether interactive transactions are available. Keeping the handle here (in
 * a module both runtimes already import) avoids a static dependency on the
 * native module, which would break the Workers bundle.
 */
let rawSqlite: any = null;

export function setRawSqlite(instance: any) {
  rawSqlite = instance;
}

export function getRawSqlite(): any {
  return rawSqlite;
}

export function setDefaultDb(dbInstance: any) {
  defaultDb = dbInstance;
}

export function getDb(): any {
  const store = dbContext.getStore();
  if (store) return store;
  if (defaultDb) return defaultDb;
  throw new Error('Database instance has not been initialized in current context');
}

export const db = new Proxy({} as any, {
  get(_target, prop) {
    const activeDb = getDb();
    const value = activeDb[prop];
    if (typeof value === 'function') {
      return value.bind(activeDb);
    }
    return value;
  },
});

export { schema };
