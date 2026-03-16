import { Pool, type PoolClient, type QueryResultRow } from "pg";

declare global {
  var __postgresPool: Pool | undefined;
}

const DEFAULT_STATEMENT_TIMEOUT_MS = 5_000;
const DEFAULT_IDLE_TRANSACTION_TIMEOUT_MS = 5_000;

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }

  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" } : undefined,
    application_name: "aniguess_app",
  });

  pool.on("connect", async (client) => {
    await client.query(`SET statement_timeout TO ${DEFAULT_STATEMENT_TIMEOUT_MS}`);
    await client.query(`SET idle_in_transaction_session_timeout TO ${DEFAULT_IDLE_TRANSACTION_TIMEOUT_MS}`);
  });

  return pool;
}

function getPool(): Pool {
  if (!globalThis.__postgresPool) {
    globalThis.__postgresPool = createPool();
  }

  return globalThis.__postgresPool;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export async function dbQuery<T extends QueryResultRow>(queryText: string, values?: unknown[]) {
  const pool = getPool();
  return pool.query<T>(queryText, values);
}

export async function dbTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
