import { WebRTCSignalingClient, SignalingEvent, SignalingConfig } from '../webrtc/Signaling'
import { PeerTransport, PeerTransportEvent, PeerTransportListener, Peer } from './PeerTransport'

/**
 * WebRTC implementation of PeerTransport.
 * Uses WebRTCSignalingClient to establish peer connections and data channels.
 */
export class WebRTCTransport implements PeerTransport {
  private client: WebRTCSignalingClient
  private listeners = new Set<PeerTransportListener>()
  private signalingListener: ((event: SignalingEvent) => void) | null = null
  private destroyed = false

  constructor(config: SignalingConfig) {
    this.client = new WebRTCSignalingClient(config)
    this.setupSignalingListener()
  }

  /**
   * Connect to the signaling server and start peer discovery
   */
  async connect(): Promise<void> {
    await this.client.connect()
  }

  /**
   * Disconnect from signaling and close all peer connections
   */
  disconnect(): void {
    this.client.disconnect()
  }

  private setupSignalingListener(): void {
    this.signalingListener = (event: SignalingEvent) => {
      if (this.destroyed) return

      switch (event.type) {
        case 'data-channel-open':
          if (event.peerId) {
            console.log('[WebRTCTransport] Peer connected:', event.peerId)
            this.emit({
              type: 'peer-connected',
              peerId: event.peerId,
            })
          }
          break

        case 'data-channel-close':
        case 'peer-left':
          if (event.peerId) {
            console.log('[WebRTCTransport] Peer disconnected:', event.peerId)
            this.emit({
              type: 'peer-disconnected',
              peerId: event.peerId,
            })
          }
          break

        case 'data-channel-message':
          if (event.peerId && event.data) {
            this.emit({
              type: 'message',
              peerId: event.peerId,
              data: event.data as ArrayBuffer,
            })
          }
          break

        case 'error':
          this.emit({
            type: 'error',
            error: event.error,
          })
          break
      }
    }

    this.client.addEventListener(this.signalingListener)
  }

  private emit(event: PeerTransportEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event)
      } catch (error) {
        console.error('[WebRTCTransport] Listener error:', error)
      }
    })
  }

  getSelfId(): string | null {
    return this.client.getSelfId()
  }

  getConnectedPeers(): Peer[] {
    const peers: Peer[] = []
    const connectedPeers = this.client.getConnectedPeers()
    for (const [peerId] of connectedPeers) {
      peers.push({ id: peerId, connected: true })
    }
    return peers
  }

  sendToPeer(peerId: string, data: ArrayBuffer): boolean {
    return this.client.sendToPeer(peerId, data)
  }

  broadcast(data: ArrayBuffer): void {
    this.client.broadcast(data)
  }

  addEventListener(listener: PeerTransportListener): void {
    this.listeners.add(listener)
  }

  removeEventListener(listener: PeerTransportListener): void {
    this.listeners.delete(listener)
  }

  destroy(): void {
    console.log('[WebRTCTransport] Destroying')
    this.destroyed = true

    if (this.signalingListener) {
      this.client.removeEventListener(this.signalingListener)
      this.signalingListener = null
    }

    this.client.disconnect()
    this.listeners.clear()
  }
}

