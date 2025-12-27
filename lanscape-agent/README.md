# lanscape-agent

Local WebRTC agent that handles WebRTC peer connections and enforces Tailscale interface usage. The agent bridges WebRTC data channels to WebSocket connections for browser clients.

## Architecture

The agent sits between the browser and the WebRTC signaling server:

```
Browser <-> WebSocket <-> Agent <-> WebRTC <-> Signaling Server
                              |
                              v
                        Tailscale Interface
```

The agent:
- Accepts WebSocket connections from browsers
- Connects to the signaling server for peer discovery
- Establishes WebRTC peer connections using Pion WebRTC
- Binds WebRTC traffic to the Tailscale interface
- Bridges data channel messages between WebRTC and WebSocket

## Building

```bash
cd lanscape-agent
go build -o lanscape-agent ./cmd/lanscape-agent
```

## Running

```bash
./lanscape-agent [flags]
```

### Flags

- `-ws-addr`: WebSocket server address (default: `localhost:8082`)
- `-signaling-url`: Signaling server URL (default: `ws://localhost:8081`)
- `-topic`: Signaling topic/room name (default: `lanscape-chat`)
- `-log-level`: Log level: debug, info, warn, error (default: `info`)

### Example

```bash
./lanscape-agent \
  -ws-addr localhost:8082 \
  -signaling-url wss://signaling.example.tsnet.jxh.io \
  -topic lanscape-chat \
  -log-level info
```

## Requirements

- Tailscale must be installed and running
- The agent will automatically detect the Tailscale interface and IP
- If Tailscale is not available, the agent will continue but without interface binding

## Browser Integration

The browser connects to the agent via WebSocket at the configured address. The agent handles all WebRTC complexity, so the browser only needs to send/receive data messages.

### Protocol

**Browser → Agent**:
```json
{
  "type": "data",
  "peerId": "peer-id-here",
  "data": [1, 2, 3, ...]  // Array of bytes
}
```

**Agent → Browser**:
```json
{
  "type": "peer-connected",
  "peerId": "peer-id-here"
}
```

```json
{
  "type": "data",
  "peerId": "peer-id-here",
  "data": [1, 2, 3, ...]  // Array of bytes
}
```

```json
{
  "type": "peer-disconnected",
  "peerId": "peer-id-here"
}
```

## Tailscale Interface Binding

The agent automatically:
1. Detects the Tailscale IP using `tailscale ip` or the local API
2. Finds the Tailscale interface (e.g., `tailscale0`)
3. Configures WebRTC to bind to the Tailscale interface
4. Sets NAT 1:1 IP mapping with the Tailscale IP

This ensures all WebRTC traffic stays on the Tailscale network.

