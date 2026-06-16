import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type ListSummary } from '../api.ts'

export default function Dashboard() {
  const [lists, setLists] = useState<ListSummary[]>([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()

  async function load() {
    const { lists } = await api.lists()
    setLists(lists)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    try {
      const { list } = await api.createList(name.trim())
      navigate(`/lists/${list.id}`)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="stack">
      <section className="panel">
        <h2>New list</h2>
        <form className="row" onSubmit={create}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Co-op night, RPGs to finish, 2024 wishlist"
          />
          <button className="btn" disabled={creating || !name.trim()}>
            Create
          </button>
        </form>
      </section>

      <section>
        <h2>Your lists</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : lists.length === 0 ? (
          <p className="muted">No lists yet. Create your first one above.</p>
        ) : (
          <div className="card-grid">
            {lists.map((l) => (
              <Link key={l.id} to={`/lists/${l.id}`} className="list-card">
                <h3>{l.name}</h3>
                <div className="list-meta">
                  <span>{l.gameCount} game{l.gameCount === 1 ? '' : 's'}</span>
                  <span>·</span>
                  <span>
                    {l.memberCount} member{l.memberCount === 1 ? '' : 's'}
                  </span>
                </div>
                <span className={`tag ${l.access}`}>
                  {l.ownerId ? '' : ''}
                  {l.access === 'write' ? 'Can edit' : 'View only'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
