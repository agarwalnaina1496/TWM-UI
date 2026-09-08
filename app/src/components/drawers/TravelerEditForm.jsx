// TWM-213/TWM-216: the trip-wide structured party, edited from inside a
// booking drawer. TWM-220: also the home of the `set_party` open-gap prompt.
export default function TravelerEditForm({ adults, setAdults, children, setChildren, infants, setInfants, onSubmit, onCancel, pending, error, gapPrompt }) {
  return (
    <form className="confirmation-form" onSubmit={onSubmit}>
      <p className="already-booked-note">
        {gapPrompt || 'Exact traveler counts improve flight fare accuracy and stay/activity search — this does not change your itinerary plan.'}
      </p>
      <label>Adults
        <input required type="number" min={1} max={9} value={adults} disabled={pending}
          onChange={event => setAdults(Math.max(1, Number(event.target.value) || 1))} />
      </label>
      <label>Children
        <input type="number" min={0} max={8} value={children} disabled={pending}
          onChange={event => setChildren(Math.max(0, Number(event.target.value) || 0))} />
      </label>
      <label>Infants
        <input type="number" min={0} max={8} value={infants} disabled={pending}
          onChange={event => setInfants(Math.max(0, Number(event.target.value) || 0))} />
      </label>
      {error && <p className="confirm-error" role="alert">{error}</p>}
      <div className="confirmation-form-actions">
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={pending}>Save travelers</button>
      </div>
    </form>
  );
}
