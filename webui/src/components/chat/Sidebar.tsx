import { useState } from 'react'
import { Settings } from 'lucide-react'
import { useChat } from '../../contexts/ChatContext'
import { useNetwork } from '../../contexts/NetworkContext'
import { ChannelList } from './ChannelList'
import { MemberList } from './MemberList'
import { SettingsModal } from './SettingsModal'
import { NetworkManagerModal } from '../NetworkManagerModal'
import './Sidebar.css'

export function Sidebar() {
  const { displayName, selfId, isOnline } = useChat()
  const { currentNetwork } = useNetwork()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [networkManagerOpen, setNetworkManagerOpen] = useState(false)

  return (
    <div className="chat-sidebar">
      <div className="sidebar-header">
        <span className="sidebar-brand">LANSCAPE</span>
        <button 
          className="sidebar-settings-btn" 
          onClick={() => setSettingsOpen(true)}
          title="Settings"
        >
          <Settings size={18} />
        </button>
      </div>
      <div className="sidebar-network-section">
        <span className="sidebar-network-name" title={currentNetwork?.name || 'No network selected'}>
          {currentNetwork?.name || 'No network'}
        </span>
        <button
          className="sidebar-network-change-btn"
          onClick={() => setNetworkManagerOpen(true)}
          title="Change network"
        >
          switch net
        </button>
      </div>
      <div className="sidebar-content">
        <ChannelList />
        <MemberList />
      </div>
      <div className="sidebar-footer">
        <div className="sidebar-user-info">
          <span className={`sidebar-user-status ${isOnline ? 'online' : 'offline'}`}></span>
          <span className="sidebar-user-name" title={selfId || undefined}>
            {displayName || 'Anonymous'}
          </span>
          <span className="sidebar-connection-label">
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>
      
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <NetworkManagerModal isOpen={networkManagerOpen} onClose={() => setNetworkManagerOpen(false)} />
    </div>
  )
}
