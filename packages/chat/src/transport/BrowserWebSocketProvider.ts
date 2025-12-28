import { WebSocketProvider, WebSocketLike } from './WebSocketProvider'

/**
 * Default browser WebSocket provider.
 * Uses the standard browser WebSocket API.
 */
export class BrowserWebSocketProvider implements WebSocketProvider {
  async create(url: string): Promise<WebSocketLike> {
    return new WebSocket(url) as WebSocketLike
  }
}

