import type { Request } from 'express'
import { secrets } from './secrets.ts'

export function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie
  if (!header) return {}
  const out: Record<string, string> = {}
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const k = part.slice(0, idx).trim()
    const v = part.slice(idx + 1).trim()
    out[k] = decodeURIComponent(v)
  }
  return out
}

// Build the absolute origin of the running app from the incoming request,
// so the OAuth redirect URI matches wherever the app is actually served.
export function originFromRequest(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0] || req.protocol || 'http'
  const host = (req.headers['x-forwarded-host'] as string)?.split(',')[0] || req.headers.host
  return `${proto}://${host}`
}

export function redirectUri(req: Request): string {
  return `${originFromRequest(req)}/api/auth/discord/callback`
}

export function discordAuthUrl(req: Request, state: string): string {
  const params = new URLSearchParams({
    client_id: secrets.DISCORD_CLIENT_ID,
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: 'identify',
    state,
    prompt: 'none',
  })
  return `https://discord.com/api/oauth2/authorize?${params}`
}

type DiscordUser = {
  id: string
  username: string
  global_name: string | null
  avatar: string | null
}

export async function exchangeCode(req: Request, code: string) {
  const body = new URLSearchParams({
    client_id: secrets.DISCORD_CLIENT_ID,
    client_secret: secrets.DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(req),
  })
  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!tokenRes.ok) throw new Error(`Discord token failed: ${tokenRes.status} ${await tokenRes.text()}`)
  const tokenJson = (await tokenRes.json()) as { access_token: string }

  const userRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  })
  if (!userRes.ok) throw new Error(`Discord user failed: ${userRes.status}`)
  const u = (await userRes.json()) as DiscordUser

  return {
    id: u.id,
    username: u.username,
    globalName: u.global_name,
    avatar: u.avatar
      ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128`
      : null,
  }
}
