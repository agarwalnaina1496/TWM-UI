/**
 * API type definitions.
 */

export interface TripMatcherRequest {
  message: string
}

export interface Recommendation {
  id: string
  title: string
}

export interface TripState { status: string }

export interface TripMatcherResponse {
  message: string
  trip_state: TripState
  recommendations: Recommendation[]
}

export interface ApiError { status: number; message: string }
