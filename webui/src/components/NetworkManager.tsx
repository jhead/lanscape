import { NetworkList } from './NetworkList'
import { Link } from 'react-router-dom'
import './NetworkManager.css'

export function NetworkManager() {
  return (
    <div className="network-manager">
      <div className="network-manager-header">
        <h1>LANSCAPE</h1>
        <nav className="network-manager-nav">
          <Link to="/chat" className="nav-link">
            Chat
          </Link>
          <Link to="/networks" className="nav-link active">
            Networks
          </Link>
        </nav>
      </div>
      <div className="network-manager-content">
        <NetworkList />
      </div>
    </div>
  )
}
