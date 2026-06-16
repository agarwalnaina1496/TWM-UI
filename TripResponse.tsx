/**
 * TripResponse
 *
 * Renders the API response: a conversational message from the advisor
 * and a list of destination recommendation cards.
 *
 * Only shown after a successful submission.
 */

import type { TripMatcherResponse } from '@/types'
import styles from './TripResponse.module.css'

interface TripResponseProps {
  response: TripMatcherResponse
}

function TripResponse({ response }: TripResponseProps) {
  return (
    <div className={styles.wrapper} role="region" aria-label="Trip recommendations">
      {/* Advisor message */}
      <p className={styles.message}>{response.message}</p>

      {/* Recommendation cards */}
      {response.recommendations.length > 0 && (
        <div className={styles.cards}>
          {response.recommendations.map(rec => (
            <div key={rec.id} className={styles.card}>
              <span className={styles.cardIcon}>📍</span>
              <span className={styles.cardTitle}>{rec.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default TripResponse
