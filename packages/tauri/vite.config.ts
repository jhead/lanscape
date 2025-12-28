import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@lanscape/webui': path.resolve(__dirname, '../webui/src'),
    },
  },

  // Prevent Vite from obscuring rust errors
  clearScreen: false,

  // Provide process.env as an empty object in the browser.
  // This does NOT expose your local env: it only prevents client-side errors from code or deps that reference process.env.
  define: {
    'process.env': '{}', // Polyfill/placeholder, safe by default, does not expose actual env
  },

  // Env variables starting with the item of `envPrefix` will be exposed in tauri's source code through `import.meta.env`.
  envPrefix: ['VITE_', 'TAURI_ENV_*'],

  // Base path - use relative path for Tauri
  base: './',

  optimizeDeps: {
    include: ['@lanscape/chat', '@lanscape/webui', 'y-indexeddb'],
  },

  server: {
    // Tauri expects a fixed port, fail if that port is not available
    port: 1420,
    strictPort: true,
    // If the host Tauri is expecting is set, use it
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // Tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
    proxy: {
      '/v1/': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
    },
  },

  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS and Linux
    target:
      process.env.TAURI_ENV_PLATFORM == 'windows'
        ? 'chrome105'
        : 'safari13',
    // Don't minify for debug builds
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    // Produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    rollupOptions: {
      // Externalize y-indexeddb - it's dynamically imported in the chat package
      // and should be resolved at runtime from node_modules
      external: ['y-indexeddb'],
    },
  },
});
