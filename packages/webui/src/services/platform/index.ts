/**
 * Platform abstraction module
 * Provides platform-specific implementations for different environments
 */

export * from './types'
export * from './browser'
export { browserPlatform } from './browser'

// Platform instance (will be set by the platform-specific entry point)
let platformConfig: import('./types').PlatformConfig | null = null

/**
 * Initialize the platform configuration
 * Should be called once at application startup
 */
export function setPlatform(platform: import('./types').PlatformConfig): void {
  platformConfig = platform
  console.log('[Platform] Platform initialized:', platform)
}

/**
 * Get the current platform configuration
 * @throws Error if platform hasn't been initialized
 */
export function getPlatform(): import('./types').PlatformConfig {
  if (!platformConfig) {
    throw new Error('Platform not initialized. Call setPlatform() first.')
  }
  return platformConfig
}

