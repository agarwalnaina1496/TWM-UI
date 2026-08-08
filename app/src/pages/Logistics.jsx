import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import { matchDestinationKey } from '../data/destinations.js';
import '../styles/preview.css';

// Curated fixture travel-mode + stay options — not a live search integration.
// Booking happens off-platform (affiliate-style outbound links); real
// price/availability data is parked for later (see TWM-92/97).
const LOGISTICS_SETS = {
  coorg: {
    modes: [
      { id: 'm1', mode: 'Flight', label: 'IndiGo 6E 204', tag: 'Nonstop · Economy', price: '₹6,200', detail: '6:40a–7:50a · BLR → Mangaluru, then 2.5h cab to Coorg', bookVia: 'Skyscanner', bookUrl: 'https://www.skyscanner.co.in' },
      { id: 'm2', mode: 'Train', label: 'KSR Bengaluru → Mysuru Express + cab', tag: 'Feasible, not fastest', price: '₹450', detail: '~3h to Mysuru, then 2h cab to Coorg — no direct rail line into Coorg', bookVia: 'IRCTC', bookUrl: 'https://www.irctc.co.in' },
      { id: 'm3', mode: 'Bus', label: 'KSRTC Bengaluru → Madikeri', tag: 'Budget-friendly', price: '₹650', detail: 'Overnight sleeper, ~6h direct to Madikeri', bookVia: 'KSRTC', bookUrl: 'https://ksrtc.karnataka.gov.in' },
      { id: 'm4', mode: 'Self-drive', label: 'Drive from Bengaluru', tag: 'Most flexible', price: '₹2,500 fuel (est.)', detail: '~5h via NH275, scenic route through Kushalnagar', bookVia: 'Route on Google Maps', bookUrl: 'https://maps.google.com' },
    ],
    hotels: [
      { id: 'h1', name: 'The Tamara Coorg', sub: 'Estate views · 9.1 guest rating', price: '₹9,800/night', bookVia: 'Booking.com' },
      { id: 'h2', name: 'Vivanta Coorg', sub: 'Pool & spa on-site · 8.8 guest rating', price: '₹12,400/night', bookVia: 'MakeMyTrip' },
    ],
  },
};
const DEFAULT_LOGISTICS_SET = {
  modes: [
    { id: 'm1', mode: 'Flight', label: 'Direct flight', tag: 'Nonstop · Economy', price: '₹6,500', detail: 'Nearest airport → destination', bookVia: 'Skyscanner', bookUrl: 'https://www.skyscanner.co.in' },
    { id: 'm2', mode: 'Train', label: 'Nearest rail link + cab', tag: 'Feasible', price: '₹500', detail: 'Check onward connectivity to destination', bookVia: 'IRCTC', bookUrl: 'https://www.irctc.co.in' },
    { id: 'm3', mode: 'Bus', label: 'State transport bus', tag: 'Budget-friendly', price: '₹600', detail: 'Direct or connecting service, check route', bookVia: 'RedBus', bookUrl: 'https://www.redbus.in' },
  ],
  hotels: [
    { id: 'h1', name: 'Well-rated central stay', sub: 'Guest favourite · central location', price: '₹8,500/night', bookVia: 'Booking.com' },
    { id: 'h2', name: 'Boutique alternative', sub: 'Smaller, quieter option', price: '₹11,000/night', bookVia: 'MakeMyTrip' },
  ],
};

function logisticsFor(destination) {
  const key = matchDestinationKey(destination);
  return LOGISTICS_SETS[key] || DEFAULT_LOGISTICS_SET;
}

function groupByMode(modes) {
  const groups = [];
  modes.forEach(m => {
    let g = groups.find(g => g.mode === m.mode);
    if (!g) { g = { mode: m.mode, options: [] }; groups.push(g); }
    g.options.push(m);
  });
  return groups;
}

export default function Logistics() {
  const navigate = useNavigate();
  const { trip, updateTrip } = useTrip();
  const set = logisticsFor(trip.destination || 'your destination');
  const modeGroups = groupByMode(set.modes);
  // Fields can arrive pre-filled from earlier in the flow, but results only ever show after an explicit search.
  const [searched, setSearched] = useState(false);
  const readyToProceed = trip.bookingUploaded || (searched && (!!trip.travelMode || !!trip.hotel));

  function search() {
    if (!trip.origin.trim() || !trip.departDate) return;
    if (trip.tripType === 'round' && !trip.returnDate) return;
    setSearched(true);
  }

  function pickMode(m) {
    updateTrip({ travelMode: m });
  }

  function pickHotel(h) {
    updateTrip({ hotel: h });
  }

  function simulateUpload() {
    updateTrip({ bookingUploaded: true });
  }

  const canSearch = !!trip.origin.trim() && !!trip.departDate && (trip.tripType === 'one-way' || !!trip.returnDate);

  return (
    <div className="wrap">
      <h1>Stays & travel for <em>{trip.destination || 'your trip'}</em></h1>
      <p className="lede">Every feasible way to get there, within budget — pick what works, or bring your own booking.</p>

      <div className="day-card">
        <div className="trip-type-toggle">
          <span className={`pace-opt ${trip.tripType === 'round' ? 'selected' : ''}`} onClick={() => { updateTrip({ tripType: 'round' }); setSearched(false); }}>Round trip</span>
          <span className={`pace-opt ${trip.tripType === 'one-way' ? 'selected' : ''}`} onClick={() => { updateTrip({ tripType: 'one-way' }); setSearched(false); }}>One way</span>
        </div>
        <div className="search-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 12 }}>
          <div>
            <div className="field-label">From</div>
            <input
              className="field-input"
              type="text"
              placeholder="e.g. Bengaluru"
              value={trip.origin}
              onChange={e => { updateTrip({ origin: e.target.value }); setSearched(false); }}
            />
          </div>
          <div>
            <div className="field-label">To</div>
            <div className="field-input" style={{ display: 'flex', alignItems: 'center', color: 'var(--ts)' }}>
              {trip.destination || 'Your destination'}
            </div>
          </div>
        </div>
        <div className="search-grid">
          <div>
            <div className="field-label">Departure</div>
            <input
              className="field-input"
              type="date"
              value={trip.departDate}
              onChange={e => { updateTrip({ departDate: e.target.value }); setSearched(false); }}
            />
          </div>
          {trip.tripType === 'round' && (
            <div>
              <div className="field-label">Return</div>
              <input
                className="field-input"
                type="date"
                value={trip.returnDate}
                onChange={e => { updateTrip({ returnDate: e.target.value }); setSearched(false); }}
              />
            </div>
          )}
          <div>
            <div className="field-label">Travelers</div>
            <div className="field-input" style={{ display: 'flex', alignItems: 'center', color: 'var(--ts)' }}>
              {trip.travelers} {trip.travelers === 1 ? 'traveler' : 'travelers'}
            </div>
          </div>
        </div>
        <span className={`btn btn-primary btn-full${canSearch ? '' : ' disabled'}`} style={{ marginTop: 14, opacity: canSearch ? 1 : 0.4, pointerEvents: canSearch ? 'auto' : 'none' }} onClick={search}>
          Search options →
        </span>
      </div>

      <div className="or-divider">or</div>

      <div className="day-card">
        <div className="day-card-title" style={{ marginBottom: 6 }}>Already booked this yourself?</div>
        <p className="lede" style={{ margin: '0 0 10px' }}>Upload your confirmation and we'll fold it into the itinerary — no re-entering details.</p>
        {trip.bookingUploaded ? (
          <p className="lede" style={{ color: 'var(--sage)', fontWeight: 600, margin: 0 }}>✓ Confirmation added</p>
        ) : (
          <span className="btn btn-ghost" onClick={simulateUpload}>Upload booking confirmation</span>
        )}
      </div>

      {!searched && (
        <p className="lede" style={{ marginTop: 8 }}>Enter your travel dates above and search to see flights, trains, buses, and stays.</p>
      )}

      {searched && (
        <>
          {modeGroups.map(g => (
            <div className="day-card" key={g.mode}>
              <div className="day-card-title" style={{ marginBottom: 12 }}>{g.mode}</div>
              <div className="booking-grid">
                {g.options.map(m => (
                  <div key={m.id} className={`booking-card ${trip.travelMode?.id === m.id ? 'picked' : ''}`} onClick={() => pickMode(m)}>
                    <div className="booking-top"><span>{m.label}</span><span>{m.price}</span></div>
                    <div className="booking-sub">{m.tag} · {m.detail}</div>
                    <a className="btn btn-ghost btn-full" href={m.bookUrl} target="_blank" rel="noopener noreferrer" onClick={e => { e.stopPropagation(); pickMode(m); }}>Book via {m.bookVia} ↗</a>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="day-card">
            <div className="day-card-title" style={{ marginBottom: 12 }}>Stay</div>
            <div className="booking-grid">
              {set.hotels.map(h => (
                <div key={h.id} className={`booking-card ${trip.hotel?.id === h.id ? 'picked' : ''}`} onClick={() => pickHotel(h)}>
                  <div className="booking-top"><span>{h.name}</span><span>{h.price}</span></div>
                  <div className="booking-sub">{h.sub}</div>
                  <a className="btn btn-ghost btn-full" href="https://www.booking.com" target="_blank" rel="noopener noreferrer" onClick={e => { e.stopPropagation(); pickHotel(h); }}>Book on {h.bookVia} ↗</a>
                </div>
              ))}
            </div>
          </div>

        </>
      )}

      <div style={{ textAlign: 'right', marginTop: 20 }}>
        {readyToProceed ? (
          <span className="btn btn-primary" onClick={() => navigate('/itinerary')}>See my detailed itinerary →</span>
        ) : (
          <span className="btn btn-primary" style={{ opacity: 0.4, pointerEvents: 'none' }}>
            {trip.bookingUploaded ? 'Pick a travel option' : 'Search or upload a booking to continue'}
          </span>
        )}
      </div>
    </div>
  );
}
