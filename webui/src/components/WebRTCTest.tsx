import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { WebRTCSignalingClient, SignalingConfig } from '../services/webrtc/signaling'
import type { PeerConnection } from '../services/webrtc/signaling'
import './WebRTCTest.css'

// Support environment variable for signaling URL, with fallback to default
const DEFAULT_SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:8081'
const DEFAULT_TOPIC = 'test-room'

// Convert HTTP/HTTPS URLs to WebSocket URLs
function normalizeSignalingUrl(url: string): string {
  if (!url) return url
  url = url.trim()
  if (url.startsWith('http://')) {
    return url.replace('http://', 'ws://')
  }
  if (url.startsWith('https://')) {
    return url.replace('https://', 'wss://')
  }
  if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
    // If no protocol, assume ws://
    return `ws://${url}`
  }
  return url
}

export function WebRTCTest() {
  const [signalingUrl, setSignalingUrl] = useState(DEFAULT_SIGNALING_URL)
  const [topic, setTopic] = useState(DEFAULT_TOPIC)
  const [connected, setConnected] = useState(false)
  const [selfId, setSelfId] = useState<string | null>(null)
  const [peers, setPeers] = useState<Map<string, PeerConnection>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const clientRef = useRef<WebRTCSignalingClient | null>(null)

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (clientRef.current) {
        clientRef.current.disconnect()
        clientRef.current = null
      }
    }
  }, [])

  const handleConnect = async () => {
    if (clientRef.current) {
      clientRef.current.disconnect()
      clientRef.current = null
    }

    setError(null)
    setConnected(false)
    setSelfId(null)
    setPeers(new Map())

    try {
      const normalizedUrl = normalizeSignalingUrl(signalingUrl)
      const config: SignalingConfig = {
        signalingUrl: normalizedUrl,
        topic,
      }

      const client = new WebRTCSignalingClient(config)

      // Set up event listeners
      client.addEventListener((event) => {
        console.log('[WebRTCTest] Event:', event.type, event)

        switch (event.type) {
          case 'connected':
            setConnected(true)
            setSelfId(client.getSelfId())
            break
          case 'disconnected':
            setConnected(false)
            setSelfId(null)
            setPeers(new Map())
            break
          case 'error':
            setError(event.error?.message || 'Unknown error')
            break
          case 'peer-joined':
          case 'peer-updated':
            setPeers(new Map(client.getPeers()))
            break
          case 'peer-left':
            setPeers(new Map(client.getPeers()))
            break
        }
      })

      clientRef.current = client
      await client.connect()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect')
      setConnected(false)
    }
  }

  const handleDisconnect = () => {
    if (clientRef.current) {
      clientRef.current.disconnect()
      clientRef.current = null
    }
    setConnected(false)
    setSelfId(null)
    setPeers(new Map())
    setError(null)
  }

  const getStateColor = (state: string): string => {
    switch (state.toLowerCase()) {
      case 'connected':
      case 'stable':
      case 'complete':
        return '#4caf50'
      case 'connecting':
      case 'checking':
      case 'have-local-offer':
      case 'have-remote-offer':
      case 'have-local-pranswer':
      case 'have-remote-pranswer':
        return '#ff9800'
      case 'disconnected':
      case 'failed':
      case 'closed':
        return '#f44336'
      default:
        return '#757575'
    }
  }

  return (
    <div className="webrtc-test">
      <div className="webrtc-test-header">
        <h1>LANSCAPE</h1>
        <nav className="webrtc-test-nav">
          <Link to="/chat" className="nav-link">
            Chat
          </Link>
          <Link to="/networks" className="nav-link">
            Networks
          </Link>
          <Link to="/webrtc-test" className="nav-link active">
            WebRTC Test
          </Link>
        </nav>
      </div>

      <div className="webrtc-test-content">
        <div className="webrtc-test-config">
          <h2>WebRTC Signaling Test</h2>
          <p>Test peer discovery and WebRTC connection establishment via the signaling server.</p>
          
          <div className="config-form">
            <div className="config-field">
              <label htmlFor="signaling-url">Signaling Server URL:</label>
              <input
                id="signaling-url"
                type="text"
                value={signalingUrl}
                onChange={(e) => setSignalingUrl(e.target.value)}
                disabled={connected}
                placeholder="ws://localhost:8081"
              />
            </div>

            <div className="config-field">
              <label htmlFor="topic">Topic/Room:</label>
              <input
                id="topic"
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={connected}
                placeholder="test-room"
              />
            </div>

            {!connected ? (
              <button onClick={handleConnect} className="connect-button">
                Connect
              </button>
            ) : (
              <button onClick={handleDisconnect} className="disconnect-button">
                Disconnect
              </button>
            )}
          </div>

          {error && (
            <div className="error-message">
              <strong>Error:</strong> {error}
            </div>
          )}

          {connected && selfId && (
            <div className="self-info">
              <h3>My Peer ID</h3>
              <div className="peer-id">{selfId}</div>
            </div>
          )}
        </div>

        <div className="peers-section">
          <h2>Connected Peers ({peers.size})</h2>
          
          {peers.size === 0 ? (
            <div className="no-peers">
              {connected ? (
                <p>Waiting for peers to join... Open another tab to see peer discovery in action!</p>
              ) : (
                <p>Not connected. Connect to the signaling server to discover peers.</p>
              )}
            </div>
          ) : (
            <div className="peers-list">
              {Array.from(peers.values()).map((peerConn) => (
                <div key={peerConn.peerId} className="peer-card">
                  <div className="peer-header">
                    <h3>Peer: {peerConn.peerId.slice(0, 16)}...</h3>
                    <div className="peer-status-indicator">
                      <span
                        className="status-dot"
                        style={{ backgroundColor: getStateColor(peerConn.iceConnectionState) }}
                        title={peerConn.iceConnectionState}
                      />
                      {peerConn.iceConnectionState}
                    </div>
                  </div>

                  <div className="peer-details">
                    <div className="detail-row">
                      <span className="detail-label">Connection State:</span>
                      <span
                        className="detail-value"
                        style={{ color: getStateColor(peerConn.connectionState) }}
                      >
                        {peerConn.connectionState}
                      </span>
                    </div>

                    <div className="detail-row">
                      <span className="detail-label">ICE Connection:</span>
                      <span
                        className="detail-value"
                        style={{ color: getStateColor(peerConn.iceConnectionState) }}
                      >
                        {peerConn.iceConnectionState}
                      </span>
                    </div>

                    <div className="detail-row">
                      <span className="detail-label">ICE Gathering:</span>
                      <span className="detail-value">{peerConn.iceGatheringState}</span>
                    </div>

                    <div className="detail-row">
                      <span className="detail-label">Signaling State:</span>
                      <span className="detail-value">{peerConn.signalingState}</span>
                    </div>

                    <div className="detail-row">
                      <span className="detail-label">Local Candidates:</span>
                      <span className="detail-value">{peerConn.localCandidates}</span>
                    </div>

                    <div className="detail-row">
                      <span className="detail-label">Remote Candidates:</span>
                      <span className="detail-value">{peerConn.remoteCandidates}</span>
                    </div>

                    {peerConn.localDescription && (
                      <details className="sdp-details">
                        <summary>Local SDP</summary>
                        <pre className="sdp-content">{peerConn.localDescription.sdp}</pre>
                      </details>
                    )}

                    {peerConn.remoteDescription && (
                      <details className="sdp-details">
                        <summary>Remote SDP</summary>
                        <pre className="sdp-content">{peerConn.remoteDescription.sdp}</pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

