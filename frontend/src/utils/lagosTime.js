const LAGOS_OFFSET_HOURS = 1

function parseTimeParts(timeValue = '00:00') {
  const [hourRaw = '0', minuteRaw = '0', secondRaw = '0'] = String(timeValue).split(':')
  const hour = Number.parseInt(hourRaw, 10)
  const minute = Number.parseInt(minuteRaw, 10)
  const second = Number.parseInt(secondRaw, 10)

  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
    second: Number.isFinite(second) ? second : 0
  }
}

export function parseLagosDateTime(dateValue, timeValue = '00:00') {
  if (!dateValue) return null

  const [yearRaw, monthRaw, dayRaw] = String(dateValue).split('-')
  const year = Number.parseInt(yearRaw, 10)
  const month = Number.parseInt(monthRaw, 10)
  const day = Number.parseInt(dayRaw, 10)

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null
  }

  const { hour, minute, second } = parseTimeParts(timeValue)
  const utcMs = Date.UTC(year, month - 1, day, hour - LAGOS_OFFSET_HOURS, minute, second)
  const parsed = new Date(utcMs)

  return Number.isFinite(parsed.getTime()) ? parsed : null
}

export function formatTimeInLagos(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue)
  if (!Number.isFinite(date.getTime())) return ''

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(date)
}