import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { api } from './server/index.ts'

// Build-time version stamp: commit count (auto-increments every commit) plus
// short hash, so the deployed footer can confirm which build is actually
// live. Falls back to a timestamp if the build context has no git history.
function buildVersion() {
  try {
    const count = execSync('git rev-list --count HEAD').toString().trim()
    const hash = execSync('git rev-parse --short HEAD').toString().trim()
    return `${count}-${hash}`
  } catch {
    return `dev-${Date.now()}`
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion()),
  },
  plugins: [
    react(),
    {
      name: 'backlog-api',
      // rev: reload server code (steam store links, websites.type)
      configureServer(server) {
        server.middlewares.use(api)
      },
    },
  ],
})
