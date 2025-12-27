import * as Y from 'yjs'
import { PersistenceProvider } from './PersistenceProvider'

/**
 * In-memory persistence provider (no persistence).
 * This is the default for Node.js/Bun environments.
 */
export class MemoryPersistence implements PersistenceProvider {
  private doc: Y.Doc | null = null
  private ready = false

  async init(doc: Y.Doc): Promise<void> {
    this.doc = doc
    // Memory persistence is immediately ready
    this.ready = true
    console.log('[MemoryPersistence] Initialized (no persistence)')
  }

  async waitUntilReady(): Promise<void> {
    // Memory persistence is immediately ready
    this.ready = true
    return Promise.resolve()
  }

  async clear(): Promise<void> {
    // Nothing to clear in memory
    console.log('[MemoryPersistence] Clear called (no-op)')
  }

  destroy(): void {
    this.doc = null
    this.ready = false
    console.log('[MemoryPersistence] Destroyed')
  }

  isReady(): boolean {
    return this.ready
  }
}

