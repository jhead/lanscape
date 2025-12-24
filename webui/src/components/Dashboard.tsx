import { ChatProvider } from '../contexts/ChatContext'
import { ChatLayout } from './chat/ChatLayout'
import './Dashboard.css'

export function Dashboard() {
  return (
    <ChatProvider>
      <div className="dashboard-wrapper">
        <ChatLayout />
      </div>
    </ChatProvider>
  )
}
