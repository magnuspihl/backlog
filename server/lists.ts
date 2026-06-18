import type { List, Game } from './store.ts'

// Whether a game has been vetoed by at least one write-access user.
export function isVetoed(list: List, gameId: number): boolean {
  return (list.vetoes?.[String(gameId)]?.length ?? 0) > 0
}

// Whether a game is flagged "await update" by at least one write-access user.
export function isAwaited(list: List, gameId: number): boolean {
  return (list.awaits?.[String(gameId)]?.length ?? 0) > 0
}

// Purely metadata-driven: a game counts as released only when IGDB gives it a
// release date that is already in the past — which includes early-access
// titles, whose launch date has passed. Everything else is "unreleased": a
// future date, or no known date at all (TBD/undated games are treated as
// not-yet-released). The periodic refresh keeps these dates current.
export function isUnreleased(game: Game | undefined): boolean {
  if (!game || game.releaseDate == null) return true
  return game.releaseDate * 1000 > Date.now()
}

// Group tier (higher sinks lower): 0 = normal, 1 = awaiting an update,
// 2 = unreleased, 3 = vetoed. A veto wins over everything; an unreleased game
// sits below awaited ones regardless of any await flag.
function tier(list: List, gameId: number, meta: Map<number, Game>): 0 | 1 | 2 | 3 {
  if (isVetoed(list, gameId)) return 3
  if (isUnreleased(meta.get(gameId))) return 2
  if (isAwaited(list, gameId)) return 1
  return 0
}

// Compute the shared ordering by averaging each game's rank across every
// user who has a personal ordering. Games nobody ranked fall back to the
// list's insertion order, placed after ranked games. Awaited games sink below
// the normal ones, and vetoed games below those — each tier keeping its
// relative average order among itself.
export function sharedOrder(list: List, meta: Map<number, Game>): number[] {
  const orderings = Object.values(list.orderings).filter((o) => o.length > 0)
  const insertionIndex = new Map(list.games.map((id, i) => [id, i]))

  const ranks = new Map<number, number[]>()
  for (const ordering of orderings) {
    ordering.forEach((gameId, rank) => {
      if (!insertionIndex.has(gameId)) return
      const arr = ranks.get(gameId) ?? []
      arr.push(rank)
      ranks.set(gameId, arr)
    })
  }

  return [...list.games].sort((a, b) => {
    const ta = tier(list, a, meta)
    const tb = tier(list, b, meta)
    if (ta !== tb) return ta - tb // normal, then awaiting, then unreleased, then vetoed

    if (orderings.length === 0) {
      return (insertionIndex.get(a) ?? 0) - (insertionIndex.get(b) ?? 0)
    }
    const ra = ranks.get(a)
    const rb = ranks.get(b)
    const avgA = ra && ra.length ? ra.reduce((s, n) => s + n, 0) / ra.length : Infinity
    const avgB = rb && rb.length ? rb.reduce((s, n) => s + n, 0) / rb.length : Infinity
    if (avgA !== avgB) return avgA - avgB
    return (insertionIndex.get(a) ?? 0) - (insertionIndex.get(b) ?? 0)
  })
}

// A user's personal order: their saved ordering, reconciled with the list's
// current games (new games appended, removed games dropped).
export function personalOrder(list: List, userId: string): number[] {
  const saved = list.orderings[userId] ?? []
  const present = new Set(list.games)
  const ordered = saved.filter((id) => present.has(id))
  const seen = new Set(ordered)
  for (const id of list.games) if (!seen.has(id)) ordered.push(id)
  return ordered
}

export function enrichGames(ids: number[], lookup: Map<number, Game>) {
  return ids.map((id) => {
    return (
      lookup.get(id) ?? {
        id,
        name: `Game #${id}`,
        cover: null,
        releaseYear: null,
        releaseDate: null,
        storeUrl: null,
      }
    )
  })
}
