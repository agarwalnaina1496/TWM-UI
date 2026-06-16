import { STORAGE_KEY_TRIPS } from '@/constants'
import { generateTripId } from '@/utils/formatters'
import type { Trip, CreateTripPayload, UpdateTripPayload } from '@/types'

export function getTrips(): Trip[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TRIPS)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Trip[]
    return parsed.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  } catch { return [] }
}

export function getTripById(trip_id: string): Trip | null {
  return getTrips().find(t => t.trip_id === trip_id) ?? null
}

export function saveTrip(payload: CreateTripPayload): Trip {
  const trips = getTrips()
  const newTrip: Trip = { ...payload, trip_id: generateTripId(), updated_at: new Date().toISOString() }
  persist([newTrip, ...trips])
  return newTrip
}

export function updateTrip(trip_id: string, updates: UpdateTripPayload): void {
  const trips = getTrips()
  const index = trips.findIndex(t => t.trip_id === trip_id)
  if (index === -1) return
  trips[index] = { ...trips[index], ...updates, updated_at: new Date().toISOString() }
  persist(trips)
}

export function deleteTrip(trip_id: string): void { persist(getTrips().filter(t => t.trip_id !== trip_id)) }

function persist(trips: Trip[]): void { localStorage.setItem(STORAGE_KEY_TRIPS, JSON.stringify(trips)) }
