import { useState, useCallback } from 'react'
import { useChat } from '../../contexts/ChatContext'
import './SettingsModal.css'

type TabId = 'general' | 'devtools'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { clearHistory, persistenceReady } = useChat()
  const [activeTab, setActiveTab] = useState<TabId>('general')
  const [isClearing, setIsClearing] = useState(false)
  const [clearSuccess, setClearSuccess] = useState(false)

  const handleClearHistory = useCallback(async () => {
    if (isClearing) return
    
    const confirmed = window.confirm(
      'Are you sure you want to clear all local chat history? This cannot be undone.'
    )
    if (!confirmed) return

    setIsClearing(true)
    setClearSuccess(false)
    try {
      await clearHistory()
      setClearSuccess(true)
      console.log('[SettingsModal] History cleared successfully')
      setTimeout(() => setClearSuccess(false), 2000)
    } catch (error) {
      console.error('[SettingsModal] Failed to clear history:', error)
    } finally {
      setIsClearing(false)
    }
  }, [clearHistory, isClearing])

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }, [onClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }, [onClose])

  if (!isOpen) return null

  return (
    <div 
      className="settings-modal-backdrop" 
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div className="settings-modal">
        <div className="settings-header">
          <h2 className="settings-title">Settings</h2>
          <button className="settings-close-btn" onClick={onClose} title="Close">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4 4L14 14M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="settings-body">
          <nav className="settings-tabs">
            <button
              className={`settings-tab ${activeTab === 'general' ? 'active' : ''}`}
              onClick={() => setActiveTab('general')}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M13.5 8c0-.28-.03-.55-.08-.81l1.36-1.06a.5.5 0 00.12-.64l-1.29-2.23a.5.5 0 00-.6-.22l-1.6.65a5.98 5.98 0 00-1.4-.81l-.24-1.7a.5.5 0 00-.49-.43H6.72a.5.5 0 00-.5.42l-.24 1.7a5.98 5.98 0 00-1.4.82l-1.6-.65a.5.5 0 00-.6.22L1.1 5.49a.5.5 0 00.12.64l1.36 1.06A5.98 5.98 0 002.5 8c0 .28.03.55.08.81L1.22 9.87a.5.5 0 00-.12.64l1.29 2.23c.13.22.4.3.6.22l1.6-.65c.42.32.89.6 1.4.81l.24 1.7c.04.24.25.42.5.42h2.56a.5.5 0 00.5-.42l.24-1.7a5.98 5.98 0 001.4-.82l1.6.65c.22.08.47 0 .6-.22l1.29-2.23a.5.5 0 00-.12-.64l-1.36-1.06c.05-.26.08-.53.08-.81z" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
              General
            </button>
            <button
              className={`settings-tab ${activeTab === 'devtools' ? 'active' : ''}`}
              onClick={() => setActiveTab('devtools')}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M5.5 2L2 8l3.5 6M10.5 2L14 8l-3.5 6M9 2L7 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Dev Tools
            </button>
          </nav>

          <div className="settings-content">
            {activeTab === 'general' && (
              <div className="settings-panel">
                <div className="settings-section">
                  <h3 className="settings-section-title">Appearance</h3>
                  <p className="settings-section-desc">
                    Customize how Lanscape Chat looks and feels.
                  </p>
                  <div className="settings-placeholder">
                    <span className="placeholder-text">Coming soon...</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'devtools' && (
              <div className="settings-panel">
                <div className="settings-section">
                  <h3 className="settings-section-title">Local Storage</h3>
                  <p className="settings-section-desc">
                    Manage locally stored chat data in IndexedDB.
                  </p>
                  
                  <div className="settings-action-card">
                    <div className="action-card-content">
                      <div className="action-card-icon danger">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                          <path d="M4 6h12M6 6V4a2 2 0 012-2h4a2 2 0 012 2v2m2 0v10a2 2 0 01-2 2H6a2 2 0 01-2-2V6h12z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M8 10v5M12 10v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <div className="action-card-text">
                        <h4>Clear Chat History</h4>
                        <p>Delete all locally stored messages and channels. This cannot be undone.</p>
                      </div>
                    </div>
                    <button
                      className={`action-btn danger ${clearSuccess ? 'success' : ''}`}
                      onClick={handleClearHistory}
                      disabled={isClearing || !persistenceReady}
                    >
                      {isClearing ? (
                        <>
                          <span className="action-btn-spinner"></span>
                          Clearing...
                        </>
                      ) : clearSuccess ? (
                        <>
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Cleared!
                        </>
                      ) : (
                        'Clear History'
                      )}
                    </button>
                  </div>

                  <div className="settings-info">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M7 6v4M7 4h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <span>
                      {persistenceReady 
                        ? 'Local storage is connected and syncing.'
                        : 'Connecting to local storage...'
                      }
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

