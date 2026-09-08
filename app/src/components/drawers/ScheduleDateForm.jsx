import { useState } from 'react';

function monthDateBounds(monthValue) {
  if (!monthValue) return {};
  const [year, month] = monthValue.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return { min: `${monthValue}-01`, max: `${monthValue}-${String(lastDay).padStart(2, '0')}` };
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

// TWM-216: one exact-date-XOR-month form for a per-entity search-date
// preference. `existing` is the value currently on file for this entity —
// { precision, date } | { precision, month } | null.
export default function ScheduleDateForm({
  existing, dateLabel = 'Date', helper,
  mode, setMode, value, setValue, onSubmit, onCancel, onClear,
  clearLabel = 'Reset to the default date', pending, error,
}) {
  const [changingPrecision, setChangingPrecision] = useState(false);
  const hasStructuredMonth = existing?.precision === 'month';
  const knownMonthLabel = hasStructuredMonth ? existing.month : null;
  const hasExistingPrecision = Boolean(existing?.precision);
  const showModeChoice = !hasExistingPrecision || changingPrecision;
  const narrowingFromMonth = hasStructuredMonth && !changingPrecision && mode === 'exact';

  function switchPrecision(nextMode) {
    setChangingPrecision(true);
    setMode(nextMode);
    setValue('');
  }

  return (
    <form className="confirmation-form" onSubmit={onSubmit}>
      <p className="already-booked-note">
        {helper || 'Adding dates improves booking search precision only — it does not change your itinerary plan.'}
      </p>
      {showModeChoice ? (
        <div className="confirmation-form-actions" role="radiogroup" aria-label="Date precision">
          <label>
            <input type="radio" name="schedule-date-mode" checked={mode === 'exact'} disabled={pending}
              onChange={() => switchPrecision('exact')} /> I know the exact date
          </label>
          <label>
            <input type="radio" name="schedule-date-mode" checked={mode === 'month'} disabled={pending}
              onChange={() => switchPrecision('month')} /> I only know the month
          </label>
        </div>
      ) : (
        <p className="already-booked-note">
          {narrowingFromMonth ? `Narrowing down ${knownMonthLabel}. ` : ''}
          <button type="button" className="btn btn-ghost" disabled={pending}
            onClick={() => switchPrecision(mode === 'exact' ? 'month' : 'exact')}>
            {narrowingFromMonth ? 'Not in this month? Change month' : 'Change precision'}
          </button>
        </p>
      )}
      {mode === 'exact' ? (
        <label>{dateLabel}
          {(() => {
            const bounds = narrowingFromMonth && hasStructuredMonth ? monthDateBounds(existing.month) : {};
            const min = bounds.min && bounds.min > todayIsoDate() ? bounds.min : todayIsoDate();
            return (
              <input required type="date" value={value} disabled={pending}
                min={min} max={bounds.max}
                onChange={event => setValue(event.target.value)} />
            );
          })()}
        </label>
      ) : (
        <label>Month
          <input required type="month" value={value} disabled={pending} min={todayIsoDate().slice(0, 7)} onChange={event => setValue(event.target.value)} />
        </label>
      )}
      {error && <p className="confirm-error" role="alert">{error}</p>}
      <div className="confirmation-form-actions">
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={onCancel}>Cancel</button>
        {onClear && existing && (
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={onClear}>{clearLabel}</button>
        )}
        <button type="submit" className="btn btn-primary" disabled={pending || !value}>Save</button>
      </div>
    </form>
  );
}
