/**
 * useTripStorage
 *
 * Wraps the trip storage service with React state so components
 * re-render automatically when the trip list changes.
 *
 * This hook is the only place in the UI that knows about tripStorage.ts.
 */

import { useState, useCallback } from 'react'
import {
  getTrips,
  saveTrip,
  updateTrip,
  deleteTrip,
} from '@/services/storage/tripStorage'
import type { Trip, CreateTripPayload, UpdateTripPayload } from '@/types'

interface UseTripStorageResult {
  /** Current list of saved trips, newest first */
  trips: Trip[]
  /** Save a new trip and refresh the list */
  addTrip: (payload: CreateTripPayload) => Trip
  /** Update an existing trip and refresh the list */
  editTrip: (trip_id: string, updates: UpdateTripPayload) => void
  /** Delete a trip and refresh the list */
  removeTrip: (trip_id: string) => void
}

export function useTripStorage(): UseTripStorageResult {
  const [trips, setTrips] = useState<Trip[]>(() => getTrips())

  const refresh = useCallback(() => setTrips(getTrips()), [])

  const addTrip = useCallback((payload: CreateTripPayload): Trip => {
    const newTrip = saveTrip(payload)
    refresh()
    return newTrip
  }, [refresh])

  const editTrip = useCallback((trip_id: string, updates: UpdateTripPayload) => {
    updateTrip(trip_id, updates)
    refresh()
  }, [refresh])

  const removeTrip = useCallback((trip_id: string) => {
    deleteTrip(trip_id)
    refresh()
  }, [refresh])

  return { trips, addTrip, editTrip, removeTrip }
}
