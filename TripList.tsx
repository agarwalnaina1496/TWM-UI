/**
 * TripList
 *
 * The "Your Trips" section — renders a grid of TripCards and a
 * "+ New Trip" button. Reads directly from useTripStorage.
 *
 * Empty state is treated as an invitation to act, not a dead end.
 */

import TripCard from '@/components/TripCard'
import { useTripStorage } from '@/hooks/useTripStorage'
import styles from './TripList.module.css'

interface TripListProps {
  /** Called when the user clicks "+ New Trip" */
  onNewTrip?: () => void
}

function TripList({ onNewTrip }: TripListProps) {
  const { trips, removeTrip } = useTripStorage()

  return (
    <section className={styles.section} aria-label="Your saved trips">
      <header className={styles.header}>
        <h2 className={styles.heading}>Your Trips</h2>
        {onNewTrip && (
          <button className={styles.newTripButton} onClick={onNewTrip}>
            + New Trip
          </button>
        )}
      </header>

      {trips.length === 0 ? (
        <p className={styles.empty}>
          Your saved trips will appear here. Start by describing a trip above.
        </p>
      ) : (
        <div className={styles.grid}>
          {trips.map(trip => (
            // `key` is a React-reserved prop managed by @types/react.
            // The false-positive TS error resolves after `npm install`.
            <TripCard
              key={trip.trip_id}
              trip={trip}
              onDelete={removeTrip}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export default TripList
