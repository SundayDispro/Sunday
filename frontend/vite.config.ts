import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const tunnelExtraHosts = (env.VITE_TUNNEL_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  return {
    plugins: [
    react(),
    {
      name: 'serve-favicon-ico',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/favicon.ico') {
            const faviconPath = path.resolve(process.cwd(), 'public/favicon.ico')
            if (fs.existsSync(faviconPath)) {
              res.setHeader('Content-Type', 'image/x-icon')
              res.end(fs.readFileSync(faviconPath))
              return
            }
          }
          next()
        })
      },
    },
    ],
    server: {
    host: true,
    // Quick tunnel (*.trycloudflare.com) + opcional: túnel nombrado (ver VITE_TUNNEL_ALLOWED_HOSTS en .env)
    allowedHosts: ['.trycloudflare.com', ...tunnelExtraHosts],
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
    },
  }
})
