import type { List, Game } from './store.ts'

// Whether a game has been vetoed by at least one write-access user.
export function isVetoed(list: List, gameId: number): boolean {
  return (list.vetoes?.[String(gameId)]?.length ?? 0) > 0
}

// Compute the shared ordering by averaging each game's rank across every
// user who has a personal ordering. Games nobody ranked fall back to the
// list's insertion order, placed after ranked games. Vetoed games are always
// pushed to the bottom, keeping their relative average order among themselves.
export function sharedOrder(list: List): number[] {
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
    const va = isVetoed(list, a)
    const vb = isVetoed(list, b)
    if (va !== vb) return va ? 1 : -1 // vetoed games sink to the bottom

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
    return lookup.get(id) ?? { id, name: `Game #${id}`, cover: null, releaseYear: null }
  })
}
