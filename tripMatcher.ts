/**
 * Trip Matcher API service.
 *
 * Today:  returns a mock response after a simulated delay.
 * Future: makes a real POST to /trip-matcher.
 *
 * To switch to the real API:
 *   1. Set USE_MOCK = false in src/constants/index.ts
 *   2. Set VITE_API_BASE_URL in .env.local
 *
 * See: src/docs/BACKEND_INTEGRATION.md
 */

import {
  USE_MOCK,
  API_BASE_URL,
  API_ENDPOINTS,
  MOCK_DELAY_MS,
} from '@/constants'
import type { TripMatcherRequest, TripMatcherResponse, ApiError } from '@/types'

// ─── Mock data ───────────────────────────────────────────────────────────────

const MOCK_RESPONSE: TripMatcherResponse = {
  message:
    "Based on what you've told me, I think Coorg and Munnar would be a great fit. Both are scenic, relaxed, and very popular with groups from Bangalore in September.",
  trip_state: {
    status: 'active',
  },
  recommendations: [
    { id: 'coorg_karnataka', title: 'Coorg' },
    { id: 'munnar_kerala',   title: 'Munnar' },
  ],
}

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * Sends the user's trip description to the backend and returns recommendations.
 *
 * @throws {ApiError} on non-2xx HTTP response
 */
export async function postTripMatcher(
  request: TripMatcherRequest
): Promise<TripMatcherResponse> {
  if (USE_MOCK) {
    return mockPostTripMatcher(request)
  }
  return realPostTripMatcher(request)
}

// ─── Mock implementation ─────────────────────────────────────────────────────

async function mockPostTripMatcher(
  _request: TripMatcherRequest
): Promise<TripMatcherResponse> {
  await delay(MOCK_DELAY_MS)
  return MOCK_RESPONSE
}

// ─── Real implementation ─────────────────────────────────────────────────────

async function realPostTripMatcher(
  request: TripMatcherRequest
): Promise<TripMatcherResponse> {
  const url = `${API_BASE_URL}${API_ENDPOINTS.TRIP_MATCHER}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const error: ApiError = {
      status: response.status,
      message: `API error ${response.status}: ${response.statusText}`,
    }
    throw error
  }

  return response.json() as Promise<TripMatcherResponse>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
