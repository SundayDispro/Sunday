import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
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
    // Resolver /favicon.ico con el SVG para evitar 404
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/favicon.ico') {
          const svgPath = path.resolve(process.cwd(), 'public/favicon.svg')
          if (fs.existsSync(svgPath)) {
            res.setHeader('Content-Type', 'image/svg+xml')
            res.end(fs.readFileSync(svgPath))
            return
          }
        }
        next()
      })
    },
  },
})
