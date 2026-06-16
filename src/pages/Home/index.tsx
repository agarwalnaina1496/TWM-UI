import { useCallback, useEffect, useRef } from 'react'
import Layout from '@/components/Layout'
import TripInput from '@/components/TripInput'
import TripResponse from '@/components/TripResponse'
import TripList from '@/components/TripList'
import { useTripMatcher } from '@/hooks/useTripMatcher'
import { useTripStorage } from '@/hooks/useTripStorage'
import styles from './Home.module.css'
import type { TripMatcherResponse } from '@/types'
import type { CreateTripPayload } from '@/types'

function Home() {
  const { isLoading, error, response, submit, reset } = useTripMatcher()
  const { addTrip } = useTripStorage()

  const handleSubmit = useCallback(async (message: string) => { await submit(message) }, [submit])

  const handleNewTrip = useCallback(() => { reset(); window.scrollTo({ top: 0, behavior: 'smooth' }) }, [reset])

  useAutoSaveTrip({ response, addTrip })

  return (
    <Layout>
      <section className={styles.hero}>
        <h1 className={styles.headline}>
          Tell me about the trip<br />
          <em>you're planning.</em>
        </h1>
        <p className={styles.subheadline}>
          Group, budget, vibe — the more you share, the better the match.
        </p>
      </section>

      <section className={styles.inputSection}>
        <TripInput onSubmit={handleSubmit} isLoading={isLoading} />
      </section>

      {isLoading && (
        <p className={styles.loadingText} aria-live="polite">Finding the right destinations for you…</p>
      )}

      {error && (
        <p className={styles.errorText} role="alert">{error}</p>
      )}

      {response && !isLoading && <TripResponse response={response} />}

      <TripList onNewTrip={response ? handleNewTrip : undefined} />
    </Layout>
  )
}

function useAutoSaveTrip({ response, addTrip }: { response: TripMatcherResponse | null; addTrip: (p: CreateTripPayload) => void }) {
  const savedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!response) return
    const title = response.recommendations[0]?.title ? `${response.recommendations[0].title} Trip` : 'New Trip'
    const key = JSON.stringify(response)
    if (savedRef.current === key) return
    savedRef.current = key
    addTrip({ title, status: (response.trip_state.status as 'active') ?? 'active' })
  }, [response, addTrip])
}

export default Home
