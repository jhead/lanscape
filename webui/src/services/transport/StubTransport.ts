import { PeerTransport, PeerTransportListener, Peer } from './PeerTransport'

/**
 * Stub implementation of PeerTransport.
 * This is a placeholder that does nothing - actual transport will be implemented later.
 * Kept to maintain compatibility with the chat UI.
 */
export class StubTransport implements PeerTransport {
  private listeners = new Set<PeerTransportListener>()
  private destroyed = false

  constructor(_config: any) {
    console.log('[StubTransport] Stub transport initialized')
  }

  /**
   * Connect - stub implementation (no-op)
   */
  async connect(): Promise<void> {
    console.log('[StubTransport] Stub connect() called (no-op)')
  }

  /**
   * Disconnect - stub implementation (no-op)
   */
  disconnect(): void {
    console.log('[StubTransport] Stub disconnect() called (no-op)')
  }

  getSelfId(): string | null {
    return null
  }

  getConnectedPeers(): Peer[] {
    return []
  }

  sendToPeer(_peerId: string, _data: ArrayBuffer): boolean {
    return false
  }

  broadcast(_data: ArrayBuffer): void {
    // No-op
  }

  addEventListener(listener: PeerTransportListener): void {
    this.listeners.add(listener)
  }

  removeEventListener(listener: PeerTransportListener): void {
    this.listeners.delete(listener)
  }

  destroy(): void {
    console.log('[StubTransport] Stub destroy() called')
    this.destroyed = true
    this.listeners.clear()
  }
}

