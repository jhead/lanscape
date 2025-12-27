import { NetworkList } from './NetworkList'
import './NetworkManager.css'

export function NetworkManager() {
  return (
    <div className="network-manager">
      <div className="network-manager-header">
        <h1>LANSCAPE</h1>
      </div>
      <div className="network-manager-content">
        <NetworkList />
      </div>
    </div>
  )
}
