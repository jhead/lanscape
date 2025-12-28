import { WebSocketProvider, WebSocketLike, WebSocketReadyState } from '@lanscape/chat'

/**
 * Tauri WebSocket provider.
 * Uses the Tauri websocket plugin instead of the browser's WebSocket API.
 * 
 * The Tauri WebSocket plugin has a different API:
 * - connect() already establishes the connection (no separate 'open' event)
 * - addListener() is used for receiving messages
 * - send() accepts strings
 * - disconnect() closes the connection
 */
export class TauriWebSocketProvider implements WebSocketProvider {
  async create(url: string): Promise<WebSocketLike> {
    const WebSocket = (await import('@tauri-apps/plugin-websocket')).default
    
    // Connect to the WebSocket (this already establishes the connection)
    const ws = await WebSocket.connect(url)
    
    // Track internal state
    let readyState: number = WebSocketReadyState.OPEN // Already connected when connect() resolves
    const openListeners: Array<(event: any) => void> = []
    const messageListeners: Array<{ listener: (event: any) => void; remove: () => void }> = []
    const errorListeners: Array<(event: any) => void> = []
    const closeListeners: Array<(event: any) => void> = []
    
    // Call open listeners immediately since connection is already established
    setTimeout(() => {
      openListeners.forEach(listener => {
        try {
          listener({ type: 'open' })
        } catch (error) {
          console.error('[TauriWebSocketProvider] Error in open listener:', error)
        }
      })
    }, 0)
    
    // Create a WebSocket-like wrapper around the Tauri WebSocket
    const wrapper: WebSocketLike = {
      get readyState(): number {
        return readyState
      },
      
      send(data: string | ArrayBuffer | Blob): void {
        if (readyState !== WebSocketReadyState.OPEN) {
          console.warn('[TauriWebSocketProvider] Cannot send, not connected')
          return
        }
        
        try {
          if (typeof data === 'string') {
            ws.send(data)
          } else if (data instanceof ArrayBuffer) {
            // Convert ArrayBuffer to base64 string
            // The Tauri plugin expects strings, and base64 is more reliable for binary data
            const uint8Array = new Uint8Array(data)
            // Convert to base64
            let binaryString = ''
            const chunkSize = 8192
            for (let i = 0; i < uint8Array.length; i += chunkSize) {
              const chunk = uint8Array.slice(i, i + chunkSize)
              binaryString += String.fromCharCode.apply(null, Array.from(chunk) as any)
            }
            // Send as base64
            const base64 = btoa(binaryString)
            ws.send(base64)
          } else if (data instanceof Blob) {
            // Convert Blob to ArrayBuffer then to string
            data.arrayBuffer().then((buffer) => {
              const uint8Array = new Uint8Array(buffer)
              let binaryString = ''
              const chunkSize = 8192
              for (let i = 0; i < uint8Array.length; i += chunkSize) {
                const chunk = uint8Array.slice(i, i + chunkSize)
                binaryString += String.fromCharCode.apply(null, Array.from(chunk))
              }
              ws.send(binaryString)
            }).catch((error) => {
              console.error('[TauriWebSocketProvider] Error converting Blob:', error)
              errorListeners.forEach(listener => {
                try {
                  listener({ type: 'error', error })
                } catch (err) {
                  console.error('[TauriWebSocketProvider] Error in error listener:', err)
                }
              })
            })
          }
        } catch (error) {
          console.error('[TauriWebSocketProvider] Error sending message:', error)
          errorListeners.forEach(listener => {
            try {
              listener({ type: 'error', error })
            } catch (err) {
              console.error('[TauriWebSocketProvider] Error in error listener:', err)
            }
          })
        }
      },
      
      close(code?: number, reason?: string): void {
        if (readyState === WebSocketReadyState.CLOSED || readyState === WebSocketReadyState.CLOSING) {
          return
        }
        
        readyState = WebSocketReadyState.CLOSING
        
        try {
          ws.disconnect()
          readyState = WebSocketReadyState.CLOSED
          
          // Call close listeners
          closeListeners.forEach(listener => {
            try {
              listener({ type: 'close', code, reason })
            } catch (error) {
              console.error('[TauriWebSocketProvider] Error in close listener:', error)
            }
          })
        } catch (error) {
          console.error('[TauriWebSocketProvider] Error closing connection:', error)
          readyState = WebSocketReadyState.CLOSED
        }
      },
      
      addEventListener(
        type: 'open' | 'message' | 'error' | 'close',
        listener: (event: any) => void
      ): void {
        if (type === 'open') {
          openListeners.push(listener)
          // If already connected, call immediately
          if (readyState === WebSocketReadyState.OPEN) {
            setTimeout(() => {
              try {
                listener({ type: 'open' })
              } catch (error) {
                console.error('[TauriWebSocketProvider] Error in open listener:', error)
              }
            }, 0)
          }
        } else if (type === 'message') {
          // Tauri WebSocket uses addListener for messages
          const removeListener = ws.addListener((msg: any) => {
            // Tauri sends messages as strings
            const event = {
              type: 'message',
              data: typeof msg === 'string' ? msg : JSON.stringify(msg),
            }
            try {
              listener(event)
            } catch (error) {
              console.error('[TauriWebSocketProvider] Error in message listener:', error)
            }
          })
          messageListeners.push({ listener, remove: removeListener })
        } else if (type === 'error') {
          errorListeners.push(listener)
        } else if (type === 'close') {
          closeListeners.push(listener)
        }
      },
      
      removeEventListener(
        type: 'open' | 'message' | 'error' | 'close',
        listener: (event: any) => void
      ): void {
        if (type === 'message') {
          const index = messageListeners.findIndex(l => l.listener === listener)
          if (index >= 0) {
            messageListeners[index].remove()
            messageListeners.splice(index, 1)
          }
        } else if (type === 'open') {
          const index = openListeners.indexOf(listener)
          if (index >= 0) {
            openListeners.splice(index, 1)
          }
        } else if (type === 'error') {
          const index = errorListeners.indexOf(listener)
          if (index >= 0) {
            errorListeners.splice(index, 1)
          }
        } else if (type === 'close') {
          const index = closeListeners.indexOf(listener)
          if (index >= 0) {
            closeListeners.splice(index, 1)
          }
        }
      },
    }
    
    return wrapper
  }
}

