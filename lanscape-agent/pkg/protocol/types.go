package protocol

// Message types for browser-agent communication
const (
	MessageTypeData             = "data"
	MessageTypePeerConnected    = "peer-connected"
	MessageTypePeerDisconnected = "peer-disconnected"
	MessageTypeError            = "error"
	MessageTypeWelcome          = "welcome"
)

// BrowserMessage represents a message from browser to agent
type BrowserMessage struct {
	Type   string `json:"type"`
	PeerID string `json:"peerId,omitempty"`
	Data   []byte `json:"data,omitempty"` // Base64-encoded in JSON, decoded in client
}

// AgentMessage represents a message from agent to browser
type AgentMessage struct {
	Type   string `json:"type"`
	PeerID string `json:"peerId,omitempty"`
	SelfID string `json:"selfId,omitempty"`
	Data   []byte `json:"data,omitempty"` // Base64-encoded in JSON, decoded in client
	Error  string `json:"error,omitempty"`
}
