import { useState } from 'react'
import { useChat } from '../../contexts/ChatContext'
import { ChannelList } from './ChannelList'
import { MemberList } from './MemberList'
import { SettingsModal } from './SettingsModal'
import './Sidebar.css'

export function Sidebar() {
  const { displayName, selfId, isOnline } = useChat()
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="chat-sidebar">
      <div className="sidebar-header">
        <span className="sidebar-brand">LANSCAPE</span>
        <button 
          className="sidebar-settings-btn" 
          onClick={() => setSettingsOpen(true)}
          title="Settings"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M14.69 7.09l.66-.38a1 1 0 00.37-1.36l-.75-1.3a1 1 0 00-1.37-.37l-.66.38a5.96 5.96 0 00-1.31-.76v-.76a1 1 0 00-1-1h-1.5a1 1 0 00-1 1v.76a5.96 5.96 0 00-1.31.76l-.66-.38a1 1 0 00-1.37.37l-.75 1.3a1 1 0 00.37 1.36l.66.38a5.97 5.97 0 000 1.52l-.66.38a1 1 0 00-.37 1.36l.75 1.3a1 1 0 001.37.37l.66-.38c.4.3.84.56 1.31.76v.76a1 1 0 001 1h1.5a1 1 0 001-1v-.76c.47-.2.91-.46 1.31-.76l.66.38a1 1 0 001.37-.37l.75-1.3a1 1 0 00-.37-1.36l-.66-.38a5.97 5.97 0 000-1.52z" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
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
    </div>
  )
}
