import { Pool, types, type PoolClient } from 'pg';

// Fechas como texto (sin conversiones de zona horaria) y numeric como número.
types.setTypeParser(1082, (v) => v); // date
types.setTypeParser(1114, (v) => v); // timestamp
types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // numeric
types.setTypeParser(20, (v) => Number(v)); // bigint (count)
import { SCHEMA_SQL } from './schema';

const g = globalThis as unknown as { __pool?: Pool; __schema?: Promise<void> };

function pool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error('Falta la variable de entorno DATABASE_URL (ver .env.example).');
  }
  if (!g.__pool) {
    g.__pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  }
  return g.__pool;
}

async function ensureSchema(): Promise<void> {
  if (!g.__schema) {
    g.__schema = (async () => {
      const c = await pool().connect();
      try {
        await c.query('BEGIN');
        await c.query('SELECT pg_advisory_xact_lock(726354)');
        await c.query(SCHEMA_SQL);
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK').catch(() => {});
        g.__schema = undefined;
        throw e;
      } finally {
        c.release();
      }
    })();
  }
  return g.__schema;
}

export async function q<T = Record<string, any>>(text: string, params: unknown[] = []): Promise<T[]> {
  await ensureSchema();
  const res = await pool().query(text, params as any[]);
  return res.rows as T[];
}

export async function one<T = Record<string, any>>(text: string, params: unknown[] = []): Promise<T | undefined> {
  return (await q<T>(text, params))[0];
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  await ensureSchema();
  const c = await pool().connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
