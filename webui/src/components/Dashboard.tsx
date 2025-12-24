import { ChatProvider } from '../contexts/ChatContext'
import { ChatLayout } from './chat/ChatLayout'
import { Link } from 'react-router-dom'
import './Dashboard.css'

export function Dashboard() {
  return (
    <ChatProvider>
      <div className="dashboard-wrapper">
        <nav className="dashboard-nav">
          <Link to="/chat" className="nav-link active">
            Chat
          </Link>
          <Link to="/networks" className="nav-link">
            Networks
          </Link>
          <Link to="/webrtc-test" className="nav-link">
            WebRTC Test
          </Link>
        </nav>
        <ChatLayout />
      </div>
    </ChatProvider>
  )
}
