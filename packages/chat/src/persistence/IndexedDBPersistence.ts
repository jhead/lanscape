import * as Y from 'yjs'
import { PersistenceProvider } from './PersistenceProvider'

// Type for IndexeddbPersistence from y-indexeddb
type IndexeddbPersistenceType = {
  new (name: string, doc: Y.Doc): {
    on(event: 'synced', handler: () => void): void
    clearData(): Promise<void>
    destroy(): void
  }
}

/**
 * IndexedDB persistence provider for browser environments.
 * Wraps y-indexeddb to match the PersistenceProvider interface.
 * Uses dynamic import to avoid requiring y-indexeddb in Node.js/Bun environments.
 */
export class IndexedDBPersistence implements PersistenceProvider {
  private persistence: InstanceType<IndexeddbPersistenceType> | null = null
  private ready = false
  private readyPromise: Promise<void> | null = null
  private IndexeddbPersistenceClass: IndexeddbPersistenceType | null = null

  constructor(private docName: string) {}

  async init(doc: Y.Doc): Promise<void> {
    if (this.persistence) {
      throw new Error('IndexedDBPersistence already initialized')
    }

    // Dynamically import y-indexeddb (browser-only)
    if (!this.IndexeddbPersistenceClass) {
      try {
        // @ts-ignore
        const module = await import(/* @vite-ignore */'y-indexeddb')
        this.IndexeddbPersistenceClass = module.IndexeddbPersistence as IndexeddbPersistenceType
      } catch (error) {
        throw new Error(
          'y-indexeddb is required for IndexedDBPersistence. Install it with: npm install y-indexeddb'
        )
      }
    }

    if (!this.IndexeddbPersistenceClass) {
      throw new Error('Failed to load y-indexeddb')
    }

    console.log('[IndexedDBPersistence] Creating persistence for:', this.docName)
    this.persistence = new this.IndexeddbPersistenceClass(this.docName, doc)

    // Set up ready promise
    this.readyPromise = new Promise<void>((resolve) => {
      this.persistence!.on('synced', () => {
        console.log('[IndexedDBPersistence] Synced')
        this.ready = true
        resolve()
      })
    })
  }

  async waitUntilReady(): Promise<void> {
    if (!this.persistence) {
      throw new Error('IndexedDBPersistence not initialized. Call init() first.')
    }

    if (this.readyPromise) {
      await this.readyPromise
      this.readyPromise = null
    }

    return Promise.resolve()
  }

  async clear(): Promise<void> {
    if (!this.persistence) {
      return
    }

    console.log('[IndexedDBPersistence] Clearing data')
    await this.persistence.clearData()
  }

  destroy(): void {
    if (this.persistence) {
      console.log('[IndexedDBPersistence] Destroying')
      this.persistence.destroy()
      this.persistence = null
    }
    this.ready = false
    this.readyPromise = null
  }

  isReady(): boolean {
    return this.ready && this.persistence !== null
  }
}

