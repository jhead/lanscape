import { useState } from 'react'

interface DeviceOnboardingModalProps {
  preauthKey: string
  headscaleEndpoint: string
  onClose: () => void
  onStatusChange: (message: string, type: 'info' | 'success' | 'error') => void
}

export function DeviceOnboardingModal({
  preauthKey,
  headscaleEndpoint,
  onClose,
  onStatusChange,
}: DeviceOnboardingModalProps) {
  const [copied, setCopied] = useState(false)

  // Build the tailscale command
  const tailscaleCommand = `tailscale up --login-server ${headscaleEndpoint} --reset --force-reauth --authkey ${preauthKey}`

  const copyCommand = () => {
    navigator.clipboard.writeText(tailscaleCommand)
    setCopied(true)
    onStatusChange('Command copied to clipboard', 'success')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Device Onboarding</h2>
        <div className="form-group">
          <label>Run this command on your device to connect:</label>
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'stretch',
              marginTop: '0.5rem',
            }}
          >
            <code
              style={{
                flex: 1,
                padding: '0.75rem',
                backgroundColor: '#27272a',
                border: '1px solid #3f3f46',
                borderRadius: '8px',
                fontSize: '0.875rem',
                wordBreak: 'break-all',
                fontFamily: 'monospace',
                color: '#e4e4e7',
                overflowX: 'auto',
              }}
            >
              {tailscaleCommand}
            </code>
            <button
              type="button"
              onClick={copyCommand}
              className="primary-btn"
              style={{
                whiteSpace: 'nowrap',
                minWidth: 'auto',
                padding: '0.75rem 1.5rem',
              }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
        <p
          style={{
            marginTop: '1rem',
            fontSize: '0.875rem',
            color: '#a1a1aa',
            lineHeight: '1.6',
          }}
        >
          This preauth key will expire in 24 hours.
        </p>
        <div className="button-group" style={{ marginTop: '1.5rem' }}>
          <button
            type="button"
            className="secondary-btn"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
