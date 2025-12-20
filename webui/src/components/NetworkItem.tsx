import { useState } from 'react'
import { joinNetwork, deleteNetwork } from '../utils/api'
import type { Network } from '../types'

interface NetworkItemProps {
  network: Network
  onDelete: () => void
  onStatusChange: (message: string, type: 'info' | 'success' | 'error') => void
}

export function NetworkItem({ network, onDelete, onStatusChange }: NetworkItemProps) {
  const [loading, setLoading] = useState(false)

  const handleJoin = async () => {
    try {
      setLoading(true)
      onStatusChange('Joining network...', 'info')
      await joinNetwork(network.id)
      onStatusChange('Successfully joined network!', 'success')
    } catch (error) {
      onStatusChange(
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      )
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this network? This action cannot be undone.')) {
      return
    }

    try {
      setLoading(true)
      onStatusChange('Deleting network...', 'info')
      await deleteNetwork(network.id)
      onStatusChange('Network deleted successfully!', 'success')
      setTimeout(() => {
        onDelete()
      }, 1000)
    } catch (error) {
      onStatusChange(
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="network-item">
      <div className="network-info">
        <h3>{network.name}</h3>
        <p className="network-endpoint">{network.headscale_endpoint}</p>
        <p className="network-date">
          Created: {new Date(network.created_at).toLocaleDateString()}
        </p>
      </div>
      <div className="network-actions">
        <button
          className="join-btn"
          onClick={handleJoin}
          disabled={loading}
        >
          Join
        </button>
        <button
          className="delete-btn"
          onClick={handleDelete}
          disabled={loading}
        >
          Delete
        </button>
      </div>
    </div>
  )
}
