import type { StatusType } from '../types'

interface StatusMessageProps {
  type: StatusType
  message: string | null
}

export function StatusMessage({ type, message }: StatusMessageProps) {
  if (!message || !type) return null

  return (
    <div className={`status ${type}`}>
      {message}
    </div>
  )
}
