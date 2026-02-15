export function getQueueTimingDisplay(timestamp, referenceTime = new Date()) {
  const scheduledDate = new Date(timestamp)

  if (!Number.isFinite(scheduledDate.getTime())) {
    return {
      absolute: 'Invalid date',
      relative: 'Invalid schedule time',
      state: 'invalid'
    }
  }

  const now = referenceTime instanceof Date ? referenceTime : new Date(referenceTime)
  const deltaMs = scheduledDate.getTime() - now.getTime()
  const absDeltaMs = Math.abs(deltaMs)

  const minuteMs = 60 * 1000
  const hourMs = 60 * minuteMs
  const dayMs = 24 * hourMs

  const days = Math.floor(absDeltaMs / dayMs)
  const hours = Math.floor((absDeltaMs % dayMs) / hourMs)
  const minutes = Math.floor((absDeltaMs % hourMs) / minuteMs)

  const parts = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0 || days > 0) parts.push(`${hours}h`)
  parts.push(`${minutes}m`)

  let state = 'upcoming'
  let relative = ''

  if (absDeltaMs < minuteMs) {
    state = 'due-now'
    relative = 'due now'
  } else if (deltaMs < 0) {
    state = 'overdue'
    relative = `${parts.join(' ')} overdue`
  } else {
    state = 'upcoming'
    relative = `in ${parts.join(' ')}`
  }

  return {
    absolute: scheduledDate.toLocaleString(),
    relative,
    state
  }
}
