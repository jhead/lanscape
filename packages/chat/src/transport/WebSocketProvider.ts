/**
 * WebSocket-like interface that abstracts the WebSocket API.
 * This allows plugging in different implementations (browser WebSocket, Tauri plugin, etc.)
 */
export interface WebSocketLike {
  readonly readyState: number
  send(data: string | ArrayBuffer | Blob): void
  close(code?: number, reason?: string): void
  addEventListener(
    type: 'open' | 'message' | 'error' | 'close',
    listener: (event: any) => void
  ): void
  removeEventListener(
    type: 'open' | 'message' | 'error' | 'close',
    listener: (event: any) => void
  ): void
}

/**
 * WebSocket ready states (matching standard WebSocket API)
 */
export const WebSocketReadyState = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const

/**
 * Provider interface for creating WebSocket instances.
 * This allows the SDK to work with different WebSocket implementations.
 */
export interface WebSocketProvider {
  /**
   * Create a new WebSocket connection
   * @param url The WebSocket URL to connect to
   * @returns A promise that resolves to a WebSocket-like instance
   */
  create(url: string): Promise<WebSocketLike>
}

