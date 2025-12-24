// WebRTC Signaling Types
export interface SignalingMessage {
  type: string;
  [key: string]: any;
}

export interface WelcomeMessage extends SignalingMessage {
  type: "welcome";
  selfId: string;
}

export interface PeerListMessage extends SignalingMessage {
  type: "peer-list";
  peers: PeerRecord[];
}

export interface PeerJoinedMessage extends SignalingMessage {
  type: "peer-joined";
  peerId: string;
  metadata?: any;
}

export interface PeerLeftMessage extends SignalingMessage {
  type: "peer-left";
  peerId: string;
}

export interface OfferMessage extends SignalingMessage {
  type: "offer";
  from: string;
  payload: {
    sdp: string;
    type: string;
  };
  msgId?: string;
}

export interface AnswerMessage extends SignalingMessage {
  type: "answer";
  from: string;
  payload: {
    sdp: string;
    type: string;
  };
  msgId?: string;
}

export interface IceCandidateMessage extends SignalingMessage {
  type: "ice-candidate";
  from: string;
  payload: {
    candidate: string;
    sdpMLineIndex?: number;
    sdpMid?: string;
  };
  msgId?: string;
}

export interface ErrorMessage extends SignalingMessage {
  type: "error";
  code: string;
  message: string;
  msgId?: string;
}

export interface PeerRecord {
  id: string;
  metadata?: any;
}

export interface PeerConnectionInfo {
  peerId: string;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  iceGatheringState: RTCIceGatheringState;
  signalingState: RTCSignalingState;
  localDescription?: RTCSessionDescriptionInit;
  remoteDescription?: RTCSessionDescriptionInit;
  remoteCandidates: number;
  localCandidates: number;
}
