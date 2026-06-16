export type TripStatus = 'active' | 'draft' | 'matched' | 'planned' | 'archived'

export interface Trip {
  trip_id: string
  title: string
  status: TripStatus
  updated_at: string
  last_message?: string
}

export type CreateTripPayload = Omit<Trip, 'trip_id' | 'updated_at'>
export type UpdateTripPayload = Partial<Omit<Trip, 'trip_id'>>
