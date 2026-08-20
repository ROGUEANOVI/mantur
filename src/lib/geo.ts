// Manaure Balcón del Cesar municipality center — used as the map default
// center and as a fallback geo signal for entities without their own
// coordinates yet.
export const MANAURE_CENTER: [number, number] = [10.3912, -73.0272]

// Great-circle distance between two [lat, lng] points, in kilometers.
export function haversineDistanceKm(
  [lat1, lng1]: [number, number],
  [lat2, lng2]: [number, number],
): number {
  const EARTH_RADIUS_KM = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
