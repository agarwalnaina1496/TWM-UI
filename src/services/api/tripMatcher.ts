import {
  USE_MOCK,
  API_BASE_URL,
  API_ENDPOINTS,
  MOCK_DELAY_MS,
} from '@/constants'
import type { TripMatcherRequest, TripMatcherResponse, ApiError } from '@/types'

const MOCK_RESPONSE: TripMatcherResponse = {
  message:
    "Based on what you've told me, I think Coorg and Munnar would be a great fit. Both are scenic, relaxed, and very popular with groups from Bangalore in September.",
  trip_state: { status: 'active' },
  recommendations: [
    { id: 'coorg_karnataka', title: 'Coorg' },
    { id: 'munnar_kerala',   title: 'Munnar' },
  ],
}

export async function postTripMatcher(
  request: TripMatcherRequest
): Promise<TripMatcherResponse> {
  if (USE_MOCK) return mockPostTripMatcher(request)
  return realPostTripMatcher(request)
}

async function mockPostTripMatcher(_request: TripMatcherRequest): Promise<TripMatcherResponse> {
  await delay(MOCK_DELAY_MS)
  return MOCK_RESPONSE
}

async function realPostTripMatcher(request: TripMatcherRequest): Promise<TripMatcherResponse> {
  const url = `${API_BASE_URL}${API_ENDPOINTS.TRIP_MATCHER}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const error: ApiError = { status: response.status, message: `API error ${response.status}: ${response.statusText}` }
    throw error
  }

  return response.json() as Promise<TripMatcherResponse>
}

function delay(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)) }
