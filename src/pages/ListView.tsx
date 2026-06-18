import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api, type Game, type ListDetail } from '../api.ts'
import { useAuth } from '../auth.tsx'
import GameSearch from '../components/GameSearch.tsx'
import SharePanel from '../components/SharePanel.tsx'

export default function ListView() {
  const { id } = useParams<{ id: string }>()
  const { user, igdbReady } = useAuth()
  const navigate = useNavigate()
  const [list, setList] = useState<ListDetail | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'shared' | 'mine'>('shared')

  async function load() {
    try {
      const { list } = await api.list(id!)
      setList(list)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    load()
  }, [id])

  if (error) return <p className="error">{error}</p>
  if (!list) return <p className="muted">Loading…</p>

  const canEdit = list.access === 'write'
  const isOwner = user?.id === list.ownerId
  const existingIds = list.sharedOrder.map((g) => g.id)

  async function addGame(igdbId: number) {
    const { list: updated } = await api.addGame(list!.id, igdbId)
    setList(updated)
  }

  async function removeGame(gameId: number) {
    const { list: updated } = await api.removeGame(list!.id, gameId)
    setList(updated)
  }

  async function toggleVeto(g: Game) {
    const { list: updated } = await api.setVeto(list!.id, g.id, !g.vetoedByMe)
    setList(updated)
  }

  async function toggleAwait(g: Game) {
    const { list: updated } = await api.setAwait(list!.id, g.id, !g.awaitingByMe)
    setList(updated)
  }

  async function move(index: number, dir: -1 | 1) {
    const order = list!.myOrder.map((g) => g.id)
    const target = index + dir
    if (target < 0 || target >= order.length) return
    ;[order[index], order[target]] = [order[target], order[index]]
    const { list: updated } = await api.setOrder(list!.id, order)
    setList(updated)
    setTab('mine')
  }

  async function del() {
    if (!confirm(`Delete "${list!.name}"? This can't be undone.`)) return
    await api.deleteList(list!.id)
    navigate('/')
  }

  const active = tab === 'shared' ? list.sharedOrder : list.myOrder

  return (
    <div className="list-view">
      <div className="list-main">
        <div className="list-header">
          <div>
            <button className="link-btn" onClick={() => navigate('/')}>
              ← All lists
            </button>
            <h1>{list.name}</h1>
            <p className="muted small">
              {list.owner ? `by ${list.owner.globalName || list.owner.username}` : ''} ·{' '}
              {canEdit ? 'You can edit' : 'View only'}
            </p>
          </div>
          {isOwner && (
            <button className="link-btn danger" onClick={del}>
              Delete list
            </button>
          )}
        </div>

        <div className="tabs">
          <button className={tab === 'shared' ? 'tab active' : 'tab'} onClick={() => setTab('shared')}>
            Group order
          </button>
          <button className={tab === 'mine' ? 'tab active' : 'tab'} onClick={() => setTab('mine')}>
            My ranking
          </button>
        </div>

        {tab === 'shared' ? (
          <p className="muted small">
            Blended from {list.contributorCount || 0} {list.contributorCount === 1 ? 'person' : 'people'}
            's rankings. Reorder under “My ranking” to change where you pull it.
          </p>
        ) : canEdit ? (
          <p className="muted small">Your personal order. Use the arrows to rank games up or down.</p>
        ) : (
          <p className="muted small">You have view-only access, so you can't rank this list.</p>
        )}

        {active.length === 0 ? (
          <p className="muted">No games yet{canEdit ? ' — add some below.' : '.'}</p>
        ) : (
          <ol className="game-list">
            {active.map((g: Game, i: number) => (
              <li
                key={g.id}
                className={
                  g.vetoed
                    ? 'game-row vetoed'
                    : g.unreleased
                      ? 'game-row unreleased'
                      : g.awaiting
                        ? 'game-row awaiting'
                        : 'game-row'
                }
              >
                <span className="rank">{i + 1}</span>
                {g.cover ? (
                  <img src={g.cover} alt="" className="cover-sm" />
                ) : (
                  <div className="cover-sm placeholder" />
                )}
                <div className="grow">
                  <div className="game-name">{g.name}</div>
                  {g.vetoed ? (
                    <div className="veto-note" title={`Vetoed by ${(g.vetoedBy ?? []).join(', ')}`}>
                      🚫 Vetoed by {(g.vetoedBy ?? []).join(', ')}
                    </div>
                  ) : g.unreleased ? (
                    <div className="unreleased-note" title="Not released yet (per IGDB)">
                      📅 Unreleased{g.releaseYear ? ` — due ${g.releaseYear}` : ''}
                    </div>
                  ) : g.awaiting ? (
                    <div
                      className="await-note"
                      title={`Awaiting an update — flagged by ${(g.awaitingBy ?? []).join(', ')}`}
                    >
                      ⏳ Play later — {(g.awaitingBy ?? []).join(', ')}
                    </div>
                  ) : (
                    g.releaseYear && <div className="muted small">{g.releaseYear}</div>
                  )}
                </div>
                <div className="row-actions">
                  {tab === 'mine' && canEdit && (
                    <>
                      <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)}>
                        ↑
                      </button>
                      <button
                        className="icon-btn"
                        disabled={i === active.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        ↓
                      </button>
                    </>
                  )}
                  {canEdit && (
                    <button
                      className={g.awaitingByMe ? 'icon-btn await active' : 'icon-btn await'}
                      title={
                        g.awaitingByMe
                          ? 'Stop awaiting — rank it normally'
                          : 'Await update — keep it, but play later'
                      }
                      onClick={() => toggleAwait(g)}
                    >
                      ⏳
                    </button>
                  )}
                  {canEdit && (
                    <button
                      className={g.vetoedByMe ? 'icon-btn veto active' : 'icon-btn veto'}
                      title={g.vetoedByMe ? 'Remove your veto' : 'Veto this game'}
                      onClick={() => toggleVeto(g)}
                    >
                      🚫
                    </button>
                  )}
                  {canEdit && (
                    <button className="icon-btn danger" title="Remove from list" onClick={() => removeGame(g.id)}>
                      ✕
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}

        {canEdit && (
          <section className="add-section">
            <h3>Add a game</h3>
            <GameSearch igdbReady={igdbReady} existingIds={existingIds} onAdd={addGame} />
          </section>
        )}
      </div>

      <aside className="list-side">
        {isOwner ? (
          <SharePanel list={list} onChange={setList} />
        ) : (
          <div className="panel">
            <h3>Members</h3>
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
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}
