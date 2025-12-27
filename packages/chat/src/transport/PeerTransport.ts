/**
 * Abstract transport layer for peer-to-peer communication.
 * Implementations can use WebRTC data channels, WebSockets, or other transports.
 */

export type PeerTransportEventType =
  | 'peer-connected'
  | 'peer-disconnected'
  | 'message'
  | 'error'

export interface PeerTransportEvent {
  type: PeerTransportEventType
  peerId?: string
  data?: ArrayBuffer
  error?: Error
}

export type PeerTransportListener = (event: PeerTransportEvent) => void

/**
 * Interface for a peer in the transport layer
 */
export interface Peer {
  id: string
  connected: boolean
}

/**
 * Abstract interface for peer-to-peer transport.
 * Y.js sync layer uses this to communicate with peers.
 */
export interface PeerTransport {
  /**
   * Get the local peer ID
   */
  getSelfId(): string | null

  /**
   * Get all connected peers
   */
  getConnectedPeers(): Peer[]

  /**
   * Send data to a specific peer
   * @returns true if sent successfully
   */
  sendToPeer(peerId: string, data: ArrayBuffer): boolean

  /**
   * Broadcast data to all connected peers
   */
  broadcast(data: ArrayBuffer): void

  /**
   * Add an event listener
   */
  addEventListener(listener: PeerTransportListener): void

  /**
   * Remove an event listener
   */
  removeEventListener(listener: PeerTransportListener): void

  /**
   * Clean up resources
   */
  destroy(): void
}

