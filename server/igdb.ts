import { secrets, igdbConfigured } from './secrets.ts'
import type { Game } from './store.ts'

let token: { value: string; expires: number } | null = null

async function getToken(): Promise<string> {
  if (token && token.expires > Date.now() + 60_000) return token.value
  const params = new URLSearchParams({
    client_id: secrets.IGDB_CLIENT_ID,
    client_secret: secrets.IGDB_CLIENT_SECRET,
    grant_type: 'client_credentials',
  })
  const res = await fetch(`https://id.twitch.tv/oauth2/token?${params}`, { method: 'POST' })
  if (!res.ok) throw new Error(`Twitch token failed: ${res.status} ${await res.text()}`)
  const json = (await res.json()) as { access_token: string; expires_in: number }
  token = { value: json.access_token, expires: Date.now() + json.expires_in * 1000 }
  return token.value
}

type RawGame = {
  id: number
  name: string
  first_release_date?: number
  cover?: { image_id?: string }
  websites?: { type?: number; url?: string }[]
}

// IGDB website type 13 = Steam.
const STEAM_TYPE = 13

function steamUrl(g: RawGame): string | null {
  const site = g.websites?.find((w) => w.type === STEAM_TYPE && w.url)
  return site?.url ?? null
}

function toGame(g: RawGame): Game {
  const coverId = g.cover?.image_id
  return {
    id: g.id,
    name: g.name,
    cover: coverId ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${coverId}.jpg` : null,
    releaseYear: g.first_release_date
      ? new Date(g.first_release_date * 1000).getUTCFullYear()
      : null,
    releaseDate: g.first_release_date ?? null,
    storeUrl: steamUrl(g),
  }
}

async function query(body: string): Promise<RawGame[]> {
  const accessToken = await getToken()
  const res = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: {
      'Client-ID': secrets.IGDB_CLIENT_ID,
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    body,
  })
  if (!res.ok) throw new Error(`IGDB query failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as RawGame[]
}

export async function searchGames(q: string): Promise<Game[]> {
  if (!igdbConfigured()) throw new Error('IGDB not configured')
  const safe = q.replace(/"/g, '')
  const body = `search "${safe}"; fields name, first_release_date, cover.image_id, websites.type, websites.url; where version_parent = null & game_type = 0; limit 20;`
  const rows = await query(body)
  return rows.map(toGame)
}

export async function fetchGames(ids: number[]): Promise<Game[]> {
  if (ids.length === 0) return []
  if (!igdbConfigured()) throw new Error('IGDB not configured')
  const body = `fields name, first_release_date, cover.image_id, websites.type, websites.url; where id = (${ids.join(',')}); limit ${ids.length};`
  const rows = await query(body)
  return rows.map(toGame)
}
