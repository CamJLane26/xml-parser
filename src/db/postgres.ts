import pgPromise from 'pg-promise';
import { Toy } from '../types/toy';

const pgp = pgPromise();

// Column set for batch upserts using pgp.helpers
const toyColumns = new pgp.helpers.ColumnSet(
  [
    'name',
    'uuid',
    { name: 'data', cast: 'jsonb' },
    { name: 'created_at', def: 'NOW()', mod: ':raw' },
  ],
  { table: { table: 'toys', schema: 'public' } }
);

let db: pgPromise.IDatabase<{}> | null = null;

/**
 * Get the pg-promise database instance (lazy-initialized)
 */
export function getDb(): pgPromise.IDatabase<{}> {
  if (db) return db;

  db = pgp({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'xmlparser',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  });

  return db;
}

/**
 * Close the database connection (for graceful shutdown)
 */
export async function closeDb(): Promise<void> {
  if (db) {
    pgp.end();
    db = null;
  }
}

/**
 * Ensure the toys table exists (idempotent)
 */
export async function ensureTableExists(): Promise<void> {
  const database = getDb();
  await database.none(`
    CREATE TABLE IF NOT EXISTS public.toys (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      name TEXT NOT NULL,
      uuid TEXT NOT NULL,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT toys_uuid_unique UNIQUE (uuid)
    )
  `);
}

/**
 * Upsert a batch of toys using pgp.helpers.
 * On uuid conflict, updates name, data, and created_at.
 */
export async function upsertToysBatch(toys: Toy[]): Promise<number> {
  if (toys.length === 0) return 0;

  const database = getDb();
  const delayMs = parseInt(process.env.DB_INSERT_DELAY_MS || '0', 10);

  // Build rows for the column set
  const rows = toys.map((toy) => ({
    name: toy.name || '',
    uuid: toy.uuid || '',
    data: JSON.stringify(toy),
  }));

  // Log each toy being upserted
  for (const toy of toys) {
    console.log(`[DB] Upserting toy: name="${toy.name}", uuid="${toy.uuid}"`);
  }

  const insert = pgp.helpers.insert(rows, toyColumns);
  const onConflict =
    ' ON CONFLICT (uuid) DO UPDATE SET ' +
    'name = EXCLUDED.name, ' +
    'data = EXCLUDED.data, ' +
    'created_at = EXCLUDED.created_at';

  const query = insert + onConflict;
  const result = await database.result(query);

  console.log(`[DB] Upserted ${result.rowCount} row(s)`);

  // Optional throttle for debugging (set DB_INSERT_DELAY_MS env var)
  if (delayMs > 0) {
    await new Promise((r) => setTimeout(r, delayMs));
  }

  return result.rowCount;
}
