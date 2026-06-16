import { useState, type FormEvent, type KeyboardEvent, type ChangeEvent } from 'react'
import styles from './TripInput.module.css'

interface TripInputProps {
  onSubmit: (message: string) => void
  isLoading?: boolean
}

const PLACEHOLDER_EXAMPLES = [
  '3 girls from Bangalore. September. Budget around ₹30k. Want something scenic and relaxed.',
  '2 couples. December. Prefer beaches over mountains. Budget flexible.',
  'Solo trip. 5 days. Himalayas. Mid October.',
]

function TripInput({ onSubmit, isLoading = false }: TripInputProps) {
  const [message, setMessage] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = message.trim()
    if (!trimmed || isLoading) return
    onSubmit(trimmed)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      const trimmed = message.trim()
      if (trimmed && !isLoading) onSubmit(trimmed)
    }
  }

  const canSubmit = message.trim().length > 0 && !isLoading

  return (
    <div className={styles.wrapper}>
      <textarea
        className={styles.textarea}
        value={message}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={PLACEHOLDER_EXAMPLES[0]}
        rows={3}
        disabled={isLoading}
        aria-label="Describe the trip you're planning"
      />

      <div className={styles.footer}>
        <p className={styles.hint}>
          The more detail you give, the better the match.
        </p>
        <button
          className={styles.submitButton}
          onClick={handleSubmit}
          disabled={!canSubmit}
          aria-busy={isLoading}
        >
          {isLoading ? 'Finding trips…' : 'Find my trip →'}
        </button>
      </div>
    </div>
  )
}

export default TripInput
