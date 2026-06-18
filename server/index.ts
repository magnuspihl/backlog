import express from 'express'
import type { Request, Response } from 'express'
import {
  ready,
  upsertUser,
  createSession,
  userForSession,
  destroySession,
  newId,
  cacheGames,
  getGameMap,
  getUsers,
  searchUsers,
  accessFor,
  listsForUser,
  getList,
  createList,
  deleteList,
  addGameToList,
  removeGameFromList,
  setOrdering,
  setVeto,
  gameInList,
  shareList,
  unshareList,
  type List,
  type User,
} from './store.ts'
import { parseCookies, discordAuthUrl, exchangeCode, redirectUri } from './auth.ts'
import { discordConfigured, igdbConfigured } from './secrets.ts'
import { searchGames, fetchGames } from './igdb.ts'
import { sharedOrder, personalOrder, enrichGames } from './lists.ts'

export const api = express()
api.use(express.json())

// Ensure the database schema exists before any request that needs it. If the
// database is unreachable, return 503 instead of hanging or crashing — except
// for /api/config, which needs no database so the frontend can still boot.
api.use(async (req, res, next) => {
  if (req.path === '/api/config' || req.path === '/api/dbcheck') return next()
  try {
    await ready()
  } catch {
    res.status(503).json({ error: 'Database is not available yet.' })
    return
  }
  next()
})

const SESSION_COOKIE = 'backlog_session'
const pendingStates = new Set<string>()

async function currentUser(req: Request): Promise<User | null> {
  const cookies = parseCookies(req)
  return userForSession(cookies[SESSION_COOKIE])
}

async function requireUser(req: Request, res: Response): Promise<User | null> {
  const user = await currentUser(req)
  if (!user) {
    res.status(401).json({ error: 'Not signed in' })
    return null
  }
  return user
}

function publicUser(u: User) {
  return { id: u.id, username: u.username, globalName: u.globalName, avatar: u.avatar }
}

function withVeto(
  games: ReturnType<typeof enrichGames>,
  list: List,
  userId: string,
  userMap: Record<string, User>,
) {
  return games.map((g) => {
    const voters = list.vetoes?.[String(g.id)] ?? []
    return {
      ...g,
      vetoed: voters.length > 0,
      vetoedByMe: voters.includes(userId),
      vetoedBy: voters.map((uid) => {
        const u = userMap[uid]
        return u ? u.globalName || u.username : 'Someone'
      }),
    }
  })
}

async function viewList(list: List, userId: string) {
  const sharedIds = sharedOrder(list)
  const myIds = personalOrder(list, userId)
  const gameMap = await getGameMap([...new Set([...sharedIds, ...myIds])])
  const userMap = await getUsers([list.ownerId, ...Object.keys(list.members)])
  const members = Object.entries(list.members).map(([id, access]) => ({
    user: userMap[id] ? publicUser(userMap[id]) : { id, username: id, globalName: null, avatar: null },
    access,
  }))
  return {
    id: list.id,
    name: list.name,
    ownerId: list.ownerId,
    owner: userMap[list.ownerId] ? publicUser(userMap[list.ownerId]) : null,
    access: accessFor(list, userId),
    createdAt: list.createdAt,
    members,
    sharedOrder: withVeto(enrichGames(sharedIds, gameMap), list, userId, userMap),
    myOrder: withVeto(enrichGames(myIds, gameMap), list, userId, userMap),
    contributorCount: Object.values(list.orderings).filter((o) => o.length > 0).length,
  }
}

// ---------- config status ----------
api.get('/api/config', (req, res) => {
  res.json({
    discord: discordConfigured(),
    igdb: igdbConfigured(),
    redirectUri: redirectUri(req),
  })
})

// ---------- database diagnostic ----------
// Safe to expose: reports where the app is trying to connect and why it fails,
// with the password removed. Lets production surface the real error instead of
// the generic "not available" message. Remove once the connection is confirmed.
api.get('/api/dbcheck', async (_req, res) => {
  const raw = process.env.DATABASE_URL?.trim()
  const sslEnv = process.env.DATABASE_SSL?.trim() ?? null
  if (!raw) {
    res.json({ databaseUrlSet: false, ssl: sslEnv, note: 'DATABASE_URL is not present in this environment.' })
    return
  }
  let host: string | null = null
  let port: string | null = null
  let database: string | null = null
  let user: string | null = null
  try {
    const u = new URL(raw)
    host = u.hostname
    port = u.port || '5432'
    database = u.pathname.replace(/^\//, '') || null
    user = u.username || null
  } catch {
    // connection string isn't URL-shaped; leave parsed fields null
  }
  const pg = (await import('pg')).default
  const ssl =
    sslEnv?.toLowerCase() === 'require'
      ? { rejectUnauthorized: false }
      : sslEnv?.toLowerCase() === 'false'
        ? false
        : undefined
  const client = new pg.Client({
    connectionString: raw,
    ...(ssl !== undefined ? { ssl } : {}),
    connectionTimeoutMillis: 5000,
  })
  try {
    await client.connect()
    const r = await client.query('SELECT version()')
    await client.end()
    res.json({
      databaseUrlSet: true,
      connected: true,
      host,
      port,
      database,
      user,
      ssl: sslEnv,
      serverVersion: r.rows[0]?.version ?? null,
    })
  } catch (e: any) {
    try {
      await client.end()
    } catch {}
    res.json({
      databaseUrlSet: true,
      connected: false,
      host,
      port,
      database,
      user,
      ssl: sslEnv,
      error: { code: e?.code ?? null, message: String(e?.message ?? e) },
    })
  }
})

// ---------- auth ----------
api.get('/api/me', async (req, res) => {
  const user = await currentUser(req)
  res.json({ user: user ? publicUser(user) : null })
})

api.get('/api/auth/discord/login', (req, res) => {
  if (!discordConfigured()) {
    res.status(503).send('Discord login is not configured yet.')
    return
  }
  const state = newId()
  pendingStates.add(state)
  res.redirect(discordAuthUrl(req, state))
})

api.get('/api/auth/discord/callback', async (req, res) => {
  const { code, state } = req.query as { code?: string; state?: string }
  if (!code || !state || !pendingStates.has(state)) {
    res.redirect('/?auth=error')
    return
  }
  pendingStates.delete(state)
  try {
    const profile = await exchangeCode(req, code)
    await upsertUser(profile)
    const token = await createSession(profile.id)
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`,
    )
    res.redirect('/')
  } catch (e) {
    console.error(e)
    res.redirect('/?auth=error')
  }
})

api.post('/api/auth/logout', async (req, res) => {
  const cookies = parseCookies(req)
  await destroySession(cookies[SESSION_COOKIE])
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
  res.json({ ok: true })
})

// ---------- game search ----------
api.get('/api/games/search', async (req, res) => {
  if (!(await requireUser(req, res))) return
  const q = String(req.query.q ?? '').trim()
  if (!q) return res.json({ games: [] })
  if (!igdbConfigured()) return res.status(503).json({ error: 'IGDB not configured' })
  try {
    const games = await searchGames(q)
    await cacheGames(games)
    res.json({ games })
  } catch (e) {
    console.error(e)
    res.status(502).json({ error: 'Game search failed' })
  }
})

// ---------- user search (to share with) ----------
api.get('/api/users/search', async (req, res) => {
  if (!(await requireUser(req, res))) return
  const q = String(req.query.q ?? '').trim()
  const matches = (await searchUsers(q)).map(publicUser)
  res.json({ users: matches })
})

// ---------- lists ----------
api.get('/api/lists', async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return
  res.json({ lists: await listsForUser(user.id) })
})

api.post('/api/lists', async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return
  const name = String(req.body?.name ?? '').trim()
  if (!name) return res.status(400).json({ error: 'Name is required' })
  const list = await createList(name, user.id)
  res.json({ list: await viewList(list, user.id) })
})

async function loadList(
  req: Request,
  res: Response,
  user: User,
  need: 'read' | 'write',
): Promise<List | null> {
  const list = await getList(req.params.id)
  if (!list) {
    res.status(404).json({ error: 'List not found' })
    return null
  }
  const access = accessFor(list, user.id)
  if (!access || (need === 'write' && access !== 'write')) {
    res.status(403).json({ error: 'You do not have access to this list' })
    return null
  }
  return list
}

api.get('/api/lists/:id', async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return
  const list = await loadList(req, res, user, 'read')
  if (!list) return
  res.json({ list: await viewList(list, user.id) })
})

api.delete('/api/lists/:id', async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return
  const list = await getList(req.params.id)
  if (!list) return res.status(404).json({ error: 'List not found' })
  if (list.ownerId !== user.id)
    return res.status(403).json({ error: 'Only the owner can delete this list' })
  await deleteList(req.params.id)
  res.json({ ok: true })
})

api.post('/api/lists/:id/games', async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return
  const list = await loadList(req, res, user, 'write')
  if (!list) return
  const igdbId = Number(req.body?.igdbId)
  if (!Number.isFinite(igdbId)) return res.status(400).json({ error: 'igdbId required' })
  await addGameToList(list.id, igdbId, () => fetchGames([igdbId]))
  const fresh = await getList(list.id)
  res.json({ list: await viewList(fresh!, user.id) })
})

api.delete('/api/lists/:id/games/:gameId', async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return
  const list = await loadList(req, res, user, 'write')
  if (!list) return
  await removeGameFromList(list.id, Number(req.params.gameId))
  const fresh = await getList(list.id)
  res.json({ list: await viewList(fresh!, user.id) })
})

api.post('/api/lists/:id/games/:gameId/veto', async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return
  const list = await loadList(req, res, user, 'write')
  if (!list) return
  const gameId = Number(req.params.gameId)
  if (!(await gameInList(list.id, gameId)))
    return res.status(404).json({ error: 'Game not in list' })
  const already = (list.vetoes?.[String(gameId)] ?? []).includes(user.id)
  const vetoed = req.body?.vetoed === undefined ? !already : Boolean(req.body.vetoed)
  await setVeto(list.id, gameId, user.id, vetoed)
  const fresh = await getList(list.id)
  res.json({ list: await viewList(fresh!, user.id) })
})

api.put('/api/lists/:id/order', async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return
  const list = await loadList(req, res, user, 'write')
  if (!list) return
  const order = Array.isArray(req.body?.order) ? req.body.order.map(Number) : null
  if (!order) return res.status(400).json({ error: 'order array required' })
  await setOrdering(list.id, user.id, order)
  const fresh = await getList(list.id)
  res.json({ list: await viewList(fresh!, user.id) })
})

api.post('/api/lists/:id/share', async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return
  const list = await getList(req.params.id)
  if (!list) return res.status(404).json({ error: 'List not found' })
  if (list.ownerId !== user.id)
    return res.status(403).json({ error: 'Only the owner can manage sharing' })
  const userId = String(req.body?.userId ?? '')
  const access = req.body?.access === 'read' ? 'read' : 'write'
  if (!userId) return res.status(400).json({ error: 'userId required' })
  if (userId === list.ownerId) return res.status(400).json({ error: 'You already own this list' })
  await shareList(list.id, userId, access)
  const fresh = await getList(list.id)
  res.json({ list: await viewList(fresh!, user.id) })
})

api.delete('/api/lists/:id/share/:userId', async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return
  const list = await getList(req.params.id)
  if (!list) return res.status(404).json({ error: 'List not found' })
  if (list.ownerId !== user.id)
    return res.status(403).json({ error: 'Only the owner can manage sharing' })
  await unshareList(list.id, req.params.userId)
  const fresh = await getList(list.id)
  res.json({ list: await viewList(fresh!, user.id) })
})

api.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

api.use((err: any, _req: Request, res: Response, _next: (e?: any) => void) => {
  const msg = String(err?.message ?? err)
  if (/DATABASE_URL/.test(msg) || err?.code === 'ECONNREFUSED') {
    console.error('[backlog] database unavailable:', msg)
    res.status(503).json({ error: 'Database is not available yet.' })
    return
  }
  console.error(err)
  res.status(500).json({ error: 'Server error' })
})
