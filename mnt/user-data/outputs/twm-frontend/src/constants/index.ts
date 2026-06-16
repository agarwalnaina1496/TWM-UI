/**
 * App-wide constants.
 *
 * API_BASE_URL and USE_MOCK are the two values a backend engineer
 * will touch when connecting the real API. See docs/BACKEND_INTEGRATION.md.
 */

/** Set to false to switch from mock to live API */
export const USE_MOCK = true

/** Real API base URL — only used when USE_MOCK = false */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

/** Endpoints */
export const API_ENDPOINTS = {
  TRIP_MATCHER: '/trip-matcher',
} as const

/** How long to simulate network delay in mock mode (ms) */
export const MOCK_DELAY_MS = 1200

/** Trip status labels for display */
export const TRIP_STATUS_LABELS: Record<string, string> = {
  active:   'In Progress',
  draft:    'Draft Saved',
  matched:  'Destination Selected',
  planned:  'Plan Ready',
  archived: 'Archived',
} as const

/** Local storage key for trips list */
export const STORAGE_KEY_TRIPS = 'twm:trips'
