import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

function createDb() {
  return drizzle(neon(process.env.DATABASE_URL!), { schema });
}

export type DB = ReturnType<typeof createDb>;

export const db = new Proxy({} as DB, {
  get(_target, prop) {
    const client = createDb();
    const value: unknown = Reflect.get(client, prop);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});