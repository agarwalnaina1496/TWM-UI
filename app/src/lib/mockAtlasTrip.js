export const ATLAS_SCENARIO_ID = 'self_led_mp_year_end_couple_v1';

const deepFreeze = value => {
  Object.freeze(value);
  Object.values(value).forEach(child => {
    if (child && typeof child === 'object' && !Object.isFrozen(child)) deepFreeze(child);
  });
  return value;
};
const clone = value => JSON.parse(JSON.stringify(value));

const day = (number, base, title, items, costLow, costHigh) => ({
  number, base, title, cost_inr: { low: costLow, high: costHigh },
  items: items.map((item, index) => ({ id: `d${number}-${index + 1}`, status: 'suggested', flexibility: index === 0 ? 'anchor' : 'flexible', ...item })),
});

const INITIAL_DAYS = [
  day(1, 'Gwalior', 'Arrive gently', [{ time: 'Assumed morning', title: 'Delhi to Gwalior arrival', note: 'Timing unresolved until transport is confirmed.' }, { time: 'Afternoon', title: 'Jai Vilas Palace', note: 'Moveable if arrival is later.' }, { time: 'Evening', title: 'Check-in and relaxed local dinner' }], 2600, 3800),
  day(2, 'Gwalior', 'Fort and old city', [{ time: 'Morning', title: 'Gwalior Fort complex' }, { time: 'Afternoon', title: 'Old-city food and culture walk' }], 1800, 2600),
  day(3, 'Gwalior', 'Music history and recovery', [{ time: 'Morning', title: 'Tansen Tomb area' }, { time: 'Afternoon', title: 'Museum or flexible recovery time' }], 1200, 2200),
  day(4, 'Orchha', 'Transfer to Orchha', [{ time: 'Morning', title: 'Gwalior to Jhansi/Orchha transfer' }, { time: 'Evening', title: 'Betwa riverside wind-down' }], 3000, 4400),
  day(5, 'Orchha', 'Fort and living heritage', [{ time: 'Morning', title: 'Orchha Fort complex and Jahangir Mahal' }, { time: 'Evening', title: 'Ram Raja Temple' }], 1600, 2400),
  day(6, 'Orchha', 'Unhurried riverside day', [{ time: 'Morning', title: 'Cenotaphs and heritage walk' }, { time: 'Afternoon', title: 'Optional cycling or riverside downtime' }], 1400, 2400),
  day(7, 'Khajuraho', 'Easy transfer day', [{ time: 'Morning', title: 'Orchha to Khajuraho transfer' }, { time: 'Evening', title: 'Easy orientation walk' }], 2800, 4000),
  day(8, 'Khajuraho', 'Western temples', [{ time: 'Morning', title: 'Western Group of Temples' }, { time: 'Afternoon', title: 'Archaeological Museum' }], 1800, 2800),
  day(9, 'Khajuraho', 'Eastern and Jain heritage', [{ time: 'Morning', title: 'Eastern and Jain temple groups' }, { time: 'Evening', title: 'Local culture and relaxed dinner' }], 1600, 2600),
  day(10, 'Khajuraho', 'Nature excursion', [{ time: 'Morning', title: 'Raneh Falls excursion', note: 'Flexible local alternative if access or weather is unsuitable.' }, { time: 'Afternoon', title: 'Free recovery time' }], 2200, 3400),
  day(11, 'Panna', 'Move toward the reserve', [{ time: 'Morning', title: 'Khajuraho to Panna transfer' }, { time: 'Afternoon', title: 'Reserve-edge check-in and rest' }], 2400, 3600),
  day(12, 'Panna', 'Optional safari', [{ time: 'Morning', title: 'Optional Panna safari', note: 'Price and availability dependent; not booked.' }, { time: 'Afternoon', title: 'Recovery time' }], 3200, 6200),
  day(13, 'Panna', 'Flexible nature buffer', [{ time: 'Morning', title: 'Flexible Panna nature or local day' }, { time: 'Afternoon', title: 'Return-positioning buffer' }], 1600, 2600),
  day(14, 'Return', 'Journey toward Delhi', [{ time: 'Flexible', title: 'Return journey toward Delhi', note: 'Exact route depends on confirmed transport.' }], 3000, 5000),
];

export const TRAVEL_TIPS = [
  { icon: '📶', text: 'Network is patchy between Orchha and Khajuraho — download offline maps first.' },
  { icon: '💵', text: 'Carry cash — many local vendors and stays near Panna do not accept cards.' },
  { icon: '🧴', text: 'Pack sunscreen and a hat — December afternoons stay sunny at these forts.' },
  { icon: '🧥', text: 'Evenings turn cool (8–15°C) — a light jacket helps after sunset.' },
];

const COST_ITEMS = [
  { id: 'transport', label: 'Delhi return and circuit transport', low: 12000, high: 18000 },
  { id: 'stays', label: '13 nights in suggested areas', low: 25000, high: 32000 },
  { id: 'meals', label: 'Meals for two', low: 14000, high: 18000 },
  { id: 'activities', label: 'Activities and local movement', low: 9000, high: 14000 },
];

export function computeBudget(items = COST_ITEMS) {
  return items.reduce((total, item) => ({ low: total.low + item.low, high: total.high + item.high }), { low: 0, high: 0 });
}

export function createAtlasDashboardState(guideSnapshot = {}, tripContext = {}) {
  const version = deepFreeze({ id: 'atlas-v1', number: 1, status: 'CURRENT', created_from: `guide-revision-${guideSnapshot.approved_revision || 1}`, days: clone(INITIAL_DAYS) });
  return {
    scenario_id: ATLAS_SCENARIO_ID,
    mode: null,
    date_mode: guideSnapshot.start_date ? 'tentative_dates' : 'duration_only',
    start_date: guideSnapshot.start_date || null,
    assumptions: ['Arrival in Gwalior is assumed to be in the morning until transport is confirmed.', 'Suggested stay areas are planning anchors, not hotel reservations.', 'Panna safari is optional and depends on availability and price.'],
    unresolved: ['Delhi–Gwalior arrival time', 'Exact stays', 'Safari availability', 'Return transport to Delhi'],
    booking_readiness: 'PLAN_READY_BOOKINGS_OPEN',
    traveler_context: clone(guideSnapshot.traveler_context || tripContext || {}),
    cost_items: clone(COST_ITEMS),
    versions: [version],
    current_version_id: version.id,
    proposed_revision: null,
    transport: [
      { id: 'delhi-gwalior', route: 'Delhi → Gwalior', state: 'suggested', options: 'Direct train, flight search, bus or road', price: '₹2,000–₹6,000 for two', choices: [
        { mode: 'Train', name: 'Gatimaan Express 12050 / other direct trains', note: 'Hazrat Nizamuddin or New Delhi to Gwalior; verify date and seats.', url: 'https://www.irctc.co.in/nget/train-search' },
        { mode: 'Flight', name: 'Delhi to Gwalior flight search', note: 'Schedules vary by date; compare total airport-transfer time.', url: 'https://www.airindia.com/en-in/book-flights' },
        { mode: 'Bus', name: 'Delhi–Gwalior intercity bus search', note: 'Overnight and daytime inventory varies.', url: 'https://www.redbus.in/bus-tickets/delhi-to-gwalior' },
        { mode: 'Road', name: 'Private cab / self-drive route', note: 'Door-to-door fallback; materially costlier than train.', url: 'https://www.google.com/maps/dir/?api=1&origin=Delhi&destination=Gwalior' },
      ] },
      { id: 'gwalior-orchha', route: 'Gwalior → Orchha', state: 'suggested', options: 'Train via Jhansi, bus connection or road', price: '₹1,000–₹3,500 for two', choices: [
        { mode: 'Train + road', name: 'Gwalior to Jhansi train + taxi/auto to Orchha', note: 'Jhansi is the practical major rail gateway; Orchha is about 16–18 km onward.', url: 'https://www.irctc.co.in/nget/train-search' },
        { mode: 'Bus + road', name: 'Bus to Jhansi + local connection to Orchha', note: 'Check current state/private bus inventory.', url: 'https://www.onlineupsrtc.co.in/' },
        { mode: 'Road', name: 'Direct private cab to Orchha', note: 'Simplest luggage transfer for two.', url: 'https://www.google.com/maps/dir/?api=1&origin=Gwalior&destination=Orchha' },
      ] },
      { id: 'orchha-khajuraho', route: 'Orchha → Khajuraho', state: 'suggested', options: 'Train, bus or direct road', price: '₹1,500–₹4,500 for two', choices: [
        { mode: 'Train', name: 'Orchha/Jhansi to Khajuraho rail search', note: 'Availability and suitable timing must be checked for the travel date.', url: 'https://www.irctc.co.in/nget/train-search' },
        { mode: 'Bus', name: 'Jhansi/Orchha to Khajuraho bus search', note: 'Private and state inventory varies.', url: 'https://www.redbus.in/bus-tickets/jhansi-to-khajuraho' },
        { mode: 'Road', name: 'Direct private cab to Khajuraho', note: 'Most convenient direct circuit transfer.', url: 'https://www.google.com/maps/dir/?api=1&origin=Orchha&destination=Khajuraho' },
      ] },
      { id: 'khajuraho-panna', route: 'Khajuraho → Panna', state: 'suggested', options: 'Local bus or road transfer', price: '₹800–₹2,500 for two', choices: [
        { mode: 'Road', name: 'Private cab to Panna / Madla', note: 'Panna district lists Khajuraho as the nearest rail and air gateway.', url: 'https://www.google.com/maps/dir/?api=1&origin=Khajuraho&destination=Panna' },
        { mode: 'Bus', name: 'Local/private bus enquiry', note: 'Confirm current departure point and timing locally.', url: 'https://panna.nic.in/en/how-to-reach/' },
      ] },
      { id: 'return-delhi', route: 'Panna / Khajuraho → Delhi', state: 'suggested', options: 'Flight, train via Khajuraho/Satna, or road connection', price: '₹3,000–₹12,000 for two', choices: [
        { mode: 'Flight', name: 'Air India Khajuraho (HJR) to Delhi (DEL)', note: 'Daily winter-network service is scheduled from 25 October 2026; verify dates and fare.', url: 'https://www.airindia.com/en-in/book-flights/khajuraho-to-delhi-flights' },
        { mode: 'Train', name: 'Khajuraho or Satna to Delhi rail search', note: 'Panna has no railway station; compare Khajuraho (~40 km) and Satna (~75 km).', url: 'https://www.irctc.co.in/nget/train-search' },
        { mode: 'Road + onward', name: 'Road to Khajuraho airport/station', note: 'Required first leg when staying near Panna.', url: 'https://www.google.com/maps/dir/?api=1&origin=Panna&destination=Khajuraho' },
      ] },
    ],
    stays: [
      { id: 'gwalior-stay', base: 'Gwalior', nights: 3, area: 'Fort/old-city access', nightly: 'Check live rates', state: 'suggested', options: [
        { name: 'MPT Tansen Residency', fit: 'Value-oriented city base', url: 'https://www.mptourism.com/accomodation.php/destination-gwalior.php' },
        { name: 'Taj Usha Kiran Palace', fit: 'Heritage splurge; likely above the core stay budget', url: 'https://www.tajhotels.com/en-in/hotels/taj-usha-kiran-palace-gwalior' },
        { name: 'Gwalior district accommodation list', fit: 'Government-verified additional local options', url: 'https://gwalior.nic.in/en/where-to-stay/' },
      ] },
      { id: 'orchha-stay', base: 'Orchha', nights: 3, area: 'Fort and Betwa riverside', nightly: 'Check live rates', state: 'suggested', options: [
        { name: 'MPT Betwa Retreat / MPT Sheesh Mahal', fit: 'Official MP Tourism choices near the river/fort', url: 'https://www.mptourism.com/accomodation.php?destination=Orchha' },
        { name: 'Amar Mahal', fit: 'Heritage-style stay near the Betwa and monuments', url: 'https://www.amarmahal.com/' },
        { name: 'Bundelkhand Riverside', fit: 'Riverside heritage property', url: 'https://www.bundelkhandriverside.com/' },
      ] },
      { id: 'khajuraho-stay', base: 'Khajuraho', nights: 4, area: 'Western temples access area', nightly: 'Check live rates', state: 'suggested', options: [
        { name: 'The LaLiT Temple View Khajuraho', fit: 'Closest luxury temple-view option; budget trade-off', url: 'https://www.thelalit.com/the-lalit-khajuraho/' },
        { name: 'Radisson Hotel Jass Khajuraho', fit: 'Full-service hotel near the temple circuit', url: 'https://www.radissonhotels.com/en-us/hotels/radisson-khajuraho' },
        { name: 'MP Tourism Khajuraho accommodation', fit: 'Official local/value options including MPT properties', url: 'https://www.mptourism.com/accomodation.php?destination=Khajuraho' },
      ] },
      { id: 'panna-stay', base: 'Panna', nights: 3, area: 'Panna Tiger Reserve / Madla access', nightly: 'Check live rates', state: 'suggested', options: [
        { name: 'Ken River Lodge', fit: 'Established reserve-edge wildlife lodge', url: 'https://www.kenriverlodge.com/' },
        { name: 'Pashan Garh, a Taj Safari', fit: 'Premium wildlife lodge; major budget trade-off', url: 'https://www.tajhotels.com/en-in/hotels/pashan-garh-panna-national-park' },
        { name: 'Hotel Shanvi Landmark', fit: 'Panna town alternative', url: 'https://hotelshanvilandmarkpanna.com/' },
      ] },
    ],
    bookings: [],
    map_points: [
      { id: 'gwalior', label: 'Gwalior', lat: 26.2183, lng: 78.1828 },
      { id: 'orchha', label: 'Orchha', lat: 25.3519, lng: 78.6402 },
      { id: 'khajuraho', label: 'Khajuraho', lat: 24.8318, lng: 79.9199 },
      { id: 'panna', label: 'Panna', lat: 24.718, lng: 80.1819 },
    ],
  };
}

export const currentAtlasVersion = state => state.versions.find(version => version.id === state.current_version_id);

export function confirmArrival(state) {
  const next = clone(state);
  next.transport[0] = { ...next.transport[0], state: 'confirmed', confirmation: 'Arrival 2:00 PM · SAMPLE-DEL-GWL' };
  next.bookings.push({ id: 'booking-arrival', type: 'Transport', label: 'Delhi → Gwalior arrival', state: 'confirmed', detail: 'Arrives 2:00 PM · SAMPLE-DEL-GWL' });
  const current = currentAtlasVersion(next);
  const days = clone(current.days);
  days[0] = { ...days[0], title: 'Afternoon arrival and easy evening', items: [
    { id: 'd1-arrival', time: '2:00 PM', title: 'Confirmed arrival in Gwalior', status: 'confirmed', flexibility: 'locked', note: 'SAMPLE-DEL-GWL' },
    { id: 'd1-checkin', time: 'Afternoon', title: 'Check-in and rest', status: 'suggested', flexibility: 'flexible' },
    { id: 'd1-evening', time: 'Evening', title: 'Easy local dinner', status: 'suggested', flexibility: 'flexible' },
  ] };
  days[2] = { ...days[2], items: [...days[2].items, { id: 'd3-palace', time: 'Afternoon', title: 'Jai Vilas Palace', status: 'suggested', flexibility: 'flexible', note: 'Moved from Day 1 after confirmed arrival.' }] };
  const proposedNumber = current.number + 1;
  next.proposed_revision = deepFreeze({ id: `atlas-v${proposedNumber}-proposed`, number: proposedNumber, status: 'PROPOSED', reason: 'Confirmed 2:00 PM arrival conflicts with the assumed morning Day 1.', affected_days: [1, 3], changes: ['Day 1 becomes arrival, check-in and easy evening.', 'Jai Vilas Palace moves to Day 3.'], days });
  return next;
}

export function keepCurrentRevision(state) {
  return { ...clone(state), proposed_revision: null };
}

export function acceptProposedRevision(state) {
  if (!state.proposed_revision) return state;
  const next = clone(state);
  next.versions = next.versions.map(version => ({ ...version, status: 'HISTORICAL' }));
  const accepted = deepFreeze({ ...next.proposed_revision, id: `atlas-v${next.proposed_revision.number}`, status: 'CURRENT' });
  next.versions.push(accepted);
  next.current_version_id = accepted.id;
  next.proposed_revision = null;
  return next;
}

export function addUploadedBooking(state, type) {
  const next = clone(state);
  next.bookings.push({ id: `upload-${next.bookings.length + 1}`, type, label: `Uploaded ${type.toLowerCase()} confirmation`, state: 'needs_review', detail: 'Fixture upload · details not yet extracted' });
  return next;
}

export function adjustFlexibleItem(state, dayNumber, itemId) {
  const current = currentAtlasVersion(state);
  const dayIndex = current.days.findIndex(day => day.number === dayNumber);
  const itemIndex = dayIndex < 0 ? -1 : current.days[dayIndex].items.findIndex(item => item.id === itemId);
  if (itemIndex < 0 || current.days[dayIndex].items[itemIndex].flexibility === 'locked') return state;
  const next = clone(state);
  next.versions = next.versions.map(version => ({ ...version, status: 'HISTORICAL' }));
  const days = clone(current.days);
  days[dayIndex].items[itemIndex] = { ...days[dayIndex].items[itemIndex], title: `${days[dayIndex].items[itemIndex].title} · adjusted`, status: 'adjusted' };
  const number = current.number + 1;
  const revised = deepFreeze({ id: `atlas-v${number}`, number, status: 'CURRENT', created_from: current.id, reason: `Traveler adjusted flexible Day ${dayNumber} item.`, days });
  next.versions.push(revised);
  next.current_version_id = revised.id;
  return next;
}

export function confirmStay(state, stayId) {
  const next = clone(state);
  const index = next.stays.findIndex(stay => stay.id === stayId);
  if (index >= 0) {
    next.stays[index] = { ...next.stays[index], state: 'confirmed', confirmation: `SAMPLE-${stayId.toUpperCase()}` };
    next.bookings.push({ id: `booking-${stayId}`, type: 'Stay', label: `${next.stays[index].base} stay`, state: 'confirmed', detail: next.stays[index].confirmation });
  }
  return next;
}
