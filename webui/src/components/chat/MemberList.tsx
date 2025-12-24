import { useChat } from '../../contexts/ChatContext'
import './MemberList.css'

export function MemberList() {
  const { members } = useChat()

  return (
    <div className="member-list">
      <div className="member-list-header">
        <span className="member-list-title">Online — {members.length}</span>
      </div>
      <div className="member-list-items">
        {members.map((member) => (
          <div
            key={member.id}
            className={`member-list-item ${member.isSelf ? 'self' : ''}`}
          >
            <span className="member-status online"></span>
            <span className="member-name" title={member.id}>
              {member.name}
              {member.isSelf && ' (you)'}
            </span>
          </div>
        ))}
        {members.length === 0 && (
          <div className="member-list-empty">No members online</div>
        )}
      </div>
    </div>
  )
}

