import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  getAgentPort: (): Promise<number> => {
    return ipcRenderer.invoke('get-agent-port')
  },
})

// Type definitions for TypeScript
declare global {
  interface Window {
    electron: {
      getAgentPort: () => Promise<number>
    }
  }
}

