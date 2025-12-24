import type {
  SignalingMessage,
  WelcomeMessage,
  PeerListMessage,
  PeerJoinedMessage,
  PeerLeftMessage,
  OfferMessage,
  AnswerMessage,
  IceCandidateMessage,
  ErrorMessage,
  PeerConnectionInfo,
} from './types'

export interface SignalingConfig {
  signalingUrl: string
  topic: string
}

export interface PeerConnection extends PeerConnectionInfo {
  pc: RTCPeerConnection
  dataChannel: RTCDataChannel | null
  pendingCandidates: RTCIceCandidateInit[]  // Queue for candidates that arrive before remote description
}

export type SignalingEventType =
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'peer-joined'
  | 'peer-left'
  | 'peer-updated'
  | 'data-channel-open'
  | 'data-channel-close'
  | 'data-channel-message'

export interface SignalingEvent {
  type: SignalingEventType
  peerId?: string
  error?: Error
  connection?: PeerConnection
  data?: ArrayBuffer | string
}

export type SignalingEventListener = (event: SignalingEvent) => void

/**
 * WebRTCSignalingClient manages WebRTC peer connections via a signaling server.
 * Handles WebSocket connection, peer discovery, SDP/ICE exchange, and data channels.
 */
export class WebRTCSignalingClient {
  private ws: WebSocket | null = null
  private selfId: string | null = null
  private peers = new Map<string, PeerConnection>()
  private listeners = new Set<SignalingEventListener>()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private config: SignalingConfig
  private msgIdCounter = 0
  private peerHealthCheckInterval: ReturnType<typeof setInterval> | null = null
  private static readonly PEER_HEALTH_CHECK_INTERVAL = 5000 // Check every 5 seconds
  private static readonly PEER_CONNECTION_TIMEOUT = 15000 // Force retry after 15 seconds
  private static readonly RETRY_COOLDOWN = 10000 // Don't retry same peer more than once per 10s

  // Persistent queue for ICE candidates that survives connection recreation
  private globalPendingCandidates = new Map<string, RTCIceCandidateInit[]>()
  // Track when each connection started for timeout detection
  private connectionStartTimes = new Map<string, number>()
  // Track last retry time to prevent retry storms
  private lastRetryTimes = new Map<string, number>()

  constructor(config: SignalingConfig) {
    this.config = config
  }

  /**
   * Connect to the signaling server and start peer discovery
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[WebRTC] Already connected')
      return
    }

    const wsUrl = `${this.config.signalingUrl}/ws/${encodeURIComponent(this.config.topic)}`
    console.log('[WebRTC] Connecting to signaling server:', wsUrl)

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl)

        this.ws.onopen = () => {
          console.log('[WebRTC] WebSocket connected')
          this.reconnectAttempts = 0
          this.startPeerHealthCheck()
          this.emit({ type: 'connected' })
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const msg: SignalingMessage = JSON.parse(event.data)
            this.handleMessage(msg)
          } catch (error) {
            console.error('[WebRTC] Failed to parse message:', error)
          }
        }

        this.ws.onerror = (error) => {
          console.error('[WebRTC] WebSocket error:', error)
          this.emit({ type: 'error', error: new Error('WebSocket error') })
        }

        this.ws.onclose = () => {
          console.log('[WebRTC] WebSocket disconnected')
          this.emit({ type: 'disconnected' })
          this.ws = null
          this.attemptReconnect()
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Disconnect from the signaling server and close all peer connections
   */
  disconnect(): void {
    // Stop reconnection attempts
    this.reconnectAttempts = this.maxReconnectAttempts

    // Stop health check
    this.stopPeerHealthCheck()

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    // Close all peer connections
    for (const [peerId, peerConn] of this.peers) {
      console.log('[WebRTC] Closing peer connection:', peerId)
      if (peerConn.dataChannel) {
        peerConn.dataChannel.close()
      }
      peerConn.pc.close()
      this.emit({
        type: 'peer-left',
        peerId,
      })
    }
    this.peers.clear()
    this.selfId = null
  }

  /**
   * Get the current self peer ID
   */
  getSelfId(): string | null {
    return this.selfId
  }

  /**
   * Get all connected peers
   */
  getPeers(): Map<string, PeerConnection> {
    return new Map(this.peers)
  }

  /**
   * Get peers with open data channels
   */
  getConnectedPeers(): Map<string, PeerConnection> {
    const connected = new Map<string, PeerConnection>()
    for (const [peerId, peerConn] of this.peers) {
      if (peerConn.dataChannel?.readyState === 'open') {
        connected.set(peerId, peerConn)
      }
    }
    return connected
  }

  /**
   * Send data to a specific peer via data channel
   */
  sendToPeer(peerId: string, data: ArrayBuffer): boolean {
    const peerConn = this.peers.get(peerId)
    if (!peerConn?.dataChannel || peerConn.dataChannel.readyState !== 'open') {
      console.warn('[WebRTC] Cannot send to peer, data channel not open:', peerId)
      return false
    }

    try {
      peerConn.dataChannel.send(new Uint8Array(data))
      return true
    } catch (error) {
      console.error('[WebRTC] Error sending to peer:', peerId, error)
      return false
    }
  }

  /**
   * Broadcast data to all peers with open data channels
   */
  broadcast(data: ArrayBuffer): void {
    const uint8Data = new Uint8Array(data)
    for (const [peerId, peerConn] of this.peers) {
      if (peerConn.dataChannel?.readyState === 'open') {
        try {
          peerConn.dataChannel.send(uint8Data)
        } catch (error) {
          console.error('[WebRTC] Error broadcasting to peer:', peerId, error)
        }
      }
    }
  }

  /**
   * Add an event listener
   */
  addEventListener(listener: SignalingEventListener): void {
    this.listeners.add(listener)
  }

  /**
   * Remove an event listener
   */
  removeEventListener(listener: SignalingEventListener): void {
    this.listeners.delete(listener)
  }

  private emit(event: SignalingEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event)
      } catch (error) {
        console.error('[WebRTC] Event listener error:', error)
      }
    })
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[WebRTC] Max reconnect attempts reached')
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
    console.log(`[WebRTC] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)

    setTimeout(() => {
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        this.connect().catch((error) => {
          console.error('[WebRTC] Reconnect failed:', error)
        })
      }
    }, delay)
  }

  private handleMessage(msg: SignalingMessage): void {
    console.log('[WebRTC] Received message:', msg.type, msg)

    switch (msg.type) {
      case 'welcome':
        this.handleWelcome(msg as WelcomeMessage)
        break
      case 'peer-list':
        this.handlePeerList(msg as PeerListMessage)
        break
      case 'peer-joined':
        this.handlePeerJoined(msg as PeerJoinedMessage)
        break
      case 'peer-left':
        this.handlePeerLeft(msg as PeerLeftMessage)
        break
      case 'offer':
        this.handleOffer(msg as OfferMessage)
        break
      case 'answer':
        this.handleAnswer(msg as AnswerMessage)
        break
      case 'ice-candidate':
        this.handleIceCandidate(msg as IceCandidateMessage)
        break
      case 'error':
        this.handleError(msg as ErrorMessage)
        break
      default:
        console.warn('[WebRTC] Unknown message type:', msg.type)
    }
  }

  private handleWelcome(msg: WelcomeMessage): void {
    this.selfId = msg.selfId
    console.log('[WebRTC] Welcome, self ID:', this.selfId)
  }

  private handlePeerList(msg: PeerListMessage): void {
    console.log('[WebRTC] Peer list received:', msg.peers.length, 'peers')
    for (const peer of msg.peers) {
      if (peer.id !== this.selfId && !this.peers.has(peer.id)) {
        this.createPeerConnection(peer.id, true)
      }
    }
  }

  private handlePeerJoined(msg: PeerJoinedMessage): void {
    console.log('[WebRTC] Peer joined:', msg.peerId)
    if (msg.peerId === this.selfId) return
    
    // If we already have a connection to this peer, clean it up first
    // This handles the case where a peer refreshes their browser
    const existingConn = this.peers.get(msg.peerId)
    if (existingConn) {
      console.log('[WebRTC] Cleaning up stale connection for rejoined peer:', msg.peerId)
      if (existingConn.dataChannel) {
        existingConn.dataChannel.close()
      }
      existingConn.pc.close()
      this.peers.delete(msg.peerId)
    }
    
    this.createPeerConnection(msg.peerId, true)
  }

  private handlePeerLeft(msg: PeerLeftMessage): void {
    console.log('[WebRTC] Peer left:', msg.peerId)
    const peerConn = this.peers.get(msg.peerId)
    
    // Clean up all resources for this peer
    this.globalPendingCandidates.delete(msg.peerId)
    this.connectionStartTimes.delete(msg.peerId)
    this.lastRetryTimes.delete(msg.peerId)

    if (peerConn) {
      if (peerConn.dataChannel) {
        peerConn.dataChannel.close()
      }
      peerConn.pc.close()
      this.peers.delete(msg.peerId)
      this.emit({
        type: 'peer-left',
        peerId: msg.peerId,
      })
    }
  }

  private async handleOffer(msg: OfferMessage): Promise<void> {
    console.log('[WebRTC] Received offer from:', msg.from)
    let peerConn = this.peers.get(msg.from)
    
    // Perfect negotiation: determine politeness based on peer ID comparison
    const isPolite = this.selfId! < msg.from
    
    // Check for collision: we have a local offer pending
    const isCollision = peerConn?.pc.signalingState === 'have-local-offer'
    
    // Also check if our existing connection is in a bad state (failed or stuck)
    const isExistingUnhealthy = peerConn && (
      peerConn.pc.connectionState === 'failed' || 
      peerConn.pc.connectionState === 'disconnected' ||
      peerConn.pc.connectionState === 'closed'
    )

    if (isCollision || isExistingUnhealthy) {
      if (isCollision && !isPolite) {
        console.log('[WebRTC] Ignoring offer collision (impolite peer):', msg.from)
        return
      }
      
      console.log(`[WebRTC] Cleaning up existing connection (${isCollision ? 'collision' : 'unhealthy'}) for new offer from:`, msg.from)
      
      if (peerConn) {
        if (peerConn.dataChannel) {
          try { peerConn.dataChannel.close() } catch (e) {}
        }
        try { peerConn.pc.close() } catch (e) {}
        this.peers.delete(msg.from)
      }
      
      // Fresh start as responder
      peerConn = this.createPeerConnection(msg.from, false)
    }
    
    if (!peerConn) {
      peerConn = this.createPeerConnection(msg.from, false)
    }

    try {
      const offer = new RTCSessionDescription({
        type: 'offer',
        sdp: msg.payload.sdp,
      })
      await peerConn.pc.setRemoteDescription(offer)
      
      // Apply any ICE candidates that arrived before the remote description
      await this.applyPendingCandidates(peerConn)

      const answer = await peerConn.pc.createAnswer()
      await peerConn.pc.setLocalDescription(answer)

      // Wait a tiny bit for at least one candidate to be gathered so the answer
      // is more likely to contain a valid host path immediately.
      await this.waitForFirstCandidate(peerConn.pc)

      this.sendSignalingMessage({
        type: 'answer',
        to: msg.from,
        payload: {
          sdp: peerConn.pc.localDescription!.sdp,
          type: peerConn.pc.localDescription!.type,
        },
        msgId: this.generateMsgId(),
      })

      this.updatePeerInfo(peerConn)
    } catch (error) {
      console.error('[WebRTC] Error handling offer:', error)
    }
  }

  private async handleAnswer(msg: AnswerMessage): Promise<void> {
    console.log('[WebRTC] Received answer from:', msg.from)
    const peerConn = this.peers.get(msg.from)
    if (!peerConn) {
      console.warn('[WebRTC] Received answer from unknown peer:', msg.from)
      return
    }

    // Check if we can apply the answer - must be in have-local-offer state
    if (peerConn.pc.signalingState !== 'have-local-offer') {
      console.log('[WebRTC] Ignoring answer, not in have-local-offer state:', 
        peerConn.pc.signalingState, 'from:', msg.from)
      return
    }

    try {
      const answer = new RTCSessionDescription({
        type: 'answer',
        sdp: msg.payload.sdp,
      })
      await peerConn.pc.setRemoteDescription(answer)
      
      // Apply any ICE candidates that arrived before the remote description
      await this.applyPendingCandidates(peerConn)
      
      this.updatePeerInfo(peerConn)
    } catch (error) {
      console.error('[WebRTC] Error handling answer:', error)
    }
  }

  private handleIceCandidate(msg: IceCandidateMessage): void {
    console.log('[WebRTC] Received ICE candidate from:', msg.from)
    
    const candidateInit: RTCIceCandidateInit = {
      candidate: msg.payload.candidate,
      sdpMLineIndex: msg.payload.sdpMLineIndex,
      sdpMid: msg.payload.sdpMid,
    }

    // Add to global queue so it survives connection recreation
    if (!this.globalPendingCandidates.has(msg.from)) {
      this.globalPendingCandidates.set(msg.from, [])
    }
    this.globalPendingCandidates.get(msg.from)!.push(candidateInit)

    const peerConn = this.peers.get(msg.from)
    if (!peerConn) {
      console.log('[WebRTC] Buffering ICE candidate for unknown/future peer:', msg.from)
      return
    }

    // Apply immediately if remote description is already set
    if (peerConn.pc.remoteDescription) {
      try {
        const candidate = new RTCIceCandidate(candidateInit)
        peerConn.pc.addIceCandidate(candidate).catch((error) => {
          console.error('[WebRTC] Error adding ICE candidate:', error)
        })
        this.updatePeerInfo(peerConn)
      } catch (error) {
        console.error('[WebRTC] Error handling ICE candidate:', error)
      }
    } else {
      console.log('[WebRTC] Queueing ICE candidate (no remote description yet):', msg.from)
      peerConn.pendingCandidates.push(candidateInit)
    }
  }

  /**
   * Apply any queued ICE candidates after remote description is set.
   * Now pulls from both local and global candidate queues.
   */
  private async applyPendingCandidates(peerConn: PeerConnection): Promise<void> {
    const localCandidates = peerConn.pendingCandidates
    const globalCandidates = this.globalPendingCandidates.get(peerConn.peerId) || []
    
    // Combine and deduplicate candidates (by their string representation)
    const allCandidates = [...localCandidates, ...globalCandidates]
    const uniqueCandidates = Array.from(new Set(allCandidates.map(c => JSON.stringify(c))))
      .map(s => JSON.parse(s) as RTCIceCandidateInit)

    if (uniqueCandidates.length === 0) return
    
    console.log('[WebRTC] Applying', uniqueCandidates.length, 'unique ICE candidates for:', peerConn.peerId)
    
    for (const candidateInit of uniqueCandidates) {
      try {
        const candidate = new RTCIceCandidate(candidateInit)
        await peerConn.pc.addIceCandidate(candidate)
      } catch (error) {
        // Some candidates might fail to apply if they are for a different m-line, that's okay
        console.warn('[WebRTC] Note: ICE candidate not applied:', error.message)
      }
    }
    
    peerConn.pendingCandidates = []
    this.updatePeerInfo(peerConn)
  }

  private handleError(msg: ErrorMessage): void {
    console.error('[WebRTC] Signaling error:', msg.code, msg.message)
    this.emit({
      type: 'error',
      error: new Error(`Signaling error: ${msg.code} - ${msg.message}`),
    })
  }

  private createPeerConnection(peerId: string, shouldCreateOffer: boolean): PeerConnection {
    console.log('[WebRTC] Creating peer connection for:', peerId, 'shouldCreateOffer:', shouldCreateOffer)

    // Don't create duplicate connections
    if (this.peers.has(peerId)) {
      console.warn('[WebRTC] Peer connection already exists:', peerId)
      return this.peers.get(peerId)!
    }

    // Create RTCPeerConnection
    const pc = new RTCPeerConnection({
      iceServers: [
        // No servers, forcing peer-to-peer connection over Tailscale network
      ],
    })

    const peerConn: PeerConnection = {
      peerId,
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
      iceGatheringState: pc.iceGatheringState,
      signalingState: pc.signalingState,
      remoteCandidates: 0,
      localCandidates: 0,
      pc,
      dataChannel: null,
      pendingCandidates: [],
    }

    // Create data channel if we're the initiator
    if (shouldCreateOffer) {
      const dataChannel = pc.createDataChannel('yjs-sync', {
        ordered: true,
      })
      this.setupDataChannel(dataChannel, peerConn)
      peerConn.dataChannel = dataChannel
    }

    // Handle incoming data channels
    pc.ondatachannel = (event) => {
      console.log('[WebRTC] Received data channel from:', peerId)
      this.setupDataChannel(event.channel, peerConn)
      peerConn.dataChannel = event.channel
    }

    // Track ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignalingMessage({
          type: 'ice-candidate',
          to: peerId,
          payload: {
            candidate: event.candidate.candidate,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            sdpMid: event.candidate.sdpMid,
          },
          msgId: this.generateMsgId(),
        })
      }
      this.updatePeerInfo(this.peers.get(peerId)!)
    }

    // Track connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state changed for ${peerId}:`, pc.connectionState)
      this.updatePeerInfo(this.peers.get(peerId)!)
    }

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE connection state changed for ${peerId}:`, pc.iceConnectionState)
      this.updatePeerInfo(this.peers.get(peerId)!)
    }

    pc.onicegatheringstatechange = () => {
      console.log(`[WebRTC] ICE gathering state changed for ${peerId}:`, pc.iceGatheringState)
      this.updatePeerInfo(this.peers.get(peerId)!)
    }

    pc.onsignalingstatechange = () => {
      console.log(`[WebRTC] Signaling state changed for ${peerId}:`, pc.signalingState)
      this.updatePeerInfo(this.peers.get(peerId)!)
    }

    // Monitor remote description set (to count candidates)
    const originalSetRemoteDescription = pc.setRemoteDescription.bind(pc)
    pc.setRemoteDescription = async (description) => {
      const result = await originalSetRemoteDescription(description)
      this.updatePeerInfo(this.peers.get(peerId)!)
      return result
    }

    this.peers.set(peerId, peerConn)
    this.connectionStartTimes.set(peerId, Date.now())

    // If we should create an offer (as initiator), do so now
    if (shouldCreateOffer) {
      this.createOffer(peerConn).catch((error) => {
        console.error('[WebRTC] Error creating offer:', error)
      })
    }

    this.emit({
      type: 'peer-joined',
      peerId,
      connection: peerConn,
    })

    return peerConn
  }

  private setupDataChannel(dataChannel: RTCDataChannel, peerConn: PeerConnection): void {
    dataChannel.binaryType = 'arraybuffer'

    dataChannel.onopen = () => {
      console.log('[WebRTC] Data channel opened with:', peerConn.peerId)
      this.emit({
        type: 'data-channel-open',
        peerId: peerConn.peerId,
        connection: peerConn,
      })
    }

    dataChannel.onclose = () => {
      console.log('[WebRTC] Data channel closed with:', peerConn.peerId)
      this.emit({
        type: 'data-channel-close',
        peerId: peerConn.peerId,
        connection: peerConn,
      })
    }

    dataChannel.onerror = (error) => {
      console.error('[WebRTC] Data channel error with:', peerConn.peerId, error)
    }

    dataChannel.onmessage = (event) => {
      this.emit({
        type: 'data-channel-message',
        peerId: peerConn.peerId,
        data: event.data,
        connection: peerConn,
      })
    }
  }

  private async createOffer(peerConn: PeerConnection): Promise<void> {
    console.log('[WebRTC] Creating offer for:', peerConn.peerId)
    try {
      const offer = await peerConn.pc.createOffer()
      await peerConn.pc.setLocalDescription(offer)

      // Wait a tiny bit for at least one candidate to be gathered so the offer
      // is more likely to contain a valid host path immediately.
      await this.waitForFirstCandidate(peerConn.pc)

      this.sendSignalingMessage({
        type: 'offer',
        to: peerConn.peerId,
        payload: {
          sdp: peerConn.pc.localDescription!.sdp,
          type: peerConn.pc.localDescription!.type,
        },
        msgId: this.generateMsgId(),
      })

      this.updatePeerInfo(peerConn)
    } catch (error) {
      console.error('[WebRTC] Error creating offer:', error)
    }
  }

  /**
   * Helper to wait for the first ICE candidate or a short timeout.
   * This "warms up" the SDP so it's not sent empty.
   */
  private async waitForFirstCandidate(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === 'complete') return
    if (pc.localDescription?.sdp?.includes('a=candidate:')) return

    await new Promise<void>(resolve => {
      const handler = () => {
        if (pc.iceGatheringState === 'complete' || pc.localDescription?.sdp?.includes('a=candidate:')) {
          pc.removeEventListener('icecandidate', handler)
          resolve()
        }
      }
      pc.addEventListener('icecandidate', handler)
      // Max 500ms wait to avoid delaying too long
      setTimeout(() => {
        pc.removeEventListener('icecandidate', handler)
        resolve()
      }, 500)
    })
  }

  private sendSignalingMessage(msg: {
    type: string
    to: string
    payload: any
    msgId?: string
  }): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[WebRTC] Cannot send message, WebSocket not connected')
      return
    }

    const message = JSON.stringify(msg)
    console.log('[WebRTC] Sending message:', msg.type, 'to', msg.to)
    this.ws.send(message)
  }

  private updatePeerInfo(peerConn: PeerConnection | undefined): void {
    if (!peerConn) return

    // Update connection info
    peerConn.connectionState = peerConn.pc.connectionState
    peerConn.iceConnectionState = peerConn.pc.iceConnectionState
    peerConn.iceGatheringState = peerConn.pc.iceGatheringState
    peerConn.signalingState = peerConn.pc.signalingState
    peerConn.localDescription = peerConn.pc.localDescription || undefined
    peerConn.remoteDescription = peerConn.pc.remoteDescription || undefined

    // Count candidates (rough estimate)
    if (peerConn.localDescription?.sdp) {
      peerConn.localCandidates = (peerConn.localDescription.sdp.match(/a=candidate:/g) || []).length
    }
    if (peerConn.remoteDescription?.sdp) {
      peerConn.remoteCandidates = (peerConn.remoteDescription.sdp.match(/a=candidate:/g) || []).length
    }

    this.emit({
      type: 'peer-updated',
      peerId: peerConn.peerId,
      connection: peerConn,
    })
  }

  /**
   * Start periodic health check for peer connections.
   * Retries failed or disconnected peers.
   */
  private startPeerHealthCheck(): void {
    if (this.peerHealthCheckInterval) return

    console.log('[WebRTC] Starting peer health check')
    this.peerHealthCheckInterval = setInterval(() => {
      this.checkPeerHealth()
    }, WebRTCSignalingClient.PEER_HEALTH_CHECK_INTERVAL)
  }

  /**
   * Stop the peer health check interval
   */
  private stopPeerHealthCheck(): void {
    if (this.peerHealthCheckInterval) {
      console.log('[WebRTC] Stopping peer health check')
      clearInterval(this.peerHealthCheckInterval)
      this.peerHealthCheckInterval = null
    }
  }

  /**
   * Check health of all peer connections and retry failed ones.
   * This handles the case where initial connection attempts failed due to timing.
   */
  private checkPeerHealth(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }

    const peerCount = this.peers.size
    if (peerCount === 0) {
      return // No peers to check
    }

    for (const [peerId, peerConn] of this.peers) {
      const state = peerConn.pc.connectionState
      const iceState = peerConn.pc.iceConnectionState
      const dataChannelState = peerConn.dataChannel?.readyState

      // Skip if already connected with open data channel
      if (state === 'connected' && dataChannelState === 'open') {
        continue
      }

      // Check for connection timeout
      const startTime = this.connectionStartTimes.get(peerId) || 0
      const elapsed = Date.now() - startTime
      
      // If ICE is connected, we give it much more time (30s) to finish DTLS/SCTP handshake
      // If ICE is NOT connected, we use the standard timeout (15s)
      const timeout = iceState === 'connected' ? 30000 : WebRTCSignalingClient.PEER_CONNECTION_TIMEOUT
      const isTimedOut = elapsed > timeout

      // Skip if connection is new or still actively connecting with a good data channel,
      // UNLESS it has been connecting for too long.
      if (!isTimedOut && (state === 'new' || (state === 'connecting' && dataChannelState === 'connecting'))) {
        continue
      }

      // Check if this peer needs reconnection
      // Failed/disconnected/closed connection states indicate we should retry
      const needsReconnect = 
        state === 'failed' || 
        state === 'disconnected' || 
        state === 'closed' ||
        (isTimedOut && state !== 'connected')

      // Also check if data channel is unhealthy while connection seems ok.
      const dataChannelUnhealthy = 
        (state === 'connected' || state === 'connecting') &&
        (dataChannelState === 'closing' || dataChannelState === 'closed' || (isTimedOut && (dataChannelState !== 'open')))

      if (needsReconnect || dataChannelUnhealthy) {
        // To avoid retry storms, only the "impolite" peer (higher ID) should initiate retries
        // for timeout/stuck situations. Connection failures (failed/closed) can be retried by both.
        const isImpolite = this.selfId! > peerId
        const isHardFailure = state === 'failed' || state === 'closed'

        if (isHardFailure || isImpolite) {
          console.log(`[WebRTC] Health check: ${peerId} needs reconnection (conn: ${state}, ice: ${iceState}, dc: ${dataChannelState}, timedOut: ${isTimedOut})`)
          this.retryPeerConnection(peerId)
        }
      }
    }
  }

  /**
   * Retry connection to a peer by cleaning up the old connection and creating a new one
   */
  private retryPeerConnection(peerId: string): void {
    const now = Date.now()
    const lastRetry = this.lastRetryTimes.get(peerId) || 0
    if (now - lastRetry < WebRTCSignalingClient.RETRY_COOLDOWN) {
      console.log('[WebRTC] Skipping retry for peer (cooldown):', peerId)
      return
    }

    const existingConn = this.peers.get(peerId)
    if (!existingConn) {
      console.log('[WebRTC] Retry aborted - peer not found:', peerId)
      return
    }

    this.lastRetryTimes.set(peerId, now)
    console.log('[WebRTC] Retrying peer connection:', peerId)

    // Clean up old connection
    if (existingConn.dataChannel) {
      console.log('[WebRTC] Closing data channel for retry:', peerId)
      try {
        existingConn.dataChannel.close()
      } catch (e) {
        // Ignore errors on close
      }
    }
    try {
      existingConn.pc.close()
    } catch (e) {
      // Ignore errors on close
    }
    this.peers.delete(peerId)
    this.connectionStartTimes.delete(peerId)
    // Clear global candidates for this peer - they belong to the old connection/session
    // and cannot be reused because ufrag/pwd will change in the new connection.
    this.globalPendingCandidates.delete(peerId)
    console.log('[WebRTC] Cleaned up old connection, creating new one for:', peerId)

    // Emit peer-left for the old connection
    this.emit({
      type: 'peer-left',
      peerId,
    })

    // Create new connection (as initiator since we're retrying)
    this.createPeerConnection(peerId, true)
  }

  private generateMsgId(): string {
    return `msg_${Date.now()}_${++this.msgIdCounter}`
  }
}
