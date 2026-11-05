import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'safari-no-cache',
      transformIndexHtml(html) {
        return html.replace('/src/main.tsx', `/src/main.tsx?t=${Date.now()}`)
      },
    },
  ],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
    },
  },
})
