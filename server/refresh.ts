import { ready, gamesNeedingDateRefresh, gamesNeedingStoreUrl, cacheGames } from './store.ts'
import { fetchGames } from './igdb.ts'
import { igdbConfigured } from './secrets.ts'
import { databaseConfigured } from './db.ts'

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000 // every 6 hours
const BATCH = 200

let running = false

// Re-pull IGDB metadata for every game that isn't confirmed released yet, so
// release dates firm up over time and games automatically leave the
// "unreleased" tier once their date passes — no user action involved.
export async function refreshReleaseDates(): Promise<void> {
  if (running) return
  if (!databaseConfigured() || !igdbConfigured()) return
  running = true
  try {
    await ready()
    const ids = await gamesNeedingDateRefresh()
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH)
      try {
        const games = await fetchGames(batch)
        if (games.length) await cacheGames(games)
      } catch (e) {
        console.error('[backlog] release-date refresh batch failed:', (e as Error).message)
      }
    }
  } catch (e) {
    console.error('[backlog] release-date refresh skipped:', (e as Error).message)
  } finally {
    running = false
  }
}

let backfilling = false

// One-time backfill: fill in Steam store links for games that were cached
// before links were tracked (their store_url is null and was never checked).
// Each fetched game is marked checked, so games genuinely not on Steam aren't
// re-fetched on the next boot.
export async function backfillStoreUrls(): Promise<void> {
  if (backfilling) return
  if (!databaseConfigured() || !igdbConfigured()) return
  backfilling = true
  try {
    await ready()
    const ids = await gamesNeedingStoreUrl()
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH)
      try {
        const games = await fetchGames(batch)
        if (games.length) await cacheGames(games)
      } catch (e) {
        console.error('[backlog] store-url backfill batch failed:', (e as Error).message)
      }
    }
  } catch (e) {
    console.error('[backlog] store-url backfill skipped:', (e as Error).message)
  } finally {
    backfilling = false
  }
}

let started = false

export function startReleaseDateRefresh(): void {
  if (started) return
  started = true
  // Kick off shortly after boot (let the schema/DB settle), then on a timer.
  setTimeout(() => void refreshReleaseDates(), 30_000)
  setTimeout(() => void backfillStoreUrls(), 30_000)
  const timer = setInterval(() => void refreshReleaseDates(), REFRESH_INTERVAL_MS)
  // Don't keep the process alive just for this.
  if (typeof timer.unref === 'function') timer.unref()
}
