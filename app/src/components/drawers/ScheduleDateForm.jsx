import { monthLabel, todayIso, nextDayIso, nightsBetween } from '../../lib/booking/dateLabels.js';

function monthDateBounds(monthValue) {
  if (!monthValue) return {};
  const [year, month] = monthValue.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return { min: `${monthValue}-01`, max: `${monthValue}-${String(lastDay).padStart(2, '0')}` };
}

const TRANSPORT_HINT = 'Adding a date improves booking search precision only — it does not change your itinerary plan.';

function stayHint(value, checkoutValue, itineraryNights) {
  const nights = nightsBetween(value, checkoutValue) || itineraryNights || '';
  const noun = nights === 1 ? 'night' : 'nights';
  return `${nights} ${noun} · matches your itinerary — move either date freely, it won't change your plan.`;
}

// TWM-216/TWM-228: a standard OTA date form for one entity's booking search.
// A stay shows two independent inputs — check-in and check-out — that the
// traveller moves freely; the itinerary night count is passive context.
// Transport shows the single leg-date input. No precision choice: precision is
// resolved upstream (trip dates / TWM-227). For a month-precision trip date the
// check-in picker is constrained to that month. `existing` is the value on
// file — { precision, date } | { precision, month } | null.
export default function ScheduleDateForm({
  existing, dateLabel = 'Date', helper,
  value, setValue, onSubmit, onCancel, onClear,
  clearLabel = 'Reset to itinerary', pending, error,
  showCheckout = false, checkoutValue = '', setCheckoutValue, itineraryNights,
}) {
  const monthValue = existing?.precision === 'month' ? existing.month : null;
  const bounds = monthValue ? monthDateBounds(monthValue) : {};
  const min = bounds.min && bounds.min > todayIso() ? bounds.min : todayIso();
  const checkoutMin = value ? nextDayIso(value) : min;
  const checkoutValid = !showCheckout || (Boolean(checkoutValue) && checkoutValue > value);
  const hint = helper || (showCheckout ? stayHint(value, checkoutValue, itineraryNights) : TRANSPORT_HINT);

  return (
    <form className="confirmation-form booking-date-form" onSubmit={onSubmit}>
      {monthValue && <p className="booking-form-hint">Pick a day in {monthLabel(monthValue)}.</p>}
      <div className={showCheckout ? 'booking-date-grid' : undefined}>
        <label>{showCheckout ? 'Check-in' : dateLabel}
          <input required type="date" value={value} disabled={pending}
            min={min} max={bounds.max}
            onChange={event => setValue(event.target.value)} />
        </label>
        {showCheckout && (
          <label>Check-out
            <input required type="date" value={checkoutValue} disabled={pending}
              min={checkoutMin}
              onChange={event => setCheckoutValue(event.target.value)} />
          </label>
        )}
      </div>
      <p className="booking-form-hint">{hint}</p>
      {error && <p className="confirm-error" role="alert">{error}</p>}
      <div className="confirmation-form-actions">
        <button type="submit" className="btn btn-primary" disabled={pending || !value || !checkoutValid}>
          {showCheckout ? 'Save dates' : 'Save'}
        </button>
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={onCancel}>Cancel</button>
        {onClear && (
          <button type="button" className="btn btn-ghost booking-form-reset" disabled={pending} onClick={onClear}>{clearLabel}</button>
        )}
      </div>
    </form>
  );
}
