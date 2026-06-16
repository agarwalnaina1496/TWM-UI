export function formatRelativeDate(isoString: string): string {
  const date = new Date(isoString)
  const now  = new Date()

  const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()

  const isYesterday = (() => {
    const y = new Date(now)
    y.setDate(y.getDate() - 1)
    return date.getDate() === y.getDate() && date.getMonth() === y.getMonth() && date.getFullYear() === y.getFullYear()
  })()

  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  if (isToday) return `Today at ${timeStr}`
  if (isYesterday) return `Yesterday at ${timeStr}`

  return date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
}

export function generateTripId(): string { return `trip_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }

export function truncate(text: string, limit = 60): string { if (text.length <= limit) return text; return text.slice(0, limit).trimEnd() + '…' }
