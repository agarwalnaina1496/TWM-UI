import { monthLabel, todayIso } from '../../lib/booking/dateLabels.js';

function monthDateBounds(monthValue) {
  if (!monthValue) return {};
  const [year, month] = monthValue.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return { min: `${monthValue}-01`, max: `${monthValue}-${String(lastDay).padStart(2, '0')}` };
}

// TWM-216/TWM-228: a standard OTA date field for one entity's booking search —
// a single exact-date input, pre-filled with the current effective date. No
// precision choice: precision is resolved upstream (trip dates / TWM-227). For
// a month-precision trip date the picker is constrained to that month so the
// traveller narrows it to a specific day. `existing` is the value currently on
// file — { precision, date } | { precision, month } | null.
export default function ScheduleDateForm({
  existing, dateLabel = 'Date', helper,
  value, setValue, onSubmit, onCancel, onClear,
  clearLabel = 'Reset to the default date', pending, error,
}) {
  const monthValue = existing?.precision === 'month' ? existing.month : null;
  const bounds = monthValue ? monthDateBounds(monthValue) : {};
  const min = bounds.min && bounds.min > todayIso() ? bounds.min : todayIso();

  return (
    <form className="confirmation-form" onSubmit={onSubmit}>
      <p className="already-booked-note">
        {helper || 'Adding a date improves booking search precision only — it does not change your itinerary plan.'}
      </p>
      {monthValue && <p className="already-booked-note">Pick a day in {monthLabel(monthValue)}.</p>}
      <label>{dateLabel}
        <input required type="date" value={value} disabled={pending}
          min={min} max={bounds.max}
          onChange={event => setValue(event.target.value)} />
      </label>
      {error && <p className="confirm-error" role="alert">{error}</p>}
      <div className="confirmation-form-actions">
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={onCancel}>Cancel</button>
        {onClear && (
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={onClear}>{clearLabel}</button>
        )}
        <button type="submit" className="btn btn-primary" disabled={pending || !value}>Save</button>
      </div>
    </form>
  );
}
