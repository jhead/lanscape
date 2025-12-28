use serde::{Deserialize, Serialize};

/// Message types for browser-agent communication
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MessageType {
    Data,
    PeerConnected,
    PeerDisconnected,
    Error,
    Welcome,
}

impl MessageType {
    pub fn as_str(&self) -> &'static str {
        match self {
            MessageType::Data => "data",
            MessageType::PeerConnected => "peer-connected",
            MessageType::PeerDisconnected => "peer-disconnected",
            MessageType::Error => "error",
            MessageType::Welcome => "welcome",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "data" => Some(MessageType::Data),
            "peer-connected" => Some(MessageType::PeerConnected),
            "peer-disconnected" => Some(MessageType::PeerDisconnected),
            "error" => Some(MessageType::Error),
            "welcome" => Some(MessageType::Welcome),
            _ => None,
        }
    }
}

/// BrowserMessage represents a message from browser to agent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserMessage {
    #[serde(rename = "type")]
    pub message_type: String,
    #[serde(rename = "peerId", skip_serializing_if = "Option::is_none")]
    pub peer_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Vec<u8>>,
}

/// AgentMessage represents a message from agent to browser
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMessage {
    #[serde(rename = "type")]
    pub message_type: String,
    #[serde(rename = "peerId", skip_serializing_if = "Option::is_none")]
    pub peer_id: Option<String>,
    #[serde(rename = "selfId", skip_serializing_if = "Option::is_none")]
    pub self_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Vec<u8>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl AgentMessage {
    pub fn welcome(self_id: String) -> Self {
        Self {
            message_type: MessageType::Welcome.as_str().to_string(),
            peer_id: None,
            self_id: Some(self_id),
            data: None,
            error: None,
        }
    }

    pub fn peer_connected(peer_id: String) -> Self {
        Self {
            message_type: MessageType::PeerConnected.as_str().to_string(),
            peer_id: Some(peer_id),
            self_id: None,
            data: None,
            error: None,
        }
    }

    pub fn peer_disconnected(peer_id: String) -> Self {
        Self {
            message_type: MessageType::PeerDisconnected.as_str().to_string(),
            peer_id: Some(peer_id),
            self_id: None,
            data: None,
            error: None,
        }
    }

    pub fn data(peer_id: String, data: Vec<u8>) -> Self {
        Self {
            message_type: MessageType::Data.as_str().to_string(),
            peer_id: Some(peer_id),
            self_id: None,
            data: Some(data),
            error: None,
        }
    }

    pub fn error(error: String) -> Self {
        Self {
            message_type: MessageType::Error.as_str().to_string(),
            peer_id: None,
            self_id: None,
            data: None,
            error: Some(error),
        }
    }
}

