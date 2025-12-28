# Compilation Fixes Needed

The webrtc crate API is different from what was assumed. Key fixes needed:

1. **Callback signatures**: Need to return `Pin<Box<dyn Future<Output = ()> + Send>>`
2. **Data channel messages**: `DataChannelMessage` is a struct, use `new()` or `from_bytes()`
3. **on_data_channel**: Takes `Arc<RTCDataChannel>` directly, not `Option`
4. **URL**: Convert to string for `connect_async`
5. **SDP types**: Use `RTCSdpType` enum, parse from string
6. **ICE candidate**: Use `RTCIceCandidateInit` not `RTCIceCandidate` for `add_ice_candidate`
7. **Data channel state**: Use `data_channel_state::RTCDataChannelState`
8. **WebSocket close codes**: Use `CloseCode` enum values
9. **Setting engine**: Configure before building API

