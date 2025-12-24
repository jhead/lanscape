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
    if (msg.peerId !== this.selfId && !this.peers.has(msg.peerId)) {
      this.createPeerConnection(msg.peerId, true)
    }
  }

  private handlePeerLeft(msg: PeerLeftMessage): void {
    console.log('[WebRTC] Peer left:', msg.peerId)
    const peerConn = this.peers.get(msg.peerId)
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
    if (!peerConn) {
      // Create connection as responder (don't create offer)
      peerConn = this.createPeerConnection(msg.from, false)
    }

    try {
      const offer = new RTCSessionDescription({
        type: 'offer',
        sdp: msg.payload.sdp,
      })
      await peerConn.pc.setRemoteDescription(offer)

      const answer = await peerConn.pc.createAnswer()
      await peerConn.pc.setLocalDescription(answer)

      this.sendSignalingMessage({
        type: 'answer',
        to: msg.from,
        payload: {
          sdp: answer.sdp!,
          type: answer.type,
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

    try {
      const answer = new RTCSessionDescription({
        type: 'answer',
        sdp: msg.payload.sdp,
      })
      await peerConn.pc.setRemoteDescription(answer)
      this.updatePeerInfo(peerConn)
    } catch (error) {
      console.error('[WebRTC] Error handling answer:', error)
    }
  }

  private handleIceCandidate(msg: IceCandidateMessage): void {
    console.log('[WebRTC] Received ICE candidate from:', msg.from)
    const peerConn = this.peers.get(msg.from)
    if (!peerConn) {
      console.warn('[WebRTC] Received ICE candidate from unknown peer:', msg.from)
      return
    }

    try {
      const candidate = new RTCIceCandidate({
        candidate: msg.payload.candidate,
        sdpMLineIndex: msg.payload.sdpMLineIndex,
        sdpMid: msg.payload.sdpMid,
      })
      peerConn.pc.addIceCandidate(candidate).catch((error) => {
        console.error('[WebRTC] Error adding ICE candidate:', error)
      })
      this.updatePeerInfo(peerConn)
    } catch (error) {
      console.error('[WebRTC] Error handling ICE candidate:', error)
    }
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

      this.sendSignalingMessage({
        type: 'offer',
        to: peerConn.peerId,
        payload: {
          sdp: offer.sdp!,
          type: offer.type,
        },
        msgId: this.generateMsgId(),
      })

      this.updatePeerInfo(peerConn)
    } catch (error) {
      console.error('[WebRTC] Error creating offer:', error)
    }
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

  private generateMsgId(): string {
    return `msg_${Date.now()}_${++this.msgIdCounter}`
  }
}
