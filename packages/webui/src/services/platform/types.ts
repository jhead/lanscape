/**
 * Platform abstraction types
 * These interfaces allow the webui to work with different platforms (browser, Tauri, etc.)
 */

import type React from 'react'

/**
 * HTTP client abstraction
 * Provides a platform-agnostic way to make HTTP requests
 */
export interface HttpClient {
  fetch(url: string, options?: RequestInit): Promise<Response>
}

/**
 * Agent lifecycle manager
 * Handles starting and stopping the agent (no-op in browser, actual implementation in Tauri)
 */
export interface AgentLifecycle {
  /**
   * Start the agent before connecting to it
   * @param config Configuration for starting the agent
   * @returns Promise that resolves when agent is ready (or immediately in browser)
   */
  startAgent(config: AgentConfig): Promise<void>

  /**
   * Stop the agent when disconnecting
   * @returns Promise that resolves when agent is stopped (or immediately in browser)
   */
  stopAgent(): Promise<void>

  /**
   * Get the agent WebSocket URL
   * @returns The WebSocket URL to connect to
   */
  getAgentUrl(): string
}

export interface AgentConfig {
  websocketAddr: string
  signalingUrl: string
  topic: string
}

/**
 * WebSocket provider factory
 * Creates WebSocket instances compatible with the chat SDK
 */
export interface WebSocketProviderFactory {
  createProvider(): import('@lanscape/chat').WebSocketProvider | undefined
}

/**
 * Authentication method
 * Different platforms may support different authentication methods
 */
export type AuthMethod = 'webauthn' | 'oidc' | 'both'

/**
 * Platform configuration
 * Provides platform-specific implementations
 */
export interface PlatformConfig {
  httpClient: HttpClient
  agentLifecycle: AgentLifecycle
  websocketProviderFactory?: WebSocketProviderFactory
  authMethod: AuthMethod
  /**
   * Optional custom auth component factory
   * If provided, this component will be used instead of the default AuthForm
   */
  authComponent?: () => import('react').ReactElement
}

