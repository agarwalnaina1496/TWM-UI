/**
 * API type definitions.
 *
 * These types mirror the backend contract for POST /trip-matcher.
 * If the backend response shape changes, update here — nowhere else.
 *
 * See: src/docs/BACKEND_INTEGRATION.md
 */

// ─── Request ────────────────────────────────────────────────────────────────

export interface TripMatcherRequest {
  /** The user's free-text description of the trip they want */
  message: string
}

// ─── Response ───────────────────────────────────────────────────────────────

export interface Recommendation {
  /** Stable identifier for this destination (e.g. "coorg_karnataka") */
  id: string
  /** Human-readable destination name (e.g. "Coorg") */
  title: string
}

export interface TripState {
  /**
   * Lifecycle status of the trip from the backend's perspective.
   * Values: "active" | "draft" | "matched" | "planned"
   */
  status: string
}

export interface TripMatcherResponse {
  /** Conversational message from the AI advisor */
  message: string
  /** Backend's view of where this trip is in its lifecycle */
  trip_state: TripState
  /** Ordered list of destination recommendations */
  recommendations: Recommendation[]
}

// ─── Error ──────────────────────────────────────────────────────────────────

export interface ApiError {
  /** HTTP status code */
  status: number
  /** Human-readable error message */
  message: string
}
