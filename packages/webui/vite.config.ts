import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Provide process.env as an empty object in the browser.
// This does NOT expose your local env: it only prevents client-side errors from code or deps that reference process.env.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: process.env.ELECTRON === 'true' ? './' : '/',
  define: {
    'process.env': '{}', // Polyfill/placeholder, safe by default, does not expose actual env
  },
  optimizeDeps: {
    include: ['@lanscape/chat', 'y-indexeddb']
  },
  build: {
    rollupOptions: {
      // Externalize y-indexeddb - it's dynamically imported in the chat package
      // and should be resolved at runtime from node_modules
      external: ['y-indexeddb']
    }
  },
  server: {
    proxy: {
      '/v1/': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
    },
  },
}))
