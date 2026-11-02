const minuteMs = 60_000
const hourMs = 60 * minuteMs
const dayMs = 24 * hourMs

// How long ago something happened, short enough for a table column.
export function formatAge(date: string, now = Date.now()) {
  const age = now - new Date(date).getTime()
  if (age < minuteMs) return 'Just now'
  if (age < hourMs) return `${Math.floor(age / minuteMs)} min ago`
  if (age < dayMs) return `${Math.floor(age / hourMs)} hr ago`
  return `${Math.floor(age / dayMs)} d ago`
}

// An open ticket older than this is marked in the list.
export function isOverdue(date: string, now = Date.now()) {
  return now - new Date(date).getTime() >= dayMs
}
