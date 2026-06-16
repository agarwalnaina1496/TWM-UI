/**
 * Home page — the single page of the MVP.
 *
 * Composes: Layout → hero headline → TripInput → TripResponse → TripList
 *
 * State machine:
 *   idle    → user hasn't submitted yet
 *   loading → API call in-flight
 *   success → response received, TripResponse shown
 *   error   → API call failed, error message shown
 */

import { useCallback } from 'react'
import Layout       from '@/components/Layout'
import TripInput    from '@/components/TripInput'
import TripResponse from '@/components/TripResponse'
import TripList     from '@/components/TripList'
import { useTripMatcher }  from '@/hooks/useTripMatcher'
import { useTripStorage }  from '@/hooks/useTripStorage'
import styles from './Home.module.css'

function Home() {
  const { isLoading, error, response, submit, reset } = useTripMatcher()
  const { addTrip } = useTripStorage()

  const handleSubmit = useCallback(async (message: string) => {
    await submit(message)
    // Trip is auto-saved after a successful response
    // (response state is set inside submit — we react via the hook)
  }, [submit])

  // Auto-save trip when we get a successful response
  // This runs whenever `response` changes from null → value
  const handleNewTrip = useCallback(() => {
    reset()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [reset])

  // Save trip to localStorage when response arrives
  useAutoSaveTrip({ response, addTrip })

  return (
    <Layout>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className={styles.hero}>
        <h1 className={styles.headline}>
          Tell me about the trip<br />
          <em>you're planning.</em>
        </h1>
        <p className={styles.subheadline}>
          Group, budget, vibe — the more you share, the better the match.
        </p>
      </section>

      {/* ── Input ────────────────────────────────────────────── */}
      <section className={styles.inputSection}>
        <TripInput onSubmit={handleSubmit} isLoading={isLoading} />
      </section>

      {/* ── Loading state ────────────────────────────────────── */}
      {isLoading && (
        <p className={styles.loadingText} aria-live="polite">
          Finding the right destinations for you…
        </p>
      )}

      {/* ── Error state ──────────────────────────────────────── */}
      {error && (
        <p className={styles.errorText} role="alert">
          {error}
        </p>
      )}

      {/* ── Response ─────────────────────────────────────────── */}
      {response && !isLoading && (
        <TripResponse response={response} />
      )}

      {/* ── Saved trips ──────────────────────────────────────── */}
      <TripList onNewTrip={response ? handleNewTrip : undefined} />
    </Layout>
  )
}

// ─── Side-effect: auto-save trip on successful response ───────────────────────

import { useEffect, useRef } from 'react'
import type { TripMatcherResponse } from '@/types'
import type { CreateTripPayload } from '@/types'

function useAutoSaveTrip({
  response,
  addTrip,
}: {
  response: TripMatcherResponse | null
  addTrip: (p: CreateTripPayload) => void
}) {
  const savedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!response) return

    // Use the first recommendation as the trip title, fallback to generic
    const title = response.recommendations[0]?.title
      ? `${response.recommendations[0].title} Trip`
      : 'New Trip'

    // Avoid saving the same response twice (e.g. in React Strict Mode)
    const key = JSON.stringify(response)
    if (savedRef.current === key) return
    savedRef.current = key

    addTrip({
      title,
      status: (response.trip_state.status as 'active') ?? 'active',
    })
  }, [response, addTrip])
}

export default Home
