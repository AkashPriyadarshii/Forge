import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/Forge/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['wasm/esbuild.wasm'],
      manifest: {
        name: 'Forge',
        short_name: 'Forge',
        description: 'Local-first, zero-account multi-file code editor that builds real projects in your browser.',
        start_url: '/Forge/',
        scope: '/Forge/',
        display: 'standalone',
        background_color: '#0e1114',
        theme_color: '#0e1114',
        icons: [{ src: 'forge.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
        // the 10 MB wasm bundle must survive offline; cache it immutable
        runtimeCaching: [{
          urlPattern: /esbuild\.wasm$/,
          handler: 'CacheFirst',
          options: { cacheName: 'forge-wasm', expiration: { maxEntries: 1 }, cacheableResponse: { statuses: [200] } },
        }],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('@codemirror') || id.includes('@lezer')) return 'cm'
        },
      },
    },
  },
})
