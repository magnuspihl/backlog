import { useEffect, useRef, useState } from 'react'
import { api, type Game } from '../api.ts'

export default function GameSearch({
  igdbReady,
  existingIds,
  onAdd,
}: {
  igdbReady: boolean
  existingIds: number[]
  onAdd: (igdbId: number) => Promise<void>
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Game[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [addingId, setAddingId] = useState<number | null>(null)
  const [highlight, setHighlight] = useState(0)
  const timer = useRef<number | undefined>(undefined)
  const listRef = useRef<HTMLUListElement | null>(null)

  useEffect(() => {
    if (!igdbReady) return
    window.clearTimeout(timer.current)
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    timer.current = window.setTimeout(async () => {
      setSearching(true)
      setError('')
      try {
        const { games } = await api.searchGames(q.trim())
        setResults(games)
        setHighlight(0)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setSearching(false)
      }
    }, 350)
    return () => window.clearTimeout(timer.current)
  }, [q, igdbReady])

  useEffect(() => {
    const el = listRef.current?.children[highlight] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlight])

  async function addGame(g: Game) {
    if (existingIds.includes(g.id) || addingId === g.id) return
    setAddingId(g.id)
    try {
      await onAdd(g.id)
      setQ('')
      setResults([])
    } finally {
      setAddingId(null)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => (h + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => (h - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const g = results[highlight]
      if (g) addGame(g)
    }
  }

  if (!igdbReady) {
    return (
      <div className="notice">
        Game search isn't switched on yet. Once the IGDB keys are added, you'll be able to search
        the full game database here.
      </div>
    )
  }

  return (
    <div className="game-search">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search for a game to add…"
      />
      {searching && <p className="muted small">Searching…</p>}
      {error && <p className="error small">{error}</p>}
      {results.length > 0 && (
        <ul className="search-results" ref={listRef}>
          {results.map((g, i) => {
            const already = existingIds.includes(g.id)
            return (
              <li
                key={g.id}
                className={i === highlight ? 'active' : ''}
                onMouseEnter={() => setHighlight(i)}
              >
                {g.cover ? (
                  <img src={g.cover} alt="" className="cover-sm" />
                ) : (
                  <div className="cover-sm placeholder" />
                )}
                <div className="grow">
                  <div className="game-name">{g.name}</div>
                  {g.releaseYear && <div className="muted small">{g.releaseYear}</div>}
                </div>
                <button
                  className="btn small"
                  disabled={already || addingId === g.id}
                  onClick={() => addGame(g)}
                >
                  {already ? 'Added' : addingId === g.id ? 'Adding…' : 'Add'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
