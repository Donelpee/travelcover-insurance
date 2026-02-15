export function getTripDurationMs(manifest, route) {
  const routeDurationMs = Number.isFinite(Number(route?.duration_hours))
    ? Number(route.duration_hours) * 3600000
    : null

  if (manifest?.trip_date && manifest?.departure_time && manifest?.arrival_time) {
    const tripStart = new Date(`${manifest.trip_date}T${manifest.departure_time}`)
    const tripEnd = new Date(`${manifest.trip_date}T${manifest.arrival_time}`)

    if (Number.isFinite(tripStart.getTime()) && Number.isFinite(tripEnd.getTime())) {
      let durationMs = tripEnd.getTime() - tripStart.getTime()
      if (durationMs <= 0) {
        durationMs += 24 * 3600000
      }
      if (durationMs > 0) {
        return durationMs
      }
    }
  }

  return routeDurationMs || 8 * 3600000
}
