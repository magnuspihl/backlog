import { randomUUID } from 'node:crypto'
import { db } from './db.ts'

export type User = {
  id: string // discord user id
  username: string
  globalName: string | null
  avatar: string | null
}

export type Game = {
  id: number // igdb id
  name: string
  cover: string | null // full image url
  releaseYear: number | null
  releaseDate: number | null // igdb first_release_date, unix seconds (earliest release across platforms)
}

export type Access = 'read' | 'write'

export type List = {
  id: string
  name: string
  ownerId: string
  createdAt: number
  members: Record<string, Access> // userId -> access (excludes owner, who always has write)
  games: number[] // igdb ids, in insertion order
  orderings: Record<string, number[]> // userId -> ordered igdb ids (that user's personal order)
  vetoes: Record<string, string[]> // igdb id (string) -> userIds who vetoed it
  awaits: Record<string, string[]> // igdb id (string) -> userIds awaiting an update (play later)
}

async function init() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY,
      username text NOT NULL,
      global_name text,
      avatar text
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token text PRIMARY KEY,
      user_id text NOT NULL,
      created_at bigint NOT NULL
    );
    CREATE TABLE IF NOT EXISTS games (
      id int PRIMARY KEY,
      name text NOT NULL,
      cover text,
      release_year int
    );
    ALTER TABLE games ADD COLUMN IF NOT EXISTS release_date bigint;
    CREATE TABLE IF NOT EXISTS lists (
      id text PRIMARY KEY,
      name text NOT NULL,
      owner_id text NOT NULL,
      created_at bigint NOT NULL
    );
    CREATE TABLE IF NOT EXISTS list_members (
      list_id text NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      user_id text NOT NULL,
      access text NOT NULL,
      PRIMARY KEY (list_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS list_games (
      list_id text NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      igdb_id int NOT NULL,
      position int NOT NULL,
      PRIMARY KEY (list_id, igdb_id)
    );
    CREATE TABLE IF NOT EXISTS orderings (
      list_id text NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      user_id text NOT NULL,
      igdb_id int NOT NULL,
      rank int NOT NULL,
      PRIMARY KEY (list_id, user_id, igdb_id)
    );
    CREATE TABLE IF NOT EXISTS vetoes (
      list_id text NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      igdb_id int NOT NULL,
      user_id text NOT NULL,
      PRIMARY KEY (list_id, igdb_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS awaits (
      list_id text NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      igdb_id int NOT NULL,
      user_id text NOT NULL,
      PRIMARY KEY (list_id, igdb_id, user_id)
    );
  `)
}

// Lazy, memoized schema setup. Importing this module has no side effects (it is
// pulled in while Vite loads its config). The schema is created on the first
// request that needs it; if the database isn't reachable yet, the cached promise
// is cleared so the next request retries — the app recovers on its own once
// DATABASE_URL is present, with no restart needed.
let schemaPromise: Promise<void> | null = null

export function ready(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = init().catch((e) => {
      schemaPromise = null
      throw e
    })
  }
  return schemaPromise
}

export function newId() {
  return randomUUID()
}

// ----- users & sessions -----
export async function upsertUser(u: User) {
  await db.query(
    `INSERT INTO users (id, username, global_name, avatar) VALUES ($1,$2,$3,$4)
     ON CONFLICT (id) DO UPDATE SET username=EXCLUDED.username, global_name=EXCLUDED.global_name, avatar=EXCLUDED.avatar`,
    [u.id, u.username, u.globalName, u.avatar],
  )
}

function rowToUser(r: any): User {
  return { id: r.id, username: r.username, globalName: r.global_name, avatar: r.avatar }
}

export async function getUsers(ids: string[]): Promise<Record<string, User>> {
  const out: Record<string, User> = {}
  if (ids.length === 0) return out
  const unique = [...new Set(ids)]
  const { rows } = await db.query<any>(
    `SELECT * FROM users WHERE id = ANY($1)`,
    [unique],
  )
  for (const r of rows) out[r.id] = rowToUser(r)
  return out
}

export async function createSession(userId: string): Promise<string> {
  const token = randomUUID() + randomUUID().replace(/-/g, '')
  await db.query('INSERT INTO sessions (token, user_id, created_at) VALUES ($1,$2,$3)', [
    token,
    userId,
    Date.now(),
  ])
  return token
}

export async function userForSession(token: string | undefined): Promise<User | null> {
  if (!token) return null
  const { rows } = await db.query<any>(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1`,
    [token],
  )
  return rows[0] ? rowToUser(rows[0]) : null
}

export async function destroySession(token: string | undefined) {
  if (!token) return
  await db.query('DELETE FROM sessions WHERE token = $1', [token])
}

export async function searchUsers(q: string): Promise<User[]> {
  const like = `%${q}%`
  const { rows } = await db.query<any>(
    `SELECT * FROM users WHERE lower(username) LIKE lower($1) OR lower(coalesce(global_name,'')) LIKE lower($1) LIMIT 10`,
    [like],
  )
  return rows.map(rowToUser)
}

// ----- games cache -----
export async function cacheGames(games: Game[]) {
  for (const g of games) {
    await db.query(
      `INSERT INTO games (id, name, cover, release_year, release_date) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, cover=EXCLUDED.cover, release_year=EXCLUDED.release_year, release_date=EXCLUDED.release_date`,
      [g.id, g.name, g.cover, g.releaseYear, g.releaseDate],
    )
  }
}

export async function getGameMap(ids: number[]): Promise<Map<number, Game>> {
  const map = new Map<number, Game>()
  if (ids.length === 0) return map
  const { rows } = await db.query<any>('SELECT * FROM games WHERE id = ANY($1)', [
    [...new Set(ids)],
  ])
  for (const r of rows)
    map.set(r.id, {
      id: r.id,
      name: r.name,
      cover: r.cover,
      releaseYear: r.release_year,
      releaseDate: r.release_date == null ? null : Number(r.release_date),
    })
  return map
}

// Games whose tier could still change: no known release date, or a date that
// is still in the future. Released games (past date) never change tier, so we
// skip them to keep the periodic IGDB refresh cheap.
export async function gamesNeedingDateRefresh(): Promise<number[]> {
  const nowSecs = Math.floor(Date.now() / 1000)
  const { rows } = await db.query<any>(
    'SELECT id FROM games WHERE release_date IS NULL OR release_date > $1',
    [nowSecs],
  )
  return rows.map((r) => r.id as number)
}

async function gameExists(id: number): Promise<boolean> {
  const { rows } = await db.query('SELECT 1 FROM games WHERE id = $1', [id])
  return rows.length > 0
}

// ----- lists -----
export function accessFor(list: List, userId: string): Access | null {
  if (list.ownerId === userId) return 'write'
  return list.members[userId] ?? null
}

export async function getList(id: string): Promise<List | null> {
  const { rows } = await db.query<any>('SELECT * FROM lists WHERE id = $1', [id])
  if (!rows[0]) return null
  const row = rows[0]

  const members: Record<string, Access> = {}
  for (const m of (await db.query<any>('SELECT * FROM list_members WHERE list_id = $1', [id])).rows)
    members[m.user_id] = m.access

  const games = (
    await db.query<any>('SELECT igdb_id FROM list_games WHERE list_id = $1 ORDER BY position', [id])
  ).rows.map((r) => r.igdb_id as number)

  const orderings: Record<string, number[]> = {}
  for (const r of (
    await db.query<any>('SELECT user_id, igdb_id FROM orderings WHERE list_id = $1 ORDER BY rank', [
      id,
    ])
  ).rows) {
    ;(orderings[r.user_id] ??= []).push(r.igdb_id)
  }

  const vetoes: Record<string, string[]> = {}
  for (const r of (await db.query<any>('SELECT igdb_id, user_id FROM vetoes WHERE list_id = $1', [id]))
    .rows) {
    ;(vetoes[String(r.igdb_id)] ??= []).push(r.user_id)
  }

  const awaits: Record<string, string[]> = {}
  for (const r of (await db.query<any>('SELECT igdb_id, user_id FROM awaits WHERE list_id = $1', [id]))
    .rows) {
    ;(awaits[String(r.igdb_id)] ??= []).push(r.user_id)
  }

  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    createdAt: Number(row.created_at),
    members,
    games,
    orderings,
    vetoes,
    awaits,
  }
}

export type ListSummary = {
  id: string
  name: string
  ownerId: string
  access: Access
  gameCount: number
  memberCount: number
}

export async function listsForUser(userId: string): Promise<ListSummary[]> {
  const { rows } = await db.query<any>(
    `SELECT l.*,
            (SELECT count(*) FROM list_games g WHERE g.list_id = l.id)::int AS game_count,
            (SELECT count(*) FROM list_members m WHERE m.list_id = l.id)::int AS member_count,
            lm.access AS my_access
       FROM lists l
       LEFT JOIN list_members lm ON lm.list_id = l.id AND lm.user_id = $1
      WHERE l.owner_id = $1 OR lm.user_id = $1
      ORDER BY l.created_at DESC`,
    [userId],
  )
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    ownerId: r.owner_id,
    access: r.owner_id === userId ? 'write' : (r.my_access as Access),
    gameCount: r.game_count,
    memberCount: r.member_count + 1,
  }))
}

export async function createList(name: string, ownerId: string): Promise<List> {
  const id = newId()
  const createdAt = Date.now()
  await db.query('INSERT INTO lists (id, name, owner_id, created_at) VALUES ($1,$2,$3,$4)', [
    id,
    name,
    ownerId,
    createdAt,
  ])
  return { id, name, ownerId, createdAt, members: {}, games: [], orderings: {}, vetoes: {}, awaits: {} }
}

export async function deleteList(id: string) {
  await db.query('DELETE FROM lists WHERE id = $1', [id])
}

export async function addGameToList(listId: string, igdbId: number, fetchMeta: () => Promise<Game[]>) {
  const exists = (await db.query('SELECT 1 FROM list_games WHERE list_id=$1 AND igdb_id=$2', [
    listId,
    igdbId,
  ])).rows.length
  if (exists) return
  if (!(await gameExists(igdbId))) {
    try {
      await cacheGames(await fetchMeta())
    } catch (e) {
      console.error(e)
    }
  }
  const { rows } = await db.query<any>(
    'SELECT coalesce(max(position),-1)+1 AS pos FROM list_games WHERE list_id=$1',
    [listId],
  )
  await db.query('INSERT INTO list_games (list_id, igdb_id, position) VALUES ($1,$2,$3)', [
    listId,
    igdbId,
    rows[0].pos,
  ])
}

export async function removeGameFromList(listId: string, gameId: number) {
  await db.query('DELETE FROM list_games WHERE list_id=$1 AND igdb_id=$2', [listId, gameId])
  await db.query('DELETE FROM orderings WHERE list_id=$1 AND igdb_id=$2', [listId, gameId])
  await db.query('DELETE FROM vetoes WHERE list_id=$1 AND igdb_id=$2', [listId, gameId])
  await db.query('DELETE FROM awaits WHERE list_id=$1 AND igdb_id=$2', [listId, gameId])
}

export async function setOrdering(listId: string, userId: string, order: number[]) {
  const present = new Set(
    (await db.query<any>('SELECT igdb_id FROM list_games WHERE list_id=$1', [listId])).rows.map(
      (r) => r.igdb_id,
    ),
  )
  await db.query('DELETE FROM orderings WHERE list_id=$1 AND user_id=$2', [listId, userId])
  let rank = 0
  for (const igdbId of order) {
    if (!present.has(igdbId)) continue
    await db.query('INSERT INTO orderings (list_id, user_id, igdb_id, rank) VALUES ($1,$2,$3,$4)', [
      listId,
      userId,
      igdbId,
      rank++,
    ])
  }
}

export async function setVeto(listId: string, gameId: number, userId: string, vetoed: boolean) {
  if (vetoed) {
    await db.query(
      'INSERT INTO vetoes (list_id, igdb_id, user_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [listId, gameId, userId],
    )
  } else {
    await db.query('DELETE FROM vetoes WHERE list_id=$1 AND igdb_id=$2 AND user_id=$3', [
      listId,
      gameId,
      userId,
    ])
  }
}

export async function setAwait(listId: string, gameId: number, userId: string, awaiting: boolean) {
  if (awaiting) {
    await db.query(
      'INSERT INTO awaits (list_id, igdb_id, user_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [listId, gameId, userId],
    )
  } else {
    await db.query('DELETE FROM awaits WHERE list_id=$1 AND igdb_id=$2 AND user_id=$3', [
      listId,
      gameId,
      userId,
    ])
  }
}

export async function gameInList(listId: string, gameId: number): Promise<boolean> {
  return (
    (await db.query('SELECT 1 FROM list_games WHERE list_id=$1 AND igdb_id=$2', [listId, gameId]))
      .rows.length > 0
  )
}

export async function shareList(listId: string, userId: string, access: Access) {
  await db.query(
    `INSERT INTO list_members (list_id, user_id, access) VALUES ($1,$2,$3)
     ON CONFLICT (list_id, user_id) DO UPDATE SET access=EXCLUDED.access`,
    [listId, userId, access],
  )
}

export async function unshareList(listId: string, userId: string) {
  await db.query('DELETE FROM list_members WHERE list_id=$1 AND user_id=$2', [listId, userId])
  await db.query('DELETE FROM orderings WHERE list_id=$1 AND user_id=$2', [listId, userId])
  await db.query('DELETE FROM vetoes WHERE list_id=$1 AND user_id=$2', [listId, userId])
  await db.query('DELETE FROM awaits WHERE list_id=$1 AND user_id=$2', [listId, userId])
}
