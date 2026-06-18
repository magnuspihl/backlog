import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, type PublicUser } from './api.ts'

type AuthState = {
  user: PublicUser | null
  loading: boolean
  discordReady: boolean
  igdbReady: boolean
  redirectUri: string
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [discordReady, setDiscordReady] = useState(false)
  const [igdbReady, setIgdbReady] = useState(false)
  const [redirectUri, setRedirectUri] = useState('')

  async function refresh() {
    const results = await Promise.allSettled([api.config(), api.me()])
    const [cfgResult, meResult] = results
    if (cfgResult.status === 'fulfilled') {
      setDiscordReady(cfgResult.value.discord)
      setIgdbReady(cfgResult.value.igdb)
      setRedirectUri(cfgResult.value.redirectUri)
    }
    if (meResult.status === 'fulfilled') {
      setUser(meResult.value.user)
    } else {
      setUser(null)
    }
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  async function logout() {
    await api.logout()
    setUser(null)
  }

  return (
    <Ctx.Provider value={{ user, loading, discordReady, igdbReady, redirectUri, refresh, logout }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
