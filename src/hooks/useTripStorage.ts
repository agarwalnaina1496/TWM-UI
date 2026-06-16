import { useState, useCallback } from 'react'
import { getTrips, saveTrip, updateTrip, deleteTrip } from '@/services/storage/tripStorage'
import type { Trip, CreateTripPayload, UpdateTripPayload } from '@/types'

interface UseTripStorageResult { trips: Trip[]; addTrip: (payload: CreateTripPayload) => Trip; editTrip: (trip_id: string, updates: UpdateTripPayload) => void; removeTrip: (trip_id: string) => void }

export function useTripStorage(): UseTripStorageResult {
  const [trips, setTrips] = useState<Trip[]>(() => getTrips())

  const refresh = useCallback(() => setTrips(getTrips()), [])

  const addTrip = useCallback((payload: CreateTripPayload): Trip => { const newTrip = saveTrip(payload); refresh(); return newTrip }, [refresh])

  const editTrip = useCallback((trip_id: string, updates: UpdateTripPayload) => { updateTrip(trip_id, updates); refresh() }, [refresh])

  const removeTrip = useCallback((trip_id: string) => { deleteTrip(trip_id); refresh() }, [refresh])

  return { trips, addTrip, editTrip, removeTrip }
}
