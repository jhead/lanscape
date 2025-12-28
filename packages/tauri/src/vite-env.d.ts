/// <reference types="vite/client" />

interface Window {
  __TAURI__?: {
    tauri: unknown
    event: unknown
    invoke: unknown
    window: unknown
    app: unknown
    core: unknown
  }
}
