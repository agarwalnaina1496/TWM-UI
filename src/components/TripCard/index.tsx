import { TRIP_STATUS_LABELS } from '@/constants'
import { formatRelativeDate } from '@/utils/formatters'
import type { Trip } from '@/types'
import styles from './TripCard.module.css'

interface TripCardProps {
  trip: Trip
  onDelete?: (trip_id: string) => void
}

function TripCard({ trip, onDelete }: TripCardProps) {
  const statusLabel = TRIP_STATUS_LABELS[trip.status] ?? trip.status

  return (
    <div className={styles.card}>
      <span className={styles.icon} aria-hidden>📍</span>

      <div className={styles.body}>
        <p className={styles.title}>{trip.title}</p>
        <p className={styles.meta}>{statusLabel} · {formatRelativeDate(trip.updated_at)}</p>
      </div>

      {onDelete && (
        <button
          className={styles.deleteButton}
          onClick={() => onDelete(trip.trip_id)}
          aria-label={`Delete trip: ${trip.title}`}
          title="Delete trip"
        >
          ×
        </button>
      )}
    </div>
  )
}

export default TripCard
