import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { api } from './server/index.ts'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'backlog-api',
      // rev: postgres storage
      configureServer(server) {
        server.middlewares.use(api)
      },
    },
  ],
})
