import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import * as schema from './schema';

function createDb(pool: Pool) {
  return drizzle(pool, { schema });
}

export type DB = ReturnType<typeof createDb>;

// Production (Workers): one pool per request context
const perRequest = new WeakMap<object, DB>();

// Development (plain Node): one shared pool, survives HMR
const globalForDb = globalThis as unknown as { __devDb?: DB };

function getDb(): DB {
  if (process.env.NODE_ENV === 'development') {
    if (!globalForDb.__devDb) {
      const connectionString =
        process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE;
      if (!connectionString) {
        throw new Error(
          'Set CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE in .env.local',
        );
      }
      globalForDb.__devDb = createDb(new Pool({ connectionString, max: 5 }));
    }
    return globalForDb.__devDb;
  }

  const { env, ctx } = getCloudflareContext();
  let instance = perRequest.get(ctx);
  if (!instance) {
    instance = createDb(
      new Pool({ connectionString: env.HYPERDRIVE.connectionString, max: 5 }),
    );
    perRequest.set(ctx, instance);
  }
  return instance;
}

export const db = new Proxy({} as DB, {
  get(_target, prop) {
    const client = getDb();
    const value: unknown = Reflect.get(client, prop);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});