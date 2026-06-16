import TripCard from '@/components/TripCard'
import { useTripStorage } from '@/hooks/useTripStorage'
import styles from './TripList.module.css'

interface TripListProps {
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
