import { useState } from 'react'
import { api, type Access, type ListDetail, type PublicUser } from '../api.ts'

export default function SharePanel({
  list,
  onChange,
}: {
  list: ListDetail
  onChange: (l: ListDetail) => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<PublicUser[]>([])
  const [access, setAccess] = useState<Access>('write')
  const [error, setError] = useState('')

  async function search(value: string) {
    setQ(value)
    if (value.trim().length < 2) {
      setResults([])
      return
    }
    try {
      const { users } = await api.searchUsers(value.trim())
      const existing = new Set([list.ownerId, ...list.members.map((m) => m.user.id)])
      setResults(users.filter((u) => !existing.has(u.id)))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function add(userId: string) {
    try {
      const { list: updated } = await api.share(list.id, userId, access)
      onChange(updated)
      setQ('')
      setResults([])
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function remove(userId: string) {
    const { list: updated } = await api.unshare(list.id, userId)
    onChange(updated)
  }

  return (
    <div className="panel">
      <h3>Sharing</h3>
      <p className="muted small">
        Add people by Discord name. They need to have signed in to Backlog at least once to appear
        here.
      </p>

      <div className="share-add">
        <input value={q} onChange={(e) => search(e.target.value)} placeholder="Find a person…" />
        <select value={access} onChange={(e) => setAccess(e.target.value as Access)}>
          <option value="write">Can edit</option>
          <option value="read">View only</option>
        </select>
      </div>
      {error && <p className="error small">{error}</p>}
      {results.length > 0 && (
        <ul className="search-results">
          {results.map((u) => (
            <li key={u.id}>
              {u.avatar ? (
                <img src={u.avatar} alt="" className="avatar" />
              ) : (
                <div className="avatar placeholder" />
              )}
              <div className="grow">{u.globalName || u.username}</div>
              <button className="btn small" onClick={() => add(u.id)}>
                Add
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="member-list">
        <div className="member-row">
          <div className="grow">
            {list.owner ? list.owner.globalName || list.owner.username : 'Owner'}
          </div>
          <span className="tag owner">Owner</span>
        </div>
        {list.members.map((m) => (
          <div className="member-row" key={m.user.id}>
            <div className="grow">{m.user.globalName || m.user.username}</div>
            <span className={`tag ${m.access}`}>
              {m.access === 'write' ? 'Can edit' : 'View only'}
            </span>
            <button className="link-btn" onClick={() => remove(m.user.id)}>
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
