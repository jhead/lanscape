/**
 * Tauri platform implementation
 * Uses Tauri APIs for HTTP, WebSocket, and agent lifecycle management
 */

import type { HttpClient, AgentLifecycle, AgentConfig, WebSocketProviderFactory, PlatformConfig } from '@lanscape/webui/services/platform/types'
import { TauriWebSocketProvider } from '../chat/TauriWebSocketProvider'

/**
 * Tauri HTTP client using Tauri's HTTP plugin
 */
export class TauriHttpClient implements HttpClient {
  async fetch(url: string, options?: RequestInit): Promise<Response> {
    const { fetch } = await import('@tauri-apps/plugin-http')
    // Tauri's fetch handles cookies automatically, so we don't need credentials: 'include'
    return fetch(url, options)
  }
}

/**
 * Tauri agent lifecycle manager
 * Starts/stops the agent via Tauri commands
 */
export class TauriAgentLifecycle implements AgentLifecycle {
  private agentUrl: string

  constructor() {
    // Get agent URL from env var or default
    this.agentUrl = import.meta.env.VITE_AGENT_URL || 'ws://localhost:8082'
  }

  async startAgent(config: AgentConfig): Promise<void> {
    const { invoke } = await import('@tauri-apps/api/core')
    
    console.log('[TauriAgentLifecycle] Starting agent via Tauri...')
    await invoke('start_agent', {
      websocketAddr: config.websocketAddr,
      signalingUrl: config.signalingUrl,
      topic: config.topic,
    })
    console.log('[TauriAgentLifecycle] Agent start command sent, waiting for WebSocket server...')
    
    // Wait for agent to start the WebSocket server
    const initialDelay = 1000
    await new Promise(resolve => setTimeout(resolve, initialDelay))
    console.log('[TauriAgentLifecycle] Waiting period complete')
  }

  async stopAgent(): Promise<void> {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('stop_agent')
      console.log('[TauriAgentLifecycle] Agent stopped via Tauri')
    } catch (error) {
      console.error('[TauriAgentLifecycle] Failed to stop agent:', error)
      throw error
    }
  }

  getAgentUrl(): string {
    return this.agentUrl
  }
}

/**
 * Tauri WebSocket provider factory
 * Returns the Tauri WebSocket provider
 */
export class TauriWebSocketProviderFactory implements WebSocketProviderFactory {
  createProvider() {
    return new TauriWebSocketProvider()
  }
}

/**
 * Tauri platform configuration
 */
export const tauriPlatform: PlatformConfig = {
  httpClient: new TauriHttpClient(),
  agentLifecycle: new TauriAgentLifecycle(),
  websocketProviderFactory: new TauriWebSocketProviderFactory(),
  authMethod: 'oidc', // Tauri uses OIDC
}

