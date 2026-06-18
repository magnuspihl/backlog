type Secrets = {
  DISCORD_CLIENT_ID: string
  DISCORD_CLIENT_SECRET: string
  IGDB_CLIENT_ID: string
  IGDB_CLIENT_SECRET: string
}

function load(): Secrets {
  const keys: (keyof Secrets)[] = [
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
    'IGDB_CLIENT_ID',
    'IGDB_CLIENT_SECRET',
  ]
  const result = {} as Secrets
  for (const key of keys) result[key] = process.env[key]?.trim() ?? ''
  return result
}

export const secrets = load()

export const discordConfigured = () =>
  Boolean(secrets.DISCORD_CLIENT_ID && secrets.DISCORD_CLIENT_SECRET)

export const igdbConfigured = () =>
  Boolean(secrets.IGDB_CLIENT_ID && secrets.IGDB_CLIENT_SECRET)
