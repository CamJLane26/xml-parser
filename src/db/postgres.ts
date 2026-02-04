import { Pool, PoolClient, QueryResult } from 'pg';
import { Toy } from '../types/toy';

let pool: Pool | null = null;

/**
 * Initialize PostgreSQL connection pool
 */
export function initializePool(): Pool {
  if (pool) {
    return pool;
  }

  pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'xmlparser',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    max: parseInt(process.env.DB_POOL_MAX || '20', 10),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '2000', 10),
  });

  pool.on('error', (err: Error) => {
    console.error('Unexpected error on idle client', err);
  });

  return pool;
}

/**
 * Get the connection pool
 */
export function getPool(): Pool {
  if (!pool) {
    return initializePool();
  }
  return pool;
}

/**
 * Close the connection pool (for graceful shutdown)
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Insert a batch of toys into the database
 * Uses a transaction to ensure all-or-nothing insertion
 */
export async function insertToysBatch(
  client: PoolClient,
  toys: Toy[],
  batchId?: string
): Promise<number> {
  if (toys.length === 0) {
    return 0;
  }

  // Build the INSERT query with parameterized values
  const values: any[] = [];
  const placeholders: string[] = [];
  let paramIndex = 1;

  for (const toy of toys) {
    const toyJson = JSON.stringify(toy);
    placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2})`);
    values.push(batchId || null, toyJson, new Date());
    paramIndex += 3;
  }

  const query = `
    INSERT INTO toys (batch_id, data, created_at)
    VALUES ${placeholders.join(', ')}
  `;

  const result = await client.query(query, values);
  return result.rowCount || 0;
}

/**
 * Create the toys table if it doesn't exist
 */
export async function ensureTableExists(client: PoolClient): Promise<void> {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS toys (
      id SERIAL PRIMARY KEY,
      batch_id VARCHAR(255),
      data JSONB NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  await client.query(createTableQuery);

  // Create indexes if they don't exist
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_batch_id ON toys(batch_id)
  `);
  
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_created_at ON toys(created_at)
  `);
}

/**
 * Get a client from the pool and ensure table exists
 */
export async function getClient(): Promise<PoolClient> {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    await ensureTableExists(client);
  } catch (error) {
    client.release();
    throw error;
  }
  
  return client;
}
