import pg from 'pg'

// Forge provisions a PostgreSQL database for every project and exposes its
// connection string as DATABASE_URL. We read it at runtime (not at import time)
// and connect lazily, so a momentarily-absent or late-provisioned database can
// never crash the dev server / frontend — the API just reports "not available"
// until the variable shows up, then recovers on the next request.
let pool: pg.Pool | null = null

export function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim())
}

function getPool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL?.trim()
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set')
  }
  if (!pool) {
    // Hosted databases sometimes require TLS that the connection string omits.
    // DATABASE_SSL=require enables it (accepting the provider cert); =false forces off.
    const sslEnv = process.env.DATABASE_SSL?.trim().toLowerCase()
    const ssl =
      sslEnv === 'require' ? { rejectUnauthorized: false } : sslEnv === 'false' ? false : undefined
    pool = new pg.Pool({ connectionString, ...(ssl !== undefined ? { ssl } : {}) })
    pool.on('error', (e) => console.error('[backlog] pg pool error:', e.message))
  }
  return pool
}

export interface Db {
  query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[] }>
  exec(sql: string): Promise<void>
}

export const db: Db = {
  async query(sql, params) {
    const r = await getPool().query(sql, params)
    return { rows: r.rows as any[] }
  },
  async exec(sql) {
    await getPool().query(sql)
  },
}
