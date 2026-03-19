import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import path from 'path'
import fs from 'fs'

export default defineConfig({
  plugins: [
    react(),
    basicSsl(),
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
    // Permitir acceso desde dominios de Cloudflare Tunnel (quick tunnels: *.trycloudflare.com)
    allowedHosts: ['.trycloudflare.com'],
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
})
