import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))
const pgDir = join(here, '..', '.data', 'pg')

// A tiny abstraction over "the database". Both backends speak Postgres SQL with
// $1-style params and return { rows }, so the rest of the app is identical
// whether data lives in the embedded engine or an external server.
export interface Db {
  query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[] }>
  exec(sql: string): Promise<void>
  kind: 'external' | 'embedded'
}

function sslOption(): pg.PoolConfig['ssl'] {
  // Many hosted Postgres providers require TLS but use certs Node won't verify
  // by default. DATABASE_SSL controls it without touching the connection string.
  const mode = (process.env.DATABASE_SSL ?? '').toLowerCase()
  if (mode === 'false' || mode === 'disable' || mode === 'off') return false
  if (mode === 'require' || mode === 'no-verify' || mode === 'true' || mode === 'on')
    return { rejectUnauthorized: false }
  return undefined // let the connection string / libpq defaults decide
}

function makeDb(): Db {
  const url = process.env.DATABASE_URL?.trim()
  if (url) {
    const pool = new pg.Pool({ connectionString: url, ssl: sslOption() })
    return {
      kind: 'external',
      async query(sql, params) {
        const r = await pool.query(sql, params)
        return { rows: r.rows as any[] }
      },
      async exec(sql) {
        await pool.query(sql)
      },
    }
  }
  const lite = new PGlite(pgDir)
  return {
    kind: 'embedded',
    async query(sql, params) {
      const r = await lite.query(sql, params)
      return { rows: r.rows as any[] }
    },
    async exec(sql) {
      await lite.exec(sql)
    },
  }
}

export const db = makeDb()
