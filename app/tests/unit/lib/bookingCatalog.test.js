import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  transportOptionsFor, feasibleTransportOptions, transportLegs,
  stayLegs, stayOptionsFor, activityBookings, notBookedYetLabel, modeLabel, recommendedMode,
  fetchLegFeasibility, MODES, normalizeTravelerCount,
} from '../../../src/lib/bookingCatalog.js';

function flightSearchResponse(overrides = {}) {
  return {
    status: 'clarification_needed',
    queried_at: '2026-01-01T00:00:00.000Z',
    clarification: { missing_fields: ['origin', 'destination'], message: 'Tell us your route.' },
    ...overrides,
  };
}

function jsonResponse(body, { status = 200 } = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function resolvedAction({ url = 'https://www.ixigo.com/search?domain=flight', affiliate = true, internalCapability = null } = {}) {
  return {
    status: 'resolved',
    generated_at: '2026-01-01T00:00:00.000Z',
    action: {
      action_type: internalCapability ? 'CHECK_PRICES' : 'SEARCH_REDIRECT',
      domain: 'flight',
      target: internalCapability ? null : { partner: 'ixigo', path: 'search', query_params: {}, target_url: url },
      internal_capability: internalCapability,
      affiliate_disclosure: affiliate,
      generated_at: '2026-01-01T00:00:00.000Z',
    },
  };
}

// TWM-195 root-fix: transportOptionsFor/feasibleTransportOptions now take
// an explicit `approvedModes` list (Backend's TripFeasibilityAssessment.modes)
// instead of unconditionally resolving the hardcoded MODES constant —
// every fetch mock below stands in for the trusted-action/flight-search
// endpoints only, never feasibility (tests pass approvedModes directly).
beforeEach(() => {
  global.fetch = vi.fn(async url => {
    if (url.includes('/trusted-action')) return jsonResponse(resolvedAction());
    if (url.includes('/flight-search')) return jsonResponse(flightSearchResponse());
    return jsonResponse({});
  });
});

// TWM-200: transportLegs now reads only structured, canonical
// `from_city`/`to_city` off TRAVEL timeline items — never `location` or
// `display_label`, which may carry road/landmark/"via" narration.
function travelDay(dayNumber, fromCity, toCity, { date = null, displayLabel = null } = {}) {
  return {
    day_number: dayNumber,
    date,
    primary_location: toCity,
    timeline: [
      { kind: 'TRAVEL', from_city: fromCity, to_city: toCity, display_label: displayLabel, location: displayLabel || `${fromCity} to ${toCity}` },
    ],
  };
}

describe('transportLegs', () => {
  it('builds legs from structured from_city/to_city on TRAVEL items only, never day-to-day primary_location grouping', () => {
    const days = [
      travelDay(1, 'Delhi', 'Gwalior'),
      { day_number: 2, primary_location: 'Gwalior', timeline: [{ kind: 'ACTIVITY', title: 'Fort visit' }] },
      travelDay(3, 'Gwalior', 'Orchha'),
    ];
    const legs = transportLegs(days);
    expect(legs).toEqual([
      { id: 'leg-0', from: 'Delhi', to: 'Gwalior', departureDate: null },
      { id: 'leg-1', from: 'Gwalior', to: 'Orchha', departureDate: null },
    ]);
  });

  it('never synthesizes an origin<->destination bookend leg — Atlas/Backend owns route meaning, UI must not infer one (TWM-200 review finding)', () => {
    const days = [travelDay(1, 'Gwalior', 'Orchha')];
    const legs = transportLegs(days);
    expect(legs).toEqual([{ id: 'leg-0', from: 'Gwalior', to: 'Orchha', departureDate: null }]);
  });

  it('drops a TRAVEL movement missing a structured endpoint instead of parsing display_label/location (TWM-200)', () => {
    const days = [
      travelDay(1, 'Bhubaneswar', 'Puri'),
      {
        day_number: 2,
        primary_location: 'Konark',
        timeline: [
          {
            kind: 'TRAVEL',
            from_city: null,
            to_city: null,
            display_label: 'Drive along Marine Drive from Puri to Konark',
            location: 'Marine Drive, Puri to Konark',
          },
        ],
      },
      travelDay(3, 'Konark', 'Bhubaneswar'),
    ];
    const legs = transportLegs(days);
    expect(legs).toEqual([
      { id: 'leg-0', from: 'Bhubaneswar', to: 'Puri', departureDate: null },
      { id: 'leg-1', from: 'Konark', to: 'Bhubaneswar', departureDate: null },
    ]);
    expect(legs.some(leg => leg.from === 'Puri' && leg.to === 'Konark')).toBe(false);
  });

  it('is empty for no days', () => {
    expect(transportLegs([])).toEqual([]);
  });

  it('is empty when no TRAVEL item carries a structured endpoint', () => {
    const days = [{ day_number: 1, primary_location: 'Goa', timeline: [{ kind: 'ACTIVITY', title: 'Beach' }] }];
    expect(transportLegs(days)).toEqual([]);
  });

  it('threads through a real Atlas day.date when present, never fabricating one', () => {
    const days = [
      travelDay(1, 'Delhi', 'Gwalior', { date: '2026-03-01' }),
      travelDay(2, 'Gwalior', 'Orchha', { date: '2026-03-02' }),
    ];
    const legs = transportLegs(days);
    expect(legs[0].departureDate).toBe('2026-03-01');
    expect(legs[1].departureDate).toBe('2026-03-02');
  });

  it('regression: Odisha five-leg route resolves entirely from canonical endpoints, never the scenic display_label (TWM-200)', () => {
    const days = [
      travelDay(1, 'Bangalore', 'Bhubaneswar'),
      travelDay(2, 'Bhubaneswar', 'Puri', { displayLabel: 'Bhubaneswar to Puri Highway' }),
      travelDay(3, 'Puri', 'Konark', { displayLabel: 'Drive along Marine Drive from Puri to Konark' }),
      travelDay(4, 'Konark', 'Bhubaneswar', { displayLabel: 'Konark to Bhubaneswar (via Pipili)' }),
      travelDay(5, 'Bhubaneswar', 'Bangalore'),
    ];
    const legs = transportLegs(days);
    expect(legs.map(({ from, to }) => ({ from, to }))).toEqual([
      { from: 'Bangalore', to: 'Bhubaneswar' },
      { from: 'Bhubaneswar', to: 'Puri' },
      { from: 'Puri', to: 'Konark' },
      { from: 'Konark', to: 'Bhubaneswar' },
      { from: 'Bhubaneswar', to: 'Bangalore' },
    ]);
  });
});

describe('transportOptionsFor', () => {
  const leg = { from: 'Delhi', to: 'Gwalior' };

  it('resolves a trusted action only for the explicitly approved modes, keyed by mode', async () => {
    const options = await transportOptionsFor('trip-1', leg, undefined, ['flight', 'train', 'bus', 'drive']);
    expect(options.map(o => o.mode)).toEqual(['flight', 'train', 'bus', 'drive']);
    expect(options.find(o => o.mode === 'flight')).toMatchObject({ status: 'resolved', url: 'https://www.ixigo.com/search?domain=flight', affiliateDisclosure: true });
  });

  it('resolves only the given subset of modes, never the full MODES constant', async () => {
    const options = await transportOptionsFor('trip-1', leg, undefined, ['train', 'bus']);
    expect(options.map(o => o.mode).sort()).toEqual(['bus', 'train']);
  });

  it('resolves nothing and makes no network call when approvedModes is empty', async () => {
    const options = await transportOptionsFor('trip-1', leg, undefined, []);
    expect(options).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('resolves nothing when approvedModes is omitted (never falls back to MODES)', async () => {
    const options = await transportOptionsFor('trip-1', leg);
    expect(options).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('drive has no trusted-action domain — feasibility-only, no network call, no CTA', async () => {
    const options = await transportOptionsFor('trip-1', leg, undefined, ['drive']);
    expect(options.find(o => o.mode === 'drive')).toMatchObject({ status: 'no_action' });
  });

  it('maps each of the four non-resolved statuses onto option.status safely', async () => {
    global.fetch = vi.fn(async () =>
      jsonResponse({ status: 'missing_input', generated_at: '2026-01-01T00:00:00.000Z', missing_input: { missing_fields: ['origin'], message: 'x' } })
    );
    const options = await transportOptionsFor('trip-1', leg, undefined, ['flight']);
    expect(options.find(o => o.mode === 'flight')).toMatchObject({ status: 'missing_input' });
  });

  it('surfaces a network failure as a status: error option instead of throwing', async () => {
    global.fetch = vi.fn(async () => { throw new Error('network down'); });
    const options = await transportOptionsFor('trip-1', leg, undefined, ['flight']);
    expect(options.find(o => o.mode === 'flight')).toMatchObject({ status: 'error' });
  });

  it('MODES remains exported only as a label/ordering helper, unrelated to what gets resolved', () => {
    expect(MODES).toEqual(['flight', 'train', 'bus', 'drive']);
  });
});

describe('normalizeTravelerCount', () => {
  it('normalizes a numeric string like "2" to the number 2', () => {
    expect(normalizeTravelerCount('2')).toBe(2);
  });

  it('passes a real number through unchanged', () => {
    expect(normalizeTravelerCount(4)).toBe(4);
  });

  it('returns null for missing, non-numeric, zero, or negative values — never NaN or 0', () => {
    expect(normalizeTravelerCount(null)).toBeNull();
    expect(normalizeTravelerCount(undefined)).toBeNull();
    expect(normalizeTravelerCount('Just me')).toBeNull();
    expect(normalizeTravelerCount(0)).toBeNull();
    expect(normalizeTravelerCount(-1)).toBeNull();
  });
});

describe('traveler_count on trusted-action transport CTA payloads (TWM-195 review comment)', () => {
  const leg = { from: 'Delhi', to: 'Gwalior' };

  it('includes traveler_count on train/bus trusted-action payloads when a normalized count is known', async () => {
    let capturedBodies = [];
    global.fetch = vi.fn(async (url, options) => {
      if (url.includes('/trusted-action')) { capturedBodies.push(JSON.parse(options.body)); return jsonResponse(resolvedAction()); }
      return jsonResponse({});
    });
    await transportOptionsFor('trip-1', leg, 2, ['train', 'bus']);
    expect(capturedBodies).toHaveLength(2);
    expect(capturedBodies.every(body => body.traveler_count === 2)).toBe(true);
  });

  it('omits traveler_count entirely when it cannot be determined', async () => {
    let capturedBody = null;
    global.fetch = vi.fn(async (url, options) => {
      if (url.includes('/trusted-action')) { capturedBody = JSON.parse(options.body); return jsonResponse(resolvedAction()); }
      return jsonResponse({});
    });
    await transportOptionsFor('trip-1', leg, undefined, ['train']);
    expect(capturedBody).not.toHaveProperty('traveler_count');
  });

  it('includes traveler_count on the flight trusted-action CTA payload, separate from flight-search\'s own travelers shape', async () => {
    let ctaBody = null;
    let flightSearchBody = null;
    global.fetch = vi.fn(async (url, options) => {
      if (url.includes('/trusted-action')) { ctaBody = JSON.parse(options.body); return jsonResponse(resolvedAction()); }
      if (url.includes('/flight-search')) { flightSearchBody = JSON.parse(options.body); return jsonResponse(flightSearchResponse()); }
      return jsonResponse({});
    });
    await transportOptionsFor('trip-1', leg, 3, ['flight']);
    expect(ctaBody).toMatchObject({ traveler_count: 3 });
    expect(flightSearchBody).toMatchObject({ travelers: { adults: 3 } });
  });

  it('drive never calls trusted-action at all, so it never carries traveler_count', async () => {
    let called = false;
    global.fetch = vi.fn(async (url) => { if (url.includes('/trusted-action')) called = true; return jsonResponse({}); });
    await transportOptionsFor('trip-1', leg, 2, ['drive']);
    expect(called).toBe(false);
  });
});

describe('flight live-offer resolution (TWM-146)', () => {
  const leg = { from: 'Delhi', to: 'Gwalior', departureDate: '2026-03-01' };

  function withFlightSearch(response) {
    global.fetch = vi.fn(async url => {
      if (url.includes('/trusted-action')) return jsonResponse(resolvedAction());
      if (url.includes('/flight-search')) return jsonResponse(response);
      return jsonResponse({});
    });
  }

  it('still resolves the trusted-action CTA for flight (url/affiliateDisclosure unchanged)', async () => {
    withFlightSearch(flightSearchResponse());
    const options = await transportOptionsFor('trip-1', leg, 2, ['flight']);
    const flight = options.find(o => o.mode === 'flight');
    expect(flight).toMatchObject({ status: 'resolved', url: 'https://www.ixigo.com/search?domain=flight', affiliateDisclosure: true });
  });

  it('maps status: offer to the recommended (is_recommended) offer as the primary liveOffer', async () => {
    withFlightSearch(flightSearchResponse({
      status: 'offer',
      offers: [
        { origin_iata: 'DEL', destination_iata: 'GWL', trip_type: 'one_way', departure_date: '2026-03-01', money: { currency: 'INR', per_traveler_amount_minor_units: 500000, traveler_count: 2, group_total_minor_units: 1000000, group_total_is_approximate: true }, baggage: {}, fare_conditions: {}, provenance: { provider_name: 'aviasales', provider_reference: 'x' }, price_found_at: '2026-01-01T00:00:00.000Z', is_recommended: false, airline_code: '6E' },
        { origin_iata: 'DEL', destination_iata: 'GWL', trip_type: 'one_way', departure_date: '2026-03-01', money: { currency: 'INR', per_traveler_amount_minor_units: 400000, traveler_count: 2, group_total_minor_units: 800000, group_total_is_approximate: true }, baggage: {}, fare_conditions: {}, provenance: { provider_name: 'aviasales', provider_reference: 'y' }, price_found_at: '2026-01-01T00:00:00.000Z', is_recommended: true, airline_name: 'IndiGo', stop_count: 0 },
      ],
    }));
    const options = await transportOptionsFor('trip-1', leg, 2, ['flight']);
    const flight = options.find(o => o.mode === 'flight');
    expect(flight.liveOffer).toMatchObject({ status: 'offer', priceLabel: 'approx. INR 8,000.00', airline: 'IndiGo', stopCount: 0 });
  });

  it('falls back to the first offer when none is flagged is_recommended (defensive, should not happen per contract)', async () => {
    withFlightSearch(flightSearchResponse({
      status: 'partial',
      offers: [
        { origin_iata: 'DEL', destination_iata: 'GWL', trip_type: 'one_way', departure_date: '2026-03-01', money: { currency: 'INR', per_traveler_amount_minor_units: 500000, traveler_count: 1, group_total_minor_units: 500000, group_total_is_approximate: true }, baggage: {}, fare_conditions: {}, provenance: { provider_name: 'aviasales', provider_reference: 'x' }, price_found_at: '2026-01-01T00:00:00.000Z', is_recommended: false, airline_code: '6E' },
      ],
    }));
    const options = await transportOptionsFor('trip-1', leg, 1, ['flight']);
    const flight = options.find(o => o.mode === 'flight');
    expect(flight.liveOffer).toMatchObject({ status: 'partial', airline: '6E' });
  });

  it('renders a specific missing-field prompt for clarification_needed, not a generic error', async () => {
    withFlightSearch(flightSearchResponse({ status: 'clarification_needed', clarification: { missing_fields: ['departure_date'], message: 'We need your exact departure date.' } }));
    const options = await transportOptionsFor('trip-1', leg, 2, ['flight']);
    expect(options.find(o => o.mode === 'flight').liveOffer).toMatchObject({ status: 'clarification_needed', message: 'We need your exact departure date.' });
  });

  it('renders the Backend-authored unavailable.message safely', async () => {
    withFlightSearch(flightSearchResponse({ status: 'unavailable', clarification: undefined, unavailable: { code: 'provider_timeout', message: 'The flight provider timed out.' } }));
    const options = await transportOptionsFor('trip-1', leg, 2, ['flight']);
    expect(options.find(o => o.mode === 'flight').liveOffer).toMatchObject({ status: 'unavailable', message: 'The flight provider timed out.' });
  });

  it('renders expired/failed statuses safely with no raw data', async () => {
    withFlightSearch(flightSearchResponse({ status: 'expired', clarification: undefined }));
    let options = await transportOptionsFor('trip-1', leg, 2, ['flight']);
    expect(options.find(o => o.mode === 'flight').liveOffer).toMatchObject({ status: 'expired' });

    withFlightSearch(flightSearchResponse({ status: 'failed', clarification: undefined, failure: { code: 'internal_error', message: 'Something went wrong.' } }));
    options = await transportOptionsFor('trip-1', leg, 2, ['flight']);
    expect(options.find(o => o.mode === 'flight').liveOffer).toMatchObject({ status: 'failed' });
  });

  it('surfaces a flight-search network failure as liveOffer.status: failed without blocking the CTA', async () => {
    global.fetch = vi.fn(async url => {
      if (url.includes('/trusted-action')) return jsonResponse(resolvedAction());
      if (url.includes('/flight-search')) throw new Error('flight search down');
      return jsonResponse({});
    });
    const options = await transportOptionsFor('trip-1', leg, 2, ['flight']);
    const flight = options.find(o => o.mode === 'flight');
    expect(flight.liveOffer).toMatchObject({ status: 'failed' });
    expect(flight.status).toBe('resolved'); // CTA unaffected by the live-offer failure
  });

  it('resolves origin_iata/destination_iata for a known city pair via the closed CITY_IATA lookup', async () => {
    let capturedBody = null;
    global.fetch = vi.fn(async (url, options) => {
      if (url.includes('/trusted-action')) return jsonResponse(resolvedAction());
      if (url.includes('/flight-search')) {
        capturedBody = JSON.parse(options.body);
        return jsonResponse(flightSearchResponse());
      }
      return jsonResponse({});
    });
    await transportOptionsFor('trip-1', { from: 'Bengaluru', to: 'Kochi', departureDate: '2026-03-01' }, 2, ['flight']);
    expect(capturedBody).toMatchObject({ origin_iata: 'BLR', destination_iata: 'COK' });
  });

  it('omits origin_iata/destination_iata for a city with no direct airport, rather than guessing a nearest one', async () => {
    let capturedBody = null;
    global.fetch = vi.fn(async (url, options) => {
      if (url.includes('/trusted-action')) return jsonResponse(resolvedAction());
      if (url.includes('/flight-search')) {
        capturedBody = JSON.parse(options.body);
        return jsonResponse(flightSearchResponse({ status: 'clarification_needed', clarification: { missing_fields: ['origin', 'destination'], message: 'We need airport details.' } }));
      }
      return jsonResponse({});
    });
    await transportOptionsFor('trip-1', { from: 'Bengaluru', to: 'Alleppey', departureDate: '2026-03-01' }, 2, ['flight']);
    expect(capturedBody).not.toHaveProperty('destination_iata');
    expect(capturedBody).toMatchObject({ origin_iata: 'BLR' });
  });
});

describe('feasibleTransportOptions', () => {
  // TWM-195 root-fix contract: TripFeasibilityAssessment.modes only ever
  // contains genuinely feasible entries now (no excluded_modes field, no
  // per-mode ruled_out/unknown). `options` was already resolved only for
  // Backend-approved modes, so this is a straight enrichment pass.
  it('enriches each resolved option with its matching feasibility metadata', () => {
    const options = [
      { mode: 'flight', name: 'Flight' },
      { mode: 'train', name: 'Train' },
    ];
    const feasibility = {
      modes: [
        { mode: 'flight', status: 'feasible', duration_source: 'computed', estimated_distance_km: 350, reason: 'Fast option.', verification: { status: 'GENERAL_GUIDANCE', source_title: null, source_url: null } },
        { mode: 'train', status: 'feasible', duration_source: 'computed', estimated_distance_km: 350, reason: 'Regular train service.', verification: { status: 'GENERAL_GUIDANCE', source_title: null, source_url: null } },
      ],
    };
    const enriched = feasibleTransportOptions(options, feasibility);
    expect(enriched.map(o => o.mode).sort()).toEqual(['flight', 'train']);
    expect(enriched.find(o => o.mode === 'flight').reason).toBe('Fast option.');
    expect(enriched.find(o => o.mode === 'flight').distanceKm).toBe(350);
  });

  it('returns an empty array when there is nothing to enrich (no resolved options)', () => {
    expect(feasibleTransportOptions([], { modes: [] })).toEqual([]);
  });

  it('returns options unchanged when no feasibility data is available', () => {
    const options = [{ mode: 'flight', name: 'Flight' }];
    expect(feasibleTransportOptions(options, null)).toEqual(options);
  });

  // TWM-195 regression: a Bangalore -> Mangalore-like route can legitimately
  // have multiple route-valid modes — all of them enriched and kept, none
  // pruned client-side (Backend already did the only pruning that happens).
  it('keeps every resolved option visible when Backend returned multiple valid modes', () => {
    const options = [
      { mode: 'flight', name: 'Flight' },
      { mode: 'train', name: 'Train' },
      { mode: 'bus', name: 'Bus' },
    ];
    const feasibility = {
      modes: [
        { mode: 'flight', status: 'feasible', duration_source: 'computed', reason: 'Direct flight exists.', verification: { status: 'GENERAL_GUIDANCE', source_title: null, source_url: null } },
        { mode: 'train', status: 'feasible', duration_source: 'computed', reason: 'Overnight train exists.', verification: { status: 'GENERAL_GUIDANCE', source_title: null, source_url: null } },
        { mode: 'bus', status: 'feasible', duration_source: 'computed', reason: 'Regular bus service.', verification: { status: 'GENERAL_GUIDANCE', source_title: null, source_url: null } },
      ],
    };
    const enriched = feasibleTransportOptions(options, feasibility);
    expect(enriched.map(o => o.mode).sort()).toEqual(['bus', 'flight', 'train']);
  });

  it('every option carries a real mode label, not a raw enum', () => {
    expect(modeLabel('flight')).toBe('Flight');
    expect(modeLabel('unknown')).toBe('unknown');
  });
});

describe('recommendedMode', () => {
  it('picks the highest-priority actionable mode: flight > drive > train > bus', () => {
    const options = [
      { mode: 'bus', status: 'resolved' },
      { mode: 'train', status: 'resolved' },
      { mode: 'drive', status: 'no_action' },
    ];
    expect(recommendedMode(options).mode).toBe('drive');
  });

  it('skips a mode with no safe CTA (missing_input) even if higher priority', () => {
    const options = [
      { mode: 'flight', status: 'missing_input' },
      { mode: 'train', status: 'resolved' },
    ];
    expect(recommendedMode(options).mode).toBe('train');
  });

  it('returns null when nothing is actionable', () => {
    expect(recommendedMode([{ mode: 'flight', status: 'missing_input' }])).toBeNull();
  });
});

describe('fetchLegFeasibility', () => {
  it('posts origin/destination to the feasibility endpoint', async () => {
    global.fetch = vi.fn(async () => jsonResponse({ modes: [] }));
    await fetchLegFeasibility('trip-1', { from: 'Delhi', to: 'Gwalior' });
    expect(global.fetch).toHaveBeenCalledWith('/api/trips/trip-1/trusted-action/feasibility', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ origin: 'Delhi', destination: 'Gwalior' }),
    }));
  });
});

describe('stayLegs / stayOptionsFor', () => {
  it('one stay per distinct consecutive location', () => {
    const days = [
      { day_number: 1, primary_location: 'Gwalior' },
      { day_number: 2, primary_location: 'Gwalior' },
      { day_number: 3, primary_location: 'Orchha' },
    ];
    const stays = stayLegs(days);
    expect(stays).toEqual([
      { id: 'stay-Gwalior', location: 'Gwalior', nights: 2 },
      { id: 'stay-Orchha', location: 'Orchha', nights: 1 },
    ]);
  });

  it('resolves one trusted action per approved stay partner', async () => {
    const options = await stayOptionsFor('trip-1', { id: 'stay-Gwalior', location: 'Gwalior', nights: 2 });
    expect(options.length).toBeGreaterThan(1);
    expect(options.every(o => o.name.includes('Gwalior'))).toBe(true);
    expect(options.every(o => o.status === 'resolved')).toBe(true);
  });

  it('renders the affiliate_disclosure the Backend returns, never dropping it', async () => {
    const [option] = await stayOptionsFor('trip-1', { id: 'stay-Gwalior', location: 'Gwalior', nights: 2 });
    expect(option.affiliateDisclosure).toBe(true);
  });
});

describe('activityBookings', () => {
  it('only includes ACTIVITY items genuinely flagged requires_advance_booking, never a mock', () => {
    const days = [
      {
        day_number: 1,
        timeline: [
          { kind: 'ACTIVITY', title: 'Safari', requires_advance_booking: true, detail: 'Book ahead.' },
          { kind: 'ACTIVITY', title: 'Free walk', requires_advance_booking: false, detail: 'Drop in.' },
          { kind: 'TRAVEL', title: 'Transfer', requires_advance_booking: true, detail: 'x' },
        ],
      },
    ];
    const activities = activityBookings(days);
    expect(activities).toEqual([{ id: 'activity-1-Safari', dayNumber: 1, title: 'Safari', detail: 'Book ahead.' }]);
  });

  it('is empty when nothing requires advance booking — never renders as an empty section', () => {
    const days = [{ day_number: 1, timeline: [{ kind: 'ACTIVITY', title: 'Walk', requires_advance_booking: false }] }];
    expect(activityBookings(days)).toEqual([]);
  });
});

describe('notBookedYetLabel', () => {
  it('names the specific segment, never a bare generic label', () => {
    expect(notBookedYetLabel('Delhi → Gwalior')).toBe('Delhi → Gwalior not booked yet');
    expect(notBookedYetLabel('Gwalior stay')).toBe('Gwalior stay not booked yet');
  });
});
