/**
 * Trip data model — used for local storage persistence.
 *
 * This is the frontend's own representation of a saved trip.
 * It is separate from the API response types intentionally:
 * the backend may evolve its response shape without forcing a
 * change to what we store locally, and vice-versa.
 */

// ─── Core model ─────────────────────────────────────────────────────────────

export type TripStatus =
  | 'active'    // user is actively building this trip
  | 'draft'     // started but not yet submitted
  | 'matched'   // destination(s) selected
  | 'planned'   // itinerary finalised (future phase)
  | 'archived'  // no longer active

export interface Trip {
  /** Unique identifier — generated client-side via generateTripId() */
  trip_id: string
  /** Display name shown on the trip card */
  title: string
  /** Current lifecycle status */
  status: TripStatus
  /** ISO 8601 timestamp of last update */
  updated_at: string
  /**
   * The original free-text message the user submitted.
   * Stored so we can resume context in a future multi-turn flow.
   */
  last_message?: string
}

// ─── Derived helpers ─────────────────────────────────────────────────────────

/** Subset used when creating a new trip — id and updated_at are generated */
export type CreateTripPayload = Omit<Trip, 'trip_id' | 'updated_at'>

/** Subset accepted for partial updates */
export type UpdateTripPayload = Partial<Omit<Trip, 'trip_id'>>
