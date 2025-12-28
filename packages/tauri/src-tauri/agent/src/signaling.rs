use crate::webrtc::{WebRTCManager, RTCIceCandidate};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tracing::{debug, error, info, warn};
use url::Url;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerRecord {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutboundMessage {
    #[serde(rename = "type")]
    pub message_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    #[serde(rename = "peerId", skip_serializing_if = "Option::is_none")]
    pub peer_id: Option<String>,
    #[serde(rename = "selfId", skip_serializing_if = "Option::is_none")]
    pub self_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub peers: Option<Vec<PeerRecord>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InboundMessage {
    #[serde(rename = "type")]
    pub message_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<serde_json::Value>,
    #[serde(rename = "msgId", skip_serializing_if = "Option::is_none")]
    pub msg_id: Option<String>,
}

pub type OnPeerListCallback = Box<dyn Fn(Vec<PeerRecord>) + Send + Sync>;
pub type OnWelcomeCallback = Box<dyn Fn(String) + Send + Sync>;

/// SignalingClient handles connection to the signaling server
#[derive(Clone)]
pub struct SignalingClient {
    url: String,
    topic: String,
    webrtc: Arc<WebRTCManager>,
    self_id: Arc<RwLock<Option<String>>>,
    on_peer_list: Arc<RwLock<Option<OnPeerListCallback>>>,
    on_welcome: Arc<RwLock<Option<OnWelcomeCallback>>>,
    sender: Arc<RwLock<Option<tokio::sync::mpsc::UnboundedSender<Message>>>>,
}

impl SignalingClient {
    /// Create a new signaling client
    pub fn new(url: String, topic: String, webrtc: Arc<WebRTCManager>) -> Self {
        Self {
            url,
            topic,
            webrtc,
            self_id: Arc::new(RwLock::new(None)),
            on_peer_list: Arc::new(RwLock::new(None)),
            on_welcome: Arc::new(RwLock::new(None)),
            sender: Arc::new(RwLock::new(None)),
        }
    }

    /// Set callback for when peer list is received
    pub async fn set_on_peer_list(&self, callback: OnPeerListCallback) {
        *self.on_peer_list.write().await = Some(callback);
    }

    /// Set callback for when welcome message is received
    pub async fn set_on_welcome(&self, callback: OnWelcomeCallback) {
        *self.on_welcome.write().await = Some(callback);
    }

    /// Connect to the signaling server
    pub async fn connect(&self) -> Result<()> {
        let ws_url = format!("{}/ws/{}", self.url, self.topic);
        info!("Connecting to signaling server: url={}", ws_url);

        // Validate URL format but pass string to connect_async
        let _ = Url::parse(&ws_url)?;
        let (ws_stream, _) = connect_async(&ws_url).await?;

        let (write, read) = ws_stream.split();
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();

        *self.sender.write().await = Some(tx.clone());

        // Spawn writer task
        let sender_clone = self.sender.clone();
        tokio::spawn(async move {
            let mut write = write;
            while let Some(msg) = rx.recv().await {
                if let Err(e) = write.send(msg).await {
                    error!("Failed to send message to signaling server: {}", e);
                    break;
                }
            }
            *sender_clone.write().await = None;
        });

        // Spawn reader task
        let webrtc = self.webrtc.clone();
        let self_id = self.self_id.clone();
        let on_welcome = self.on_welcome.clone();
        let on_peer_list = self.on_peer_list.clone();
        let sender = self.sender.clone();
        let signaling_client_arc = Arc::new(self.clone());

        tokio::spawn(async move {
            let mut read = read;
            loop {
                match read.next().await {
                    Some(Ok(Message::Text(text))) => {
                        if let Err(e) = Self::handle_message(
                            &text,
                            &webrtc,
                            &self_id,
                            &on_welcome,
                            &on_peer_list,
                            &signaling_client_arc,
                        )
                        .await
                        {
                            error!("Failed to handle signaling message: {}", e);
                        }
                    }
                    Some(Ok(Message::Close(_))) => {
                        info!("Signaling server closed connection");
                        break;
                    }
                    Some(Err(e)) => {
                        debug!("Signaling read error: {}", e);
                        break;
                    }
                    None => break,
                    _ => {}
                }
            }
            *sender.write().await = None;
        });

        Ok(())
    }

    async fn handle_message(
        text: &str,
        webrtc: &Arc<WebRTCManager>,
        self_id: &Arc<RwLock<Option<String>>>,
        on_welcome: &Arc<RwLock<Option<OnWelcomeCallback>>>,
        on_peer_list: &Arc<RwLock<Option<OnPeerListCallback>>>,
        signaling_client: &Arc<SignalingClient>,
    ) -> Result<()> {
        let msg: OutboundMessage = serde_json::from_str(text)?;
        debug!("Received signaling message: type={}", msg.message_type);

        match msg.message_type.as_str() {
            "welcome" => {
                if let Some(id) = msg.self_id {
                    *self_id.write().await = Some(id.clone());
                    info!("Received welcome: selfId={}", id);
                    if let Some(ref callback) = *on_welcome.read().await {
                        callback(id);
                    }
                }
            }
            "peer-list" => {
                if let Some(ref peers) = msg.peers {
                    info!("Received peer list: count={}", peers.len());
                    if let Some(ref callback) = *on_peer_list.read().await {
                        callback(peers.clone());
                    }
                    // Create peer connections for existing peers
                    let self_id_guard = self_id.read().await;
                    let self_id_val = self_id_guard.as_ref();
                    for peer in peers {
                    if self_id_val.map(|s| s != &peer.id).unwrap_or(true) {
                        Self::create_peer_connection(
                            &peer.id,
                            webrtc,
                            self_id_val,
                            true,
                            signaling_client,
                        )
                        .await?;
                    }
                    }
                }
            }
            "peer-joined" => {
                if let Some(peer_id) = msg.peer_id {
                    info!("Peer joined: peerId={}", peer_id);
                    let self_id_guard = self_id.read().await;
                    let self_id_val = self_id_guard.as_ref();
                    if self_id_val.map(|s| s != &peer_id).unwrap_or(true) {
                        Self::create_peer_connection(
                            &peer_id,
                            webrtc,
                            self_id_val,
                            true,
                            signaling_client,
                        )
                        .await?;
                    }
                }
            }
            "peer-left" => {
                if let Some(peer_id) = msg.peer_id {
                    info!("Peer left: peerId={}", peer_id);
                    webrtc.close_peer(&peer_id).await;
                }
            }
            "offer" => {
                Self::handle_offer(&msg, webrtc, self_id, signaling_client).await?;
            }
            "answer" => {
                Self::handle_answer(&msg, webrtc).await?;
            }
            "ice-candidate" => {
                Self::handle_ice_candidate(&msg, webrtc).await?;
            }
            "error" => {
                error!("Signaling error: message={}", text);
            }
            _ => {
                warn!("Unknown signaling message type: {}", msg.message_type);
            }
        }

        Ok(())
    }

    async fn create_peer_connection(
        peer_id: &str,
        webrtc: &Arc<WebRTCManager>,
        self_id: Option<&String>,
        is_initiator: bool,
        signaling_client: &Arc<SignalingClient>,
    ) -> Result<()> {
        // Check if peer connection already exists
        if webrtc.get_peer_connection(peer_id).await.is_ok() {
            debug!("Peer connection already exists: peer={}", peer_id);
            return Ok(());
        }

        // Use perfect negotiation: only the "polite" peer (lower ID) creates offer
        let is_polite = self_id
            .map(|s| s.as_str() < peer_id)
            .unwrap_or(false);
        let should_create_offer = is_initiator && is_polite;

        webrtc
            .create_peer_connection(peer_id.to_string(), should_create_offer)
            .await?;

        if should_create_offer {
            // Create and send offer
            let offer = webrtc.create_offer(peer_id).await?;
            let payload = json!({
                "sdp": offer.sdp,
                "type": offer.sdp_type.to_string(),
            });

            signaling_client.send_relay_message("offer", peer_id, payload, None).await?;
        }

        Ok(())
    }

    async fn handle_offer(
        msg: &OutboundMessage,
        webrtc: &Arc<WebRTCManager>,
        self_id: &Arc<RwLock<Option<String>>>,
        signaling_client: &Arc<SignalingClient>,
    ) -> Result<()> {
        let peer_id = msg.from.as_ref().context("Missing 'from' in offer message")?;
        info!("Received offer: from={}", peer_id);

        // Get or create peer connection
        let peer = webrtc.get_peer_connection(peer_id).await;
        let peer = if peer.is_err() {
            // Create peer connection as responder
            webrtc
                .create_peer_connection(peer_id.clone(), false)
                .await?
        } else {
            peer?
        };

        // Check if we already have a local offer (collision case)
        // Use perfect negotiation: compare peer IDs to determine who is "polite"
        let self_id_guard = self_id.read().await;
        let self_id_val = self_id_guard.as_ref();
        let is_polite = self_id_val
            .map(|s| s.as_str() < peer_id.as_str())
            .unwrap_or(false);

        // Note: We can't easily check signaling state in webrtc-rs, so we'll
        // just handle the offer. If there's a collision, we'll close and recreate.
        // This is a simplification - in production you'd want to check the state.

        // Parse offer
        let payload = msg
            .payload
            .as_ref()
            .context("Missing payload in offer message")?;
        let sdp = payload
            .get("sdp")
            .and_then(|v| v.as_str())
            .context("Missing 'sdp' in offer payload")?;
        let sdp_type = payload
            .get("type")
            .and_then(|v| v.as_str())
            .context("Missing 'type' in offer payload")?;

        let offer = match sdp_type {
            "offer" => webrtc::peer_connection::sdp::session_description::RTCSessionDescription::offer(sdp.to_string()),
            "answer" => webrtc::peer_connection::sdp::session_description::RTCSessionDescription::answer(sdp.to_string()),
            "pranswer" => webrtc::peer_connection::sdp::session_description::RTCSessionDescription::pranswer(sdp.to_string()),
            _ => anyhow::bail!("Unknown SDP type: {}", sdp_type),
        }?;

        webrtc
            .set_remote_description(peer_id, offer)
            .await
            .context("Failed to set remote description")?;

        // Create and send answer
        let answer = webrtc
            .create_answer(peer_id)
            .await
            .context("Failed to create answer")?;

        let answer_payload = json!({
            "sdp": answer.sdp,
            "type": answer.sdp_type.to_string(),
        });

        signaling_client.send_relay_message("answer", peer_id, answer_payload, None).await?;

        Ok(())
    }

    async fn handle_answer(msg: &OutboundMessage, webrtc: &Arc<WebRTCManager>) -> Result<()> {
        let peer_id = msg.from.as_ref().context("Missing 'from' in answer message")?;
        info!("Received answer: from={}", peer_id);

        let payload = msg
            .payload
            .as_ref()
            .context("Missing payload in answer message")?;
        let sdp = payload
            .get("sdp")
            .and_then(|v| v.as_str())
            .context("Missing 'sdp' in answer payload")?;
        let sdp_type = payload
            .get("type")
            .and_then(|v| v.as_str())
            .context("Missing 'type' in answer payload")?;

        let answer = match sdp_type {
            "offer" => webrtc::peer_connection::sdp::session_description::RTCSessionDescription::offer(sdp.to_string()),
            "answer" => webrtc::peer_connection::sdp::session_description::RTCSessionDescription::answer(sdp.to_string()),
            "pranswer" => webrtc::peer_connection::sdp::session_description::RTCSessionDescription::pranswer(sdp.to_string()),
            _ => anyhow::bail!("Unknown SDP type: {}", sdp_type),
        }?;

        webrtc
            .set_remote_description(peer_id, answer)
            .await
            .context("Failed to set remote description")
    }

    async fn handle_ice_candidate(
        msg: &OutboundMessage,
        webrtc: &Arc<WebRTCManager>,
    ) -> Result<()> {
        let peer_id = msg.from.as_ref().context("Missing 'from' in ICE candidate message")?;
        debug!("Received ICE candidate: from={}", peer_id);

        // Check if peer connection exists
        if webrtc.get_peer_connection(peer_id).await.is_err() {
            debug!("Received ICE candidate for unknown peer, will queue: peer={}", peer_id);
            // TODO: Implement candidate queueing if needed
            return Ok(());
        }

        let payload = msg
            .payload
            .as_ref()
            .context("Missing payload in ICE candidate message")?;
        let candidate_str = payload
            .get("candidate")
            .and_then(|v| v.as_str())
            .context("Missing 'candidate' in ICE candidate payload")?;

        // Parse candidate string to RTCIceCandidateInit directly
        // The candidate_str should be in SDP format, parse it
        let candidate_init = webrtc::ice_transport::ice_candidate::RTCIceCandidateInit {
            candidate: candidate_str.to_string(),
            sdp_mid: None,
            sdp_mline_index: None,
            username_fragment: None,
        };
        
        // Get peer connection and add candidate
        let peer = webrtc.get_peer_connection(peer_id).await?;
        if let Err(e) = peer.pc.add_ice_candidate(candidate_init).await {
            // Don't log as error if remote description isn't set yet - that's normal
            if !e.to_string().contains("remote description is not set") {
                warn!("Failed to add ICE candidate: peer={}, error={}", peer_id, e);
            }
        }

        Ok(())
    }


    /// Send a relay message to the signaling server
    pub async fn send_relay_message(
        &self,
        msg_type: &str,
        to: &str,
        payload: serde_json::Value,
        msg_id: Option<String>,
    ) -> Result<()> {
        let msg = InboundMessage {
            message_type: msg_type.to_string(),
            to: Some(to.to_string()),
            payload: Some(payload),
            msg_id,
        };

        let text = serde_json::to_string(&msg)?;
        let sender = self.sender.read().await;
        if let Some(ref tx) = *sender {
            tx.send(Message::Text(text))
                .map_err(|e| anyhow::anyhow!("Failed to send message: {}", e))?;
        }

        Ok(())
    }

    /// Send an ICE candidate to a peer via signaling
    pub async fn send_ice_candidate(
        &self,
        peer_id: &str,
        candidate: RTCIceCandidate,
    ) -> Result<()> {
        // Convert RTCIceCandidate to string and parse as JSON
        let candidate_str = candidate.to_string();
        // The candidate string format is: "candidate:<foundation> <component> <protocol> <priority> <ip> <port> typ <type> ..."
        // For now, just send the full candidate string
        let payload = json!({
            "candidate": candidate_str,
        });

        self.send_relay_message("ice-candidate", peer_id, payload, None)
            .await
    }

    /// Get self peer ID
    pub async fn get_self_id(&self) -> Option<String> {
        self.self_id.read().await.clone()
    }

    /// Disconnect from the signaling server
    pub async fn disconnect(&self) {
        let mut sender = self.sender.write().await;
        if let Some(tx) = sender.take() {
            let _ = tx.send(Message::Close(None));
        }
    }
}

use futures_util::{SinkExt, StreamExt};

