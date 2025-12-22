import { useChat } from '../../contexts/ChatContext'
import './MemberList.css'

export function MemberList() {
  const { members, setCurrentConversation } = useChat()

  const handleMemberClick = (memberJid: string) => {
    setCurrentConversation(memberJid)
  }

  return (
    <div className="member-list">
      <div className="member-list-header">
        <span className="member-list-title">Members</span>
        <span className="member-list-count">{members.length}</span>
      </div>
      <div className="member-list-items">
        {members.length === 0 ? (
          <div className="member-list-empty">
            No other members online
          </div>
        ) : (
          members.map((member) => (
            <button
              key={member.jid}
              type="button"
              onClick={() => handleMemberClick(member.jid)}
              className="member-item"
            >
              <span className={`member-status-indicator ${member.presence}`}></span>
              <span className="member-name">{member.displayName}</span>
              {member.status && (
                <span className="member-status-text" title={member.status}>
                  {member.status}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  )
}
