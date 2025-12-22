import { useChat } from '../../contexts/ChatContext'
import { ChannelList } from './ChannelList'
import { MemberList } from './MemberList'
import './Sidebar.css'

export function Sidebar() {
  const { disconnect, currentJid } = useChat()

  return (
    <div className="chat-sidebar">
      <div className="sidebar-header">
        <span className="sidebar-brand">LANSCAPE</span>
        <button
          type="button"
          onClick={disconnect}
          className="sidebar-disconnect-btn"
          title="Disconnect"
        >
          ⚡
        </button>
      </div>
      <div className="sidebar-content">
        <ChannelList />
        <MemberList />
      </div>
      <div className="sidebar-footer">
        <div className="sidebar-user-info">
          <span className="sidebar-user-status"></span>
          <span className="sidebar-user-name">{currentJid.split('@')[0] || 'User'}</span>
        </div>
      </div>
    </div>
  )
}
