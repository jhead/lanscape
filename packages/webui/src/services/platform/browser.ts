/**
 * Browser platform implementation
 * Uses standard browser APIs
 */

import type { HttpClient, AgentLifecycle, AgentConfig, WebSocketProviderFactory, PlatformConfig } from './types'

/**
 * Browser HTTP client using native fetch
 */
export class BrowserHttpClient implements HttpClient {
  async fetch(url: string, options?: RequestInit): Promise<Response> {
    return window.fetch(url, {
      ...options,
      credentials: 'include', // Always include credentials in browser
    })
  }
}

/**
 * Browser agent lifecycle (no-op - agent is assumed to be running externally)
 */
export class BrowserAgentLifecycle implements AgentLifecycle {
  private agentUrl: string

  constructor() {
    // Get agent URL from env var or default
    this.agentUrl = import.meta.env.VITE_AGENT_URL || 'ws://localhost:8082'
  }

  async startAgent(_config: AgentConfig): Promise<void> {
    // In browser, agent is assumed to be running on the configured URL
    console.log('[BrowserAgentLifecycle] Agent should already be running at:', this.agentUrl)
  }

  async stopAgent(): Promise<void> {
    // In browser, we don't control the agent lifecycle
    console.log('[BrowserAgentLifecycle] Agent lifecycle not managed in browser')
  }

  getAgentUrl(): string {
    return this.agentUrl
  }
}

/**
 * Browser WebSocket provider factory (returns undefined to use default browser WebSocket)
 */
export class BrowserWebSocketProviderFactory implements WebSocketProviderFactory {
  createProvider() {
    // Return undefined to use default browser WebSocket
    return undefined
  }
}

/**
 * Browser platform configuration
 */
export const browserPlatform: PlatformConfig = {
  httpClient: new BrowserHttpClient(),
  agentLifecycle: new BrowserAgentLifecycle(),
  websocketProviderFactory: new BrowserWebSocketProviderFactory(),
  authMethod: 'webauthn', // Browser webui uses WebAuthn
}

