import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  transportOptionsFor, feasibleTransportOptions, transportLegs, gatewayLegs,
  stayOptionsFor, modeLabel, recommendedMode,
  MODES,
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

function resolvedAction({
  url = 'https://www.ixigo.com/search?domain=flight',
  affiliate = true,
  internalCapability = null,
  partner = 'ixigo',
  capability = null,
  ctaLabel = null,
  capabilityNote = null,
} = {}) {
  return {
    status: 'resolved',
    generated_at: '2026-01-01T00:00:00.000Z',
    action: {
      action_type: internalCapability ? 'CHECK_PRICES' : 'SEARCH_REDIRECT',
      domain: 'flight',
      target: internalCapability ? null : { partner, path: 'search', query_params: {}, target_url: url },
      internal_capability: internalCapability,
      affiliate_disclosure: affiliate,
      capability,
      cta_label: ctaLabel,
      capability_note: capabilityNote,
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
// `detail`, which may carry road/landmark/"via" narration.
function travelDay(dayNumber, fromCity, toCity, { departureDate = null, departureMonth = null, narrativeLocation = null } = {}) {
  return {
    day_number: dayNumber,
    primary_location: toCity,
    timeline: [
      {
        kind: 'TRAVEL',
        from_city: fromCity,
        to_city: toCity,
        departure_date: departureDate,
        departure_month: departureMonth,
        location: narrativeLocation || `${fromCity} to ${toCity}`,
      },
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
      { id: 'leg-0', from: 'Delhi', to: 'Gwalior', departureDate: null, departureMonth: null },
      { id: 'leg-1', from: 'Gwalior', to: 'Orchha', departureDate: null, departureMonth: null },
    ]);
  });

  it('never synthesizes an origin<->destination bookend leg — Atlas/Backend owns route meaning, UI must not infer one (TWM-200 review finding)', () => {
    const days = [travelDay(1, 'Gwalior', 'Orchha')];
    const legs = transportLegs(days);
    expect(legs).toEqual([{ id: 'leg-0', from: 'Gwalior', to: 'Orchha', departureDate: null, departureMonth: null }]);
  });

  it('drops a TRAVEL movement missing a structured endpoint instead of parsing location/detail (TWM-200)', () => {
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
            location: 'Marine Drive, Puri to Konark',
            detail: 'Travel along Marine Drive from Puri to Konark',
          },
        ],
      },
      travelDay(3, 'Konark', 'Bhubaneswar'),
    ];
    const legs = transportLegs(days);
    expect(legs).toEqual([
      { id: 'leg-0', from: 'Bhubaneswar', to: 'Puri', departureDate: null, departureMonth: null },
      { id: 'leg-1', from: 'Konark', to: 'Bhubaneswar', departureDate: null, departureMonth: null },
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

  it('threads through the TRAVEL item\'s own structured departure_date, never fabricating one (TWM-200)', () => {
    const days = [
      travelDay(1, 'Delhi', 'Gwalior', { departureDate: '2026-03-01' }),
      travelDay(2, 'Gwalior', 'Orchha', { departureDate: '2026-03-02' }),
    ];
    const legs = transportLegs(days);
    expect(legs[0].departureDate).toBe('2026-03-01');
    expect(legs[0].departureMonth).toBeNull();
    expect(legs[1].departureDate).toBe('2026-03-02');
  });

  it('threads through the TRAVEL item\'s own structured departure_month when only month precision is known (TWM-200)', () => {
    const days = [travelDay(1, 'Delhi', 'Gwalior', { departureMonth: '2026-10' })];
    const legs = transportLegs(days);
    expect(legs[0].departureMonth).toBe('2026-10');
    expect(legs[0].departureDate).toBeNull();
  });

  it('leaves both departureDate and departureMonth null when Atlas has no confirmed date precision, never parsing day-level free text like a trip-level "October" label (TWM-200)', () => {
    const days = [travelDay(1, 'Delhi', 'Gwalior')];
    const legs = transportLegs(days);
    expect(legs[0].departureDate).toBeNull();
    expect(legs[0].departureMonth).toBeNull();
  });

  it('regression: Odisha five-leg route resolves entirely from canonical endpoints, never scenic narrative text (TWM-200)', () => {
    const days = [
      travelDay(1, 'Bangalore', 'Bhubaneswar'),
      travelDay(2, 'Bhubaneswar', 'Puri', { narrativeLocation: 'Bhubaneswar to Puri Highway' }),
      travelDay(3, 'Puri', 'Konark', { narrativeLocation: 'Travel along Marine Drive from Puri to Konark' }),
      travelDay(4, 'Konark', 'Bhubaneswar', { narrativeLocation: 'Konark to Bhubaneswar via Pipili' }),
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

  // PR review, TWM-201: a single trip-level exact date must never be
  // applied to both the outbound and return leg of a gateway trip — that
  // would confidently misdate the return search. departure_date maps only
  // to the outbound-from-origin leg, return_date only to the
  // return-to-origin leg.
  describe('bookingDateOverride (TWM-201)', () => {
    it('applies departure_date only to the outbound-from-origin leg and return_date only to the return-to-origin leg', () => {
      const days = [travelDay(1, 'Delhi', 'Rishikesh'), travelDay(2, 'Rishikesh', 'Delhi')];
      const override = { precision: 'exact', departure_date: '2026-05-01', return_date: '2026-05-10' };
      const legs = transportLegs(days, override, 'Delhi');
      expect(legs).toEqual([
        { id: 'leg-0', from: 'Delhi', to: 'Rishikesh', departureDate: '2026-05-01', departureMonth: null },
        { id: 'leg-1', from: 'Rishikesh', to: 'Delhi', departureDate: '2026-05-10', departureMonth: null },
      ]);
    });

    it('leaves the return leg dateless when only departure_date is supplied, never reusing the outbound date', () => {
      const days = [travelDay(1, 'Delhi', 'Rishikesh'), travelDay(2, 'Rishikesh', 'Delhi')];
      const override = { precision: 'exact', departure_date: '2026-05-01' };
      const legs = transportLegs(days, override, 'Delhi');
      expect(legs[0].departureDate).toBe('2026-05-01');
      expect(legs[1].departureDate).toBeNull();
    });

    it('never applies the exact-date override to an internal (non-gateway) leg', () => {
      const days = [
        travelDay(1, 'Delhi', 'Rishikesh'),
        travelDay(2, 'Rishikesh', 'Haridwar'),
        travelDay(3, 'Haridwar', 'Delhi'),
      ];
      const override = { precision: 'exact', departure_date: '2026-05-01', return_date: '2026-05-10' };
      const legs = transportLegs(days, override, 'Delhi');
      expect(legs[0].departureDate).toBe('2026-05-01'); // Delhi -> Rishikesh (outbound)
      expect(legs[1].departureDate).toBeNull(); // Rishikesh -> Haridwar (internal)
      expect(legs[2].departureDate).toBe('2026-05-10'); // Haridwar -> Delhi (return)
    });

    it('still applies month precision to any dateless leg regardless of direction, unchanged from prior behavior', () => {
      const days = [
        travelDay(1, 'Delhi', 'Rishikesh'),
        travelDay(2, 'Rishikesh', 'Haridwar'),
        travelDay(3, 'Haridwar', 'Delhi'),
      ];
      const override = { precision: 'month', departure_month: '2026-05' };
      const legs = transportLegs(days, override, 'Delhi');
      expect(legs.every(leg => leg.departureMonth === '2026-05')).toBe(true);
    });

    it('never overrides a leg that already carries its own Atlas-provided date', () => {
      const days = [travelDay(1, 'Delhi', 'Rishikesh', { departureDate: '2026-04-01' })];
      const override = { precision: 'exact', departure_date: '2026-05-01' };
      const legs = transportLegs(days, override, 'Delhi');
      expect(legs[0].departureDate).toBe('2026-04-01');
    });
  });
});

describe('gatewayLegs', () => {
  it('keeps only the outbound-from-origin and return-to-origin legs for the Odisha route, hiding every internal/circuit leg', () => {
    const legs = [
      { id: 'leg-0', from: 'Bangalore', to: 'Bhubaneswar' },
      { id: 'leg-1', from: 'Bhubaneswar', to: 'Puri' },
      { id: 'leg-2', from: 'Puri', to: 'Konark' },
      { id: 'leg-3', from: 'Konark', to: 'Bhubaneswar' },
      { id: 'leg-4', from: 'Bhubaneswar', to: 'Bangalore' },
    ];
    expect(gatewayLegs(legs, 'Bangalore')).toEqual([legs[0], legs[4]]);
  });

  it('supports an open-jaw trip — outbound and inbound gateways can be genuinely different legs, never assumed to mirror each other', () => {
    // Bangalore -> Delhi -> Agra -> Jaipur -> Bangalore: only the first and
    // last legs (both touching Bangalore) are gateways; Delhi->Agra and
    // Agra->Jaipur are internal and must be hidden.
    const legs = [
      { id: 'leg-0', from: 'Bangalore', to: 'Delhi' },
      { id: 'leg-1', from: 'Delhi', to: 'Agra' },
      { id: 'leg-2', from: 'Agra', to: 'Jaipur' },
      { id: 'leg-3', from: 'Jaipur', to: 'Bangalore' },
    ];
    expect(gatewayLegs(legs, 'Bangalore')).toEqual([legs[0], legs[3]]);
  });

  it('genuine open-jaw where outbound and return never touch the same non-origin city', () => {
    // Mumbai -> Delhi (outbound) ... Kolkata -> Mumbai (return) — the
    // traveler flies into Delhi but home-bound from Kolkata; neither
    // gateway leg is assumed to mirror the other.
    const legs = [
      { id: 'leg-0', from: 'Mumbai', to: 'Delhi' },
      { id: 'leg-1', from: 'Delhi', to: 'Kolkata' },
      { id: 'leg-2', from: 'Kolkata', to: 'Mumbai' },
    ];
    expect(gatewayLegs(legs, 'Mumbai')).toEqual([legs[0], legs[2]]);
  });

  it('a single direct round-trip leg is its own one-element gateway list, never duplicated', () => {
    const legs = [{ id: 'leg-0', from: 'Delhi', to: 'Goa' }, { id: 'leg-1', from: 'Goa', to: 'Delhi' }];
    // Neither leg's from/to matches origin on both ends simultaneously here
    // (open-jaw-shaped fixture); confirm the genuinely-single-leg case too:
    const oneLeg = [{ id: 'leg-0', from: 'Delhi', to: 'Goa' }];
    expect(gatewayLegs(oneLeg, 'Delhi')).toEqual(oneLeg);
    expect(gatewayLegs(legs, 'Delhi')).toEqual(legs);
  });

  it('fails closed to an empty list when origin is unknown — never fabricates a gateway row', () => {
    const legs = [{ id: 'leg-0', from: 'Bangalore', to: 'Bhubaneswar' }];
    expect(gatewayLegs(legs, null)).toEqual([]);
    expect(gatewayLegs(legs, undefined)).toEqual([]);
  });

  it('fails closed on a direction with no matching leg — never fabricates a missing gateway', () => {
    // No leg ever returns to Bangalore in this fixture — only the outbound
    // gateway should appear, never a synthesized return row.
    const legs = [
      { id: 'leg-0', from: 'Bangalore', to: 'Bhubaneswar' },
      { id: 'leg-1', from: 'Bhubaneswar', to: 'Puri' },
    ];
    expect(gatewayLegs(legs, 'Bangalore')).toEqual([legs[0]]);
  });

  it('is empty when no legs exist at all', () => {
    expect(gatewayLegs([], 'Bangalore')).toEqual([]);
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

describe('traveler_count on trusted-action transport CTA payloads (TWM-195 review comment)', () => {
  const leg = { from: 'Delhi', to: 'Gwalior' };

  it('includes traveler_count on train/bus trusted-action payloads when a normalized count is known', async () => {
    let capturedBodies = [];
    global.fetch = vi.fn(async (url, options) => {
      if (url.includes('/trusted-action')) { capturedBodies.push(JSON.parse(options.body)); return jsonResponse(resolvedAction()); }
      return jsonResponse({});
    });
    await transportOptionsFor('trip-1', leg, { adults: 1, children: 1, infants: 0 }, ['train', 'bus']);
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
    await transportOptionsFor('trip-1', leg, { adults: 2, children: 1, infants: 1 }, ['flight']);
    expect(ctaBody).toMatchObject({ traveler_count: 4 });
    expect(flightSearchBody).toMatchObject({ travelers: { adults: 2, children: 1, infants: 1 } });
  });

  it('drive never calls trusted-action at all, so it never carries traveler_count', async () => {
    let called = false;
    global.fetch = vi.fn(async (url) => { if (url.includes('/trusted-action')) called = true; return jsonResponse({}); });
    await transportOptionsFor('trip-1', leg, { adults: 2, children: 0, infants: 0 }, ['drive']);
    expect(called).toBe(false);
  });
});

describe('departure_date on trusted-action transport CTA payloads (TWM-196 review comment)', () => {
  // Backend no longer requires departure_date to resolve an affiliate
  // redirect (see twm/services/trusted_action/calculations.py), but a
  // genuinely known date should still be sent so the partner search page
  // is pre-filled rather than deliberately omitted.
  it('includes departure_date on the flight trusted-action CTA payload when the leg has one', async () => {
    let ctaBody = null;
    global.fetch = vi.fn(async (url, options) => {
      if (url.includes('/trusted-action')) { ctaBody = JSON.parse(options.body); return jsonResponse(resolvedAction()); }
      if (url.includes('/flight-search')) return jsonResponse(flightSearchResponse());
      return jsonResponse({});
    });
    await transportOptionsFor('trip-1', { from: 'Delhi', to: 'Gwalior', departureDate: '2026-03-01' }, 2, ['flight']);
    expect(ctaBody).toMatchObject({ departure_date: '2026-03-01' });
  });

  it('includes departure_date on train/bus trusted-action CTA payloads when the leg has one', async () => {
    let capturedBodies = [];
    global.fetch = vi.fn(async (url, options) => {
      if (url.includes('/trusted-action')) { capturedBodies.push(JSON.parse(options.body)); return jsonResponse(resolvedAction()); }
      return jsonResponse({});
    });
    await transportOptionsFor('trip-1', { from: 'Delhi', to: 'Gwalior', departureDate: '2026-03-01' }, 2, ['train', 'bus']);
    expect(capturedBodies.every(body => body.departure_date === '2026-03-01')).toBe(true);
  });

  it('omits departure_date entirely when the leg has none, never fabricating one', async () => {
    let ctaBody = null;
    global.fetch = vi.fn(async (url, options) => {
      if (url.includes('/trusted-action')) { ctaBody = JSON.parse(options.body); return jsonResponse(resolvedAction()); }
      if (url.includes('/flight-search')) return jsonResponse(flightSearchResponse());
      return jsonResponse({});
    });
    await transportOptionsFor('trip-1', { from: 'Delhi', to: 'Gwalior' }, 2, ['flight']);
    expect(ctaBody).not.toHaveProperty('departure_date');
  });

  it('resolves the flight affiliate CTA even with no departure_date at all — the hybrid model\'s affiliate-only fallback', async () => {
    global.fetch = vi.fn(async url => {
      if (url.includes('/trusted-action')) return jsonResponse(resolvedAction());
      if (url.includes('/flight-search')) {
        return jsonResponse(flightSearchResponse({ status: 'unavailable', clarification: undefined, unavailable: { code: 'provider_not_configured', message: 'Live flight search is not available yet for this trip.' } }));
      }
      return jsonResponse({});
    });
    const options = await transportOptionsFor('trip-1', { from: 'Delhi', to: 'Gwalior' }, 2, ['flight']);
    const flight = options.find(o => o.mode === 'flight');
    expect(flight.status).toBe('resolved');
    expect(flight.liveOffer.status).toBe('unavailable');
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

  // TWM-215: traveler_count/group_total_minor_units/group_total_is_approximate
  // are a Backend-computed enrichment present only once the traveler's
  // exact composition is known -- the provider itself never required a
  // count to search at all. A null group_total_minor_units used to render
  // as "NaN" instead of falling back to the provider's own per-traveler
  // price.
  it('falls back to a per-traveler price label when group_total_minor_units is unknown', async () => {
    withFlightSearch(flightSearchResponse({
      status: 'offer',
      offers: [
        { origin_iata: 'DEL', destination_iata: 'GWL', trip_type: 'one_way', departure_date: '2026-03-01', money: { currency: 'INR', per_traveler_amount_minor_units: 500000, traveler_count: null, group_total_minor_units: null, group_total_is_approximate: null }, baggage: {}, fare_conditions: {}, provenance: { provider_name: 'aviasales', provider_reference: 'x' }, price_found_at: '2026-01-01T00:00:00.000Z', is_recommended: true, airline_code: '6E' },
      ],
    }));
    const options = await transportOptionsFor('trip-1', leg, null, ['flight']);
    const flight = options.find(o => o.mode === 'flight');
    expect(flight.liveOffer).toMatchObject({ status: 'offer', priceLabel: 'INR 5,000.00 per traveler' });
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

  // TWM-196: airport/IATA resolution moved to Backend
  // (twm.services.airport_resolution) — the UI no longer owns a CITY_IATA
  // map at all. searchFlightOffer must send the visible leg's structured
  // city/place labels as origin_place/destination_place and let Backend
  // resolve them.
  it('sends origin_place/destination_place from the visible leg, never a frontend-resolved IATA code', async () => {
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
    expect(capturedBody).toMatchObject({ origin_place: 'Bengaluru', destination_place: 'Kochi' });
    expect(capturedBody).not.toHaveProperty('origin_iata');
    expect(capturedBody).not.toHaveProperty('destination_iata');
  });

  // TWM-196/TWM-200 review comment: leg.departureMonth (the TRAVEL item's
  // own structured departure_month, never trip-level free text) must be
  // sent to /flight-search when no exact departureDate is known.
  it('sends departure_month when the leg has only a structured month, never a fabricated exact date', async () => {
    let capturedBody = null;
    global.fetch = vi.fn(async (url, options) => {
      if (url.includes('/trusted-action')) return jsonResponse(resolvedAction());
      if (url.includes('/flight-search')) {
        capturedBody = JSON.parse(options.body);
        return jsonResponse(flightSearchResponse({ date_precision: 'month' }));
      }
      return jsonResponse({});
    });
    await transportOptionsFor('trip-1', { from: 'Bengaluru', to: 'Bhubaneswar', departureMonth: '2026-10' }, 2, ['flight']);
    expect(capturedBody).toMatchObject({ departure_month: '2026-10' });
    expect(capturedBody).not.toHaveProperty('departure_date');
  });

  it('prefers the exact departure_date over departure_month when the leg somehow has both', async () => {
    let capturedBody = null;
    global.fetch = vi.fn(async (url, options) => {
      if (url.includes('/trusted-action')) return jsonResponse(resolvedAction());
      if (url.includes('/flight-search')) {
        capturedBody = JSON.parse(options.body);
        return jsonResponse(flightSearchResponse());
      }
      return jsonResponse({});
    });
    await transportOptionsFor('trip-1', { from: 'Bengaluru', to: 'Bhubaneswar', departureDate: '2026-10-11', departureMonth: '2026-10' }, 2, ['flight']);
    expect(capturedBody).toMatchObject({ departure_date: '2026-10-11' });
    expect(capturedBody).not.toHaveProperty('departure_month');
  });

  it('sends neither departure_date nor departure_month when the leg has no structured date at all', async () => {
    let capturedBody = null;
    global.fetch = vi.fn(async (url, options) => {
      if (url.includes('/trusted-action')) return jsonResponse(resolvedAction());
      if (url.includes('/flight-search')) {
        capturedBody = JSON.parse(options.body);
        return jsonResponse(flightSearchResponse({ date_precision: 'flexible' }));
      }
      return jsonResponse({});
    });
    await transportOptionsFor('trip-1', { from: 'Bengaluru', to: 'Bhubaneswar' }, 2, ['flight']);
    expect(capturedBody).not.toHaveProperty('departure_date');
    expect(capturedBody).not.toHaveProperty('departure_month');
  });

  it('renders origin_resolved/destination_resolved from the Backend response as honest airport context', async () => {
    withFlightSearch(flightSearchResponse({
      status: 'unavailable',
      clarification: undefined,
      unavailable: { code: 'provider_not_configured', message: 'Live flight search is not available yet for this trip.' },
      origin_resolved: { input_label: 'Bengaluru', iata: 'BLR', airport_name: 'Kempegowda International Airport Bengaluru', source: 'ourairports', confidence: 'high' },
      destination_resolved: { input_label: 'Bhubaneswar', iata: 'BBI', airport_name: 'Biju Patnaik International Airport', source: 'ourairports', confidence: 'high' },
    }));
    const options = await transportOptionsFor('trip-1', { from: 'Bengaluru', to: 'Bhubaneswar', departureDate: '2026-03-01' }, 2, ['flight']);
    const flight = options.find(o => o.mode === 'flight');
    expect(flight.liveOffer.originResolved).toMatchObject({ iata: 'BLR' });
    expect(flight.liveOffer.destinationResolved).toMatchObject({ iata: 'BBI' });
  });

  it('an unresolvable place leaves the corresponding resolved field null, never a guess', async () => {
    withFlightSearch(flightSearchResponse({
      status: 'clarification_needed',
      clarification: { missing_fields: ['origin'], message: 'We need a departure city.' },
      origin_resolved: null,
      destination_resolved: { input_label: 'Bhubaneswar', iata: 'BBI', airport_name: 'Biju Patnaik International Airport', source: 'ourairports', confidence: 'high' },
    }));
    const options = await transportOptionsFor('trip-1', { from: 'Nowhereville', to: 'Bhubaneswar', departureDate: '2026-03-01' }, 2, ['flight']);
    const flight = options.find(o => o.mode === 'flight');
    expect(flight.liveOffer.originResolved).toBeNull();
    expect(flight.liveOffer.destinationResolved).toMatchObject({ iata: 'BBI' });
  });

  it('labels a month/flexible result as indicative, never as an exact-day live offer (TWM-196)', async () => {
    withFlightSearch(flightSearchResponse({
      status: 'offer',
      date_precision: 'month',
      offers: [
        { origin_iata: 'DEL', destination_iata: 'GWL', trip_type: 'one_way', departure_date: '2026-03-11', money: { currency: 'INR', per_traveler_amount_minor_units: 500000, traveler_count: 2, group_total_minor_units: 1000000, group_total_is_approximate: true }, baggage: {}, fare_conditions: {}, provenance: { provider_name: 'aviasales', provider_reference: 'x' }, price_found_at: '2026-01-01T00:00:00.000Z', is_recommended: true, airline_code: '6E' },
      ],
    }));
    const options = await transportOptionsFor('trip-1', leg, 2, ['flight']);
    const flight = options.find(o => o.mode === 'flight');
    expect(flight.liveOffer).toMatchObject({ status: 'offer', datePrecision: 'month' });
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

describe('stayOptionsFor', () => {
  it('resolves one trusted action per approved stay partner', async () => {
    const options = await stayOptionsFor('trip-1', { id: 'stay-Gwalior', location: 'Gwalior', nights: 2 });
    expect(options).toHaveLength(3);
    expect(options.every(o => o.name.includes('Gwalior'))).toBe(true);
    expect(options.every(o => o.status === 'resolved')).toBe(true);
  });

  it('renders the affiliate_disclosure the Backend returns, never dropping it', async () => {
    const [option] = await stayOptionsFor('trip-1', { id: 'stay-Gwalior', location: 'Gwalior', nights: 2 });
    expect(option.affiliateDisclosure).toBe(true);
  });

  it('uses the same canonical date and derived traveler total as other booking surfaces', async () => {
    const bodies = [];
    global.fetch = vi.fn(async (url, options) => {
      if (url.includes('/trusted-action')) bodies.push(JSON.parse(options.body));
      return jsonResponse(resolvedAction());
    });

    await stayOptionsFor(
      'trip-1',
      { id: 'stay-Gwalior', location: 'Gwalior', nights: 2, departureDate: '2026-10-13' },
      { adults: 2, children: 1, infants: 1 },
    );

    expect(bodies.length).toBeGreaterThan(1);
    expect(bodies.every(body => body.departure_date === '2026-10-13')).toBe(true);
    expect(bodies.every(body => body.return_date === '2026-10-15')).toBe(true);
    expect(bodies.every(body => body.trip_shape === 'round_trip')).toBe(true);
    expect(bodies.every(body => body.traveler_count === 4)).toBe(true);
  });

  it('keeps provider order and maps Backend capability CTA metadata', async () => {
    global.fetch = vi.fn(async (url, options) => {
      const body = JSON.parse(options.body);
      const responseByPartner = {
        booking_com: resolvedAction({
          partner: 'booking_com',
          url: 'https://www.booking.com/searchresults.html?ss=Goa',
          affiliate: false,
          capability: 'prefilled_search',
          ctaLabel: 'Search Booking.com',
          capabilityNote: 'Destination search opens on Booking.com.',
        }),
        agoda: resolvedAction({
          partner: 'agoda',
          url: 'https://www.agoda.com/search?city=11304',
          affiliate: false,
          capability: 'known_destination_search',
          ctaLabel: 'Search Agoda',
          capabilityNote: 'Known Agoda city metadata lets us prefill this stay search.',
        }),
        ixigo: resolvedAction({
          partner: 'ixigo',
          url: 'https://www.ixigo.com/hotels/hotels-in-goa',
          affiliate: false,
          capability: 'destination_redirect',
          ctaLabel: 'Browse ixigo hotels',
          capabilityNote: 'ixigo opens the destination hotel page.',
        }),
      };
      return jsonResponse(responseByPartner[body.preferred_partner]);
    });

    const options = await stayOptionsFor('trip-1', { id: 'stay-Goa', location: 'Goa', nights: 1 });

    expect(options.map(option => option.partner)).toEqual(['booking_com', 'agoda', 'ixigo']);
    expect(options.map(option => option.ctaLabel)).toEqual(['Search Booking.com', 'Search Agoda', 'Browse ixigo hotels']);
    expect(options.every(option => option.affiliateDisclosure === false)).toBe(true);
  });

  it('filters a provider with no confirmed capability instead of rendering a dead option', async () => {
    global.fetch = vi.fn(async (url, options) => {
      const body = JSON.parse(options.body);
      if (body.preferred_partner === 'agoda') {
        return jsonResponse({ status: 'disabled', generated_at: '2026-01-01T00:00:00.000Z', disabled: { reason: 'No confirmed useful provider redirect is available for this stay yet.' } });
      }
      return jsonResponse(resolvedAction({ partner: body.preferred_partner, url: `https://example.com/${body.preferred_partner}` }));
    });

    const options = await stayOptionsFor('trip-1', { id: 'stay-Coorg', location: 'Coorg', nights: 1 });

    expect(options.map(option => option.partner)).toEqual(['booking_com', 'ixigo']);
  });
});

