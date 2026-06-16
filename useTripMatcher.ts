/**
 * useTripMatcher
 *
 * Wraps the POST /trip-matcher API call with UI-ready state.
 * Components call `submit(message)` and react to `{ isLoading, error, response }`.
 *
 * This hook is the only place in the UI that knows about the API service.
 */

import { useState, useCallback } from 'react'
import { postTripMatcher } from '@/services/api/tripMatcher'
import type { TripMatcherResponse, ApiError } from '@/types'

interface UseTripMatcherResult {
  /** True while the API call is in-flight */
  isLoading: boolean
  /** Error message if the call failed, null otherwise */
  error: string | null
  /** The API response, null before first successful call */
  response: TripMatcherResponse | null
  /** Send the user's message to the backend */
  submit: (message: string) => Promise<void>
  /** Reset state back to idle */
  reset: () => void
}

export function useTripMatcher(): UseTripMatcherResult {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [response, setResponse]   = useState<TripMatcherResponse | null>(null)

  const submit = useCallback(async (message: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const result = await postTripMatcher({ message })
      setResponse(result)
    } catch (err) {
      const apiErr = err as ApiError
      setError(apiErr.message ?? 'Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setIsLoading(false)
    setError(null)
    setResponse(null)
  }, [])

  return { isLoading, error, response, submit, reset }
}
