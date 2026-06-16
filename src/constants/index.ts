export const USE_MOCK = true
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export const API_ENDPOINTS = {
  TRIP_MATCHER: '/trip-matcher',
}

export const MOCK_DELAY_MS = 700

export const STORAGE_KEY_TRIPS = 'twm_trips_v1'

export const TRIP_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  draft: 'Draft',
  matched: 'Matched',
  planned: 'Planned',
  archived: 'Archived',
}
