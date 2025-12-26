import * as Y from 'yjs'
import { PeerTransport, PeerTransportEvent, PeerTransportListener } from '../transport/PeerTransport'

// Message types for Y.js sync protocol
const MSG_SYNC_REQUEST = 0
const MSG_SYNC_RESPONSE = 1
const MSG_UPDATE = 2
const MSG_AWARENESS = 3

// Awareness state for a user
export interface AwarenessState {
  peerId: string
  user: {
    name: string
    id: string
  }
  lastUpdated: number
}

export type AwarenessChangeHandler = (states: Map<string, AwarenessState>) => void

/**
 * YjsSync synchronizes a Y.Doc across peers using a PeerTransport.
 * Also handles awareness (presence) for showing online users.
 * 
 * Protocol:
 * - When a new peer connects, send a sync request and awareness
 * - Respond to sync requests with full document state
 * - Broadcast updates to all connected peers
 * - Broadcast awareness periodically and on change
 * 
 * This is transport-agnostic - works with any PeerTransport implementation.
 */
export class YjsSync {
  private doc: Y.Doc
  private transport: PeerTransport
  private transportListener: PeerTransportListener | null = null
  private updateHandler: ((update: Uint8Array, origin: any) => void) | null = null
  private destroyed = false

  // Awareness state
  private localAwareness: { name: string; id: string } | null = null
  private awarenessStates = new Map<string, AwarenessState>()
  private awarenessHandlers = new Set<AwarenessChangeHandler>()
  private awarenessInterval: ReturnType<typeof setInterval> | null = null
  private readonly AWARENESS_INTERVAL = 15000 // 15 seconds

  constructor(doc: Y.Doc, transport: PeerTransport) {
    this.doc = doc
    this.transport = transport
    this.setupListeners()
    console.log('[YjsSync] Initialized')
  }

  /**
   * Set local user awareness state
   */
  setAwareness(user: { name: string; id: string }): void {
    this.localAwareness = user
    console.log('[YjsSync] Set local awareness:', user.name)
    
    // Broadcast awareness to all peers
    this.broadcastAwareness()

    // Start periodic awareness broadcasts
    if (!this.awarenessInterval) {
      this.awarenessInterval = setInterval(() => {
        if (!this.destroyed && this.localAwareness) {
          this.broadcastAwareness()
        }
      }, this.AWARENESS_INTERVAL)
    }
  }

  /**
   * Subscribe to awareness changes
   */
  onAwarenessChange(handler: AwarenessChangeHandler): () => void {
    this.awarenessHandlers.add(handler)
    // Immediately call with current state
    handler(new Map(this.awarenessStates))
    return () => {
      this.awarenessHandlers.delete(handler)
    }
  }

  /**
   * Get current awareness states
   */
  getAwarenessStates(): Map<string, AwarenessState> {
    return new Map(this.awarenessStates)
  }

  private emitAwarenessChange(): void {
    const states = new Map(this.awarenessStates)
    this.awarenessHandlers.forEach((handler) => {
      try {
        handler(states)
      } catch (error) {
        console.error('[YjsSync] Awareness handler error:', error)
      }
    })
  }

  private broadcastAwareness(): void {
    if (!this.localAwareness) return

    const selfId = this.transport.getSelfId()
    if (!selfId) return

    const state: AwarenessState = {
      peerId: selfId,
      user: this.localAwareness,
      lastUpdated: Date.now(),
    }

    const stateJson = JSON.stringify(state)
    const stateBytes = new TextEncoder().encode(stateJson)
    
    const message = new Uint8Array(1 + stateBytes.length)
    message[0] = MSG_AWARENESS
    message.set(stateBytes, 1)

    console.log('[YjsSync] Broadcasting awareness:', this.localAwareness.name)
    this.transport.broadcast(message.buffer)
  }

  private sendAwarenessToPeer(peerId: string): void {
    if (!this.localAwareness) return

    const selfId = this.transport.getSelfId()
    if (!selfId) return

    const state: AwarenessState = {
      peerId: selfId,
      user: this.localAwareness,
      lastUpdated: Date.now(),
    }

    const stateJson = JSON.stringify(state)
    const stateBytes = new TextEncoder().encode(stateJson)
    
    const message = new Uint8Array(1 + stateBytes.length)
    message[0] = MSG_AWARENESS
    message.set(stateBytes, 1)

    console.log('[YjsSync] Sending awareness to peer:', peerId)
    this.transport.sendToPeer(peerId, message.buffer)
  }

  private setupListeners(): void {
    // Listen for transport events
    this.transportListener = (event: PeerTransportEvent) => {
      if (this.destroyed) return

      switch (event.type) {
        case 'peer-connected':
          if (event.peerId) {
            console.log('[YjsSync] Peer connected:', event.peerId)
            // Request sync from the new peer
            this.sendSyncRequest(event.peerId)
            // Send our awareness to the new peer
            this.sendAwarenessToPeer(event.peerId)
          }
          break

        case 'message':
          if (event.peerId && event.data) {
            this.handleMessage(event.peerId, event.data)
          }
          break

        case 'peer-disconnected':
          if (event.peerId) {
            console.log('[YjsSync] Peer disconnected:', event.peerId)
            // Remove peer's awareness
            if (this.awarenessStates.has(event.peerId)) {
              this.awarenessStates.delete(event.peerId)
              this.emitAwarenessChange()
            }
          }
          break
      }
    }
    this.transport.addEventListener(this.transportListener)

    // Listen for local Y.js updates and broadcast to peers
    this.updateHandler = (update: Uint8Array, origin: any) => {
      if (this.destroyed) return
      // Don't re-broadcast updates that came from remote peers
      if (origin === 'remote') return

      console.log('[YjsSync] Broadcasting local update:', update.length, 'bytes')
      this.broadcastUpdate(update)
    }
    this.doc.on('update', this.updateHandler)

    // Sync with any already-connected peers
    this.syncWithExistingPeers()
  }

  private syncWithExistingPeers(): void {
    const connectedPeers = this.transport.getConnectedPeers()
    console.log('[YjsSync] Syncing with existing peers:', connectedPeers.length)
    for (const peer of connectedPeers) {
      this.sendSyncRequest(peer.id)
      this.sendAwarenessToPeer(peer.id)
    }
  }

  private sendSyncRequest(peerId: string): void {
    console.log('[YjsSync] Sending sync request to:', peerId)
    const message = new Uint8Array([MSG_SYNC_REQUEST])
    this.transport.sendToPeer(peerId, message.buffer)
  }

  private sendSyncResponse(peerId: string): void {
    // Get the full document state
    const state = Y.encodeStateAsUpdate(this.doc)
    console.log('[YjsSync] Sending sync response to:', peerId, state.length, 'bytes')

    const message = new Uint8Array(1 + state.length)
    message[0] = MSG_SYNC_RESPONSE
    message.set(state, 1)

    this.transport.sendToPeer(peerId, message.buffer)
  }

  private broadcastUpdate(update: Uint8Array): void {
    const message = new Uint8Array(1 + update.length)
    message[0] = MSG_UPDATE
    message.set(update, 1)

    this.transport.broadcast(message.buffer)
  }

  private handleMessage(peerId: string, data: ArrayBuffer): void {
    const message = new Uint8Array(data)
    if (message.length === 0) return

    const messageType = message[0]
    const payload = message.slice(1)

    switch (messageType) {
      case MSG_SYNC_REQUEST:
        console.log('[YjsSync] Received sync request from:', peerId)
        this.sendSyncResponse(peerId)
        // Also send our awareness when responding to sync
        this.sendAwarenessToPeer(peerId)
        break

      case MSG_SYNC_RESPONSE:
        console.log('[YjsSync] Received sync response from:', peerId, payload.length, 'bytes')
        Y.applyUpdate(this.doc, payload, 'remote')
        break

      case MSG_UPDATE:
        console.log('[YjsSync] Received update from:', peerId, payload.length, 'bytes')
        Y.applyUpdate(this.doc, payload, 'remote')
        break

      case MSG_AWARENESS:
        this.handleAwareness(peerId, payload)
        break

      default:
        console.warn('[YjsSync] Unknown message type:', messageType)
    }
  }

  private handleAwareness(peerId: string, payload: Uint8Array): void {
    try {
      const stateJson = new TextDecoder().decode(payload)
      const state: AwarenessState = JSON.parse(stateJson)
      
      console.log('[YjsSync] Received awareness from:', peerId, state.user.name)
      
      // Update awareness state
      this.awarenessStates.set(state.peerId, state)
      this.emitAwarenessChange()
    } catch (error) {
      console.error('[YjsSync] Error parsing awareness:', error)
    }
  }

  /**
   * Get the Y.Doc being synced
   */
  getDoc(): Y.Doc {
    return this.doc
  }

  /**
   * Get the transport being used
   */
  getTransport(): PeerTransport {
    return this.transport
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    console.log('[YjsSync] Destroying')
    this.destroyed = true

    if (this.awarenessInterval) {
      clearInterval(this.awarenessInterval)
      this.awarenessInterval = null
    }

    if (this.transportListener) {
      this.transport.removeEventListener(this.transportListener)
      this.transportListener = null
    }

    if (this.updateHandler) {
      this.doc.off('update', this.updateHandler)
      this.updateHandler = null
    }

    this.awarenessStates.clear()
    this.awarenessHandlers.clear()
  }
}
