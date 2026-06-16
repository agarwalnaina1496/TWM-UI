import { useState, useCallback } from 'react'
import { postTripMatcher } from '@/services/api/tripMatcher'
import type { TripMatcherResponse, ApiError } from '@/types'

interface UseTripMatcherResult { isLoading: boolean; error: string | null; response: TripMatcherResponse | null; submit: (message: string) => Promise<void>; reset: () => void }

export function useTripMatcher(): UseTripMatcherResult {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [response, setResponse] = useState<TripMatcherResponse | null>(null)

  const submit = useCallback(async (message: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await postTripMatcher({ message })
      setResponse(result)
    } catch (err) {
      const apiErr = err as ApiError
      setError(apiErr.message ?? 'Something went wrong. Please try again.')
    } finally { setIsLoading(false) }
  }, [])

  const reset = useCallback(() => { setIsLoading(false); setError(null); setResponse(null) }, [])

  return { isLoading, error, response, submit, reset }
}
