import * as Y from 'yjs'

/**
 * Interface for persistence providers.
 * Allows plugging in different storage backends (IndexedDB, filesystem, memory, etc.)
 */
export interface PersistenceProvider {
  /**
   * Initialize persistence for a Y.Doc
   * This should set up listeners and start syncing
   */
  init(doc: Y.Doc): Promise<void>

  /**
   * Wait for persistence to be ready (e.g., loaded from disk)
   * Should resolve when initial data has been loaded
   */
  waitUntilReady(): Promise<void>

  /**
   * Clear all persisted data
   */
  clear(): Promise<void>

  /**
   * Clean up resources
   */
  destroy(): void

  /**
   * Whether persistence is ready
   */
  isReady(): boolean
}

