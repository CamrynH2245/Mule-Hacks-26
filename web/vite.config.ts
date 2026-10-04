import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const pagesBasePath = process.env.VITE_GH_PAGES_BASE_PATH || '/'

export default defineConfig({
  base: pagesBasePath,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Event Hosting',
        short_name: 'Event Hosting',
        description: 'Create events and manage teams, rooms, and mentors',
        theme_color: '#1e293b',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: pagesBasePath,
        icons: [{ src: `${pagesBasePath}favicon.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
})
