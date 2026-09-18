import { AsyncLocalStorage } from 'node:async_hooks';
import * as schema from './schema.js';

export const dbContext = new AsyncLocalStorage<any>();

let defaultDb: any = null;

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
