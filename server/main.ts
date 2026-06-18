import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { api } from './index.ts'

// Production entry point. In dev the API is mounted as Vite middleware
// (see vite.config.ts); in production there is no Vite, so this process
// serves the built frontend (dist/) and the API on a single $PORT.
const dist = path.resolve(fileURLToPath(new URL('../dist', import.meta.url)))

const app = express()
app.use(express.static(dist))
app.use(api)
app.get('*', (_req, res) => {
  res.sendFile(path.join(dist, 'index.html'))
})

const port = Number(process.env.PORT) || 8080
app.listen(port, '0.0.0.0', () => {
  console.log(`[backlog] listening on ${port}`)
})
