import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { fetchNetworks } from '../utils/api'
import type { Network } from '../types'

interface NetworkContextType {
  currentNetwork: Network | null
  networks: Network[]
  loading: boolean
  setCurrentNetwork: (network: Network | null) => void
  refreshNetworks: () => Promise<void>
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined)

const CURRENT_NETWORK_KEY = 'lanscape_current_network'

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [currentNetwork, setCurrentNetworkState] = useState<Network | null>(null)
  const [networks, setNetworks] = useState<Network[]>([])
  const [loading, setLoading] = useState(true)

  // Load current network from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(CURRENT_NETWORK_KEY)
    if (stored) {
      try {
        const network = JSON.parse(stored)
        setCurrentNetworkState(network)
        console.log('[NetworkContext] Loaded current network from storage:', network.name)
      } catch (error) {
        console.error('[NetworkContext] Failed to parse stored network:', error)
        localStorage.removeItem(CURRENT_NETWORK_KEY)
      }
    }
  }, [])

  // Fetch networks on mount
  const refreshNetworks = useCallback(async () => {
    try {
      setLoading(true)
      const fetchedNetworks = await fetchNetworks()
      setNetworks(fetchedNetworks)
      console.log('[NetworkContext] Fetched', fetchedNetworks.length, 'networks')

      // Track if we set a network during validation
      let networkSet = false

      // If we have a current network stored, verify it still exists
      const stored = localStorage.getItem(CURRENT_NETWORK_KEY)
      if (stored) {
        try {
          const storedNetwork = JSON.parse(stored)
          const networkExists = fetchedNetworks.some(n => n.id === storedNetwork.id)
          if (!networkExists) {
            console.log('[NetworkContext] Stored network no longer exists, clearing')
            localStorage.removeItem(CURRENT_NETWORK_KEY)
            setCurrentNetworkState(null)
          } else {
            // Update with latest network data
            const updatedNetwork = fetchedNetworks.find(n => n.id === storedNetwork.id)
            if (updatedNetwork) {
              setCurrentNetworkState(updatedNetwork)
              localStorage.setItem(CURRENT_NETWORK_KEY, JSON.stringify(updatedNetwork))
              networkSet = true
            }
          }
        } catch (error) {
          console.error('[NetworkContext] Error validating stored network:', error)
        }
      }

      // Auto-select first network if none is selected and networks exist
      if (!networkSet && fetchedNetworks.length > 0) {
        const firstNetwork = fetchedNetworks[0]
        console.log('[NetworkContext] Auto-selecting first network:', firstNetwork.name)
        setCurrentNetworkState(firstNetwork)
        localStorage.setItem(CURRENT_NETWORK_KEY, JSON.stringify(firstNetwork))
      }
    } catch (error) {
      console.error('[NetworkContext] Error fetching networks:', error)
      setNetworks([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshNetworks()
  }, [refreshNetworks])

  const setCurrentNetwork = useCallback((network: Network | null) => {
    setCurrentNetworkState(network)
    if (network) {
      localStorage.setItem(CURRENT_NETWORK_KEY, JSON.stringify(network))
      console.log('[NetworkContext] Set current network:', network.name)
    } else {
      localStorage.removeItem(CURRENT_NETWORK_KEY)
      console.log('[NetworkContext] Cleared current network')
    }
  }, [])

  return (
    <NetworkContext.Provider
      value={{
        currentNetwork,
        networks,
        loading,
        setCurrentNetwork,
        refreshNetworks,
      }}
    >
      {children}
    </NetworkContext.Provider>
  )
}

export function useNetwork() {
  const context = useContext(NetworkContext)
  if (context === undefined) {
    throw new Error('useNetwork must be used within a NetworkProvider')
  }
  return context
}

