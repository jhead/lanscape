/// <reference types="vite/client" />

interface Window {
  electron?: {
    getAgentPort: () => Promise<number>
  }
}
