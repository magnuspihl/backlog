import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

type Secrets = {
  DISCORD_CLIENT_ID: string
  DISCORD_CLIENT_SECRET: string
  IGDB_CLIENT_ID: string
  IGDB_CLIENT_SECRET: string
}

function load(): Secrets {
  const empty: Secrets = {
    DISCORD_CLIENT_ID: '',
    DISCORD_CLIENT_SECRET: '',
    IGDB_CLIENT_ID: '',
    IGDB_CLIENT_SECRET: '',
  }
  try {
    const raw = readFileSync(join(here, 'secrets.json'), 'utf-8')
    return { ...empty, ...JSON.parse(raw) }
  } catch {
    return empty
  }
}

export const secrets = load()

export const discordConfigured = () =>
  Boolean(secrets.DISCORD_CLIENT_ID && secrets.DISCORD_CLIENT_SECRET)

export const igdbConfigured = () =>
  Boolean(secrets.IGDB_CLIENT_ID && secrets.IGDB_CLIENT_SECRET)
