export type PublicUser = {
  id: string
  username: string
  globalName: string | null
  avatar: string | null
}

export type Game = {
  id: number
  name: string
  cover: string | null
  releaseYear: number | null
  vetoed?: boolean
  vetoedByMe?: boolean
  vetoedBy?: string[]
}

export type Access = 'read' | 'write'

export type ListSummary = {
  id: string
  name: string
  ownerId: string
  access: Access
  gameCount: number
  memberCount: number
}

export type Member = { user: PublicUser; access: Access }

export type ListDetail = {
  id: string
  name: string
  ownerId: string
  owner: PublicUser | null
  access: Access
  createdAt: number
  members: Member[]
  sharedOrder: Game[]
  myOrder: Game[]
  contributorCount: number
}

async function req<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    let msg = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (body?.error) msg = body.error
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  return res.json() as Promise<T>
}

export const api = {
  config: () => req<{ discord: boolean; igdb: boolean; redirectUri: string }>('/api/config'),
  me: () => req<{ user: PublicUser | null }>('/api/me'),
  logout: () => req<{ ok: true }>('/api/auth/logout', { method: 'POST' }),

  lists: () => req<{ lists: ListSummary[] }>('/api/lists'),
  createList: (name: string) =>
    req<{ list: ListDetail }>('/api/lists', { method: 'POST', body: JSON.stringify({ name }) }),
  list: (id: string) => req<{ list: ListDetail }>(`/api/lists/${id}`),
  deleteList: (id: string) => req<{ ok: true }>(`/api/lists/${id}`, { method: 'DELETE' }),

  searchGames: (q: string) =>
    req<{ games: Game[] }>(`/api/games/search?q=${encodeURIComponent(q)}`),
  addGame: (id: string, igdbId: number) =>
    req<{ list: ListDetail }>(`/api/lists/${id}/games`, {
      method: 'POST',
      body: JSON.stringify({ igdbId }),
    }),
  removeGame: (id: string, gameId: number) =>
    req<{ list: ListDetail }>(`/api/lists/${id}/games/${gameId}`, { method: 'DELETE' }),
  setVeto: (id: string, gameId: number, vetoed: boolean) =>
    req<{ list: ListDetail }>(`/api/lists/${id}/games/${gameId}/veto`, {
      method: 'POST',
      body: JSON.stringify({ vetoed }),
    }),
  setOrder: (id: string, order: number[]) =>
    req<{ list: ListDetail }>(`/api/lists/${id}/order`, {
      method: 'PUT',
      body: JSON.stringify({ order }),
    }),

  searchUsers: (q: string) =>
    req<{ users: PublicUser[] }>(`/api/users/search?q=${encodeURIComponent(q)}`),
  share: (id: string, userId: string, access: Access) =>
    req<{ list: ListDetail }>(`/api/lists/${id}/share`, {
      method: 'POST',
      body: JSON.stringify({ userId, access }),
    }),
  unshare: (id: string, userId: string) =>
    req<{ list: ListDetail }>(`/api/lists/${id}/share/${userId}`, { method: 'DELETE' }),
}
