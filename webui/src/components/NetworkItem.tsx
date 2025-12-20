import { useState } from 'react'
import { joinNetwork, deleteNetwork, adoptDevice } from '../utils/api'
import { DeviceOnboardingModal } from './DeviceOnboardingModal'
import type { Network } from '../types'

interface NetworkItemProps {
  network: Network
  onDelete: () => void
  onStatusChange: (message: string, type: 'info' | 'success' | 'error') => void
}

export function NetworkItem({ network, onDelete, onStatusChange }: NetworkItemProps) {
  const [loading, setLoading] = useState(false)
  const [showDeviceOnboarding, setShowDeviceOnboarding] = useState(false)
  const [preauthKey, setPreauthKey] = useState<string | null>(null)

  const handleJoin = async () => {
    try {
      setLoading(true)
      onStatusChange('Connecting...', 'info')
      await joinNetwork(network.id)
      onStatusChange('Connected', 'success')
    } catch (error) {
      onStatusChange(
        error instanceof Error ? error.message : 'Connection failed',
        'error'
      )
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this network? This cannot be undone.')) {
      return
    }

    try {
      setLoading(true)
      onStatusChange('Deleting...', 'info')
      await deleteNetwork(network.id)
      onStatusChange('Deleted', 'success')
      setTimeout(() => {
        onDelete()
      }, 1000)
    } catch (error) {
      onStatusChange(
        error instanceof Error ? error.message : 'Delete failed',
        'error'
      )
    } finally {
      setLoading(false)
    }
  }

  const handleAddDevice = async () => {
    try {
      setLoading(true)
      onStatusChange('Creating preauth key...', 'info')
      const response = await adoptDevice(network.id)
      setPreauthKey(response.preauth_key)
      setShowDeviceOnboarding(true)
      onStatusChange('Preauth key created', 'success')
    } catch (error) {
      onStatusChange(
        error instanceof Error ? error.message : 'Failed to create preauth key',
        'error'
      )
    } finally {
      setLoading(false)
    }
  }

  const handleCloseModal = () => {
    setShowDeviceOnboarding(false)
    setPreauthKey(null)
  }

  return (
    <div className="network-item">
      <div className="network-info">
        <h3>{network.name}</h3>
        <p className="network-endpoint">{network.headscale_endpoint}</p>
        <p className="network-date">
          {new Date(network.created_at).toLocaleDateString()}
        </p>
      </div>
      <div className="network-actions">
        <button
          className="join-btn"
          onClick={handleJoin}
          disabled={loading}
        >
          Join Network
        </button>
        <button
          className="add-device-btn"
          onClick={handleAddDevice}
          disabled={loading}
        >
          Add Device
        </button>
        <button
          className="delete-btn"
          onClick={handleDelete}
          disabled={loading}
        >
          Delete Network
        </button>
      </div>
      {showDeviceOnboarding && preauthKey && (
        <DeviceOnboardingModal
          preauthKey={preauthKey}
          headscaleEndpoint={network.headscale_endpoint}
          onClose={handleCloseModal}
          onStatusChange={onStatusChange}
        />
      )}
    </div>
  )
}
