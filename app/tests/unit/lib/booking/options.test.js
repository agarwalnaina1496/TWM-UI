import { describe, it, expect, vi, beforeEach } from 'vitest';
import { transportOptionsFor, feasibleTransportOptions, recommendedMode, loadTransportBundle } from '../../../../src/lib/booking/transportOptions.js';
import { stayOptionsFor } from '../../../../src/lib/booking/stayOptions.js';
import { modeLabel, PARTNER_LABEL } from '../../../../src/lib/booking/shared.js';
import { resolveBookingOptions, searchFlights, getTripFeasibility } from '../../../../src/lib/tripApi.js';

vi.mock('../../../../src/lib/tripApi.js', () => ({
  resolveBookingOptions: vi.fn(),
  searchFlights: vi.fn(),
  getTripFeasibility: vi.fn(),
}));

function resolvedEntry(target, { url = 'https://partner.example/search', partner = target.value, capability = null, ctaLabel = null } = {}) {
  return {
    target,
    status: 'resolved',
    generated_at: 't',
    action: {
      action_type: 'SEARCH_REDIRECT',
      domain: target.kind === 'mode' ? target.value : 'stay',
      target: { partner, path: 'search', query_params: {}, target_url: url },
      internal_capability: null,
      affiliate_disclosure: true,
      capability,
      cta_label: ctaLabel,
      capability_note: null,
    },
  };
}
function failedEntry(target, status = 'missing_input') {
  return { target, status, generated_at: 't', missing_input: { missing_fields: ['origin'], message: 'x' } };
}

const flightClarification = {
  status: 'clarification_needed',
  clarification: { missing_fields: ['origin', 'destination'], message: 'Tell us your route.' },
};

beforeEach(() => {
  vi.clearAllMocks();
  searchFlights.mockResolvedValue(flightClarification);
});

describe('modeLabel', () => {
  it('labels each mode and passes an unknown through', () => {
    expect(modeLabel('flight')).toBe('Flight');
    expect(modeLabel('drive')).toBe('Drive');
    expect(modeLabel('teleport')).toBe('teleport');
  });
});

describe('transportOptionsFor — one batch call', () => {
  const leg = { from: 'Delhi', to: 'Goa', departureDate: '2026-03-01' };

  it('issues exactly one booking-options request for the batchable modes', async () => {
    resolveBookingOptions.mockResolvedValueOnce({ results: [
      resolvedEntry({ kind: 'mode', value: 'flight' }),
      resolvedEntry({ kind: 'mode', value: 'train' }),
      resolvedEntry({ kind: 'mode', value: 'bus' }),
    ] });
    const options = await transportOptionsFor('trip-1', leg, { adults: 2, children: 1, infants: 0 }, ['flight', 'train', 'bus', 'drive']);

    expect(resolveBookingOptions).toHaveBeenCalledTimes(1);
    expect(resolveBookingOptions).toHaveBeenCalledWith('trip-1', expect.objectContaining({
      domain: 'transport',
      from_city: 'Delhi',
      to_city: 'Goa',
      departure_date: '2026-03-01',
      party: { adults: 2, children: 1, infants: 0 },
      targets: [{ kind: 'mode', value: 'flight' }, { kind: 'mode', value: 'train' }, { kind: 'mode', value: 'bus' }],
    }));
    // flight + train + bus + a drive no_action placeholder
    expect(options.map(o => o.mode)).toEqual(['flight', 'train', 'bus', 'drive']);
    expect(options.find(o => o.mode === 'drive').status).toBe('no_action');
  });

  it('resolves nothing and makes no call for an empty approved-mode list', async () => {
    expect(await transportOptionsFor('trip-1', leg, null, [])).toEqual([]);
    expect(resolveBookingOptions).not.toHaveBeenCalled();
  });

  it('a failing target does not fail the batch', async () => {
    resolveBookingOptions.mockResolvedValueOnce({ results: [
      resolvedEntry({ kind: 'mode', value: 'train' }),
      failedEntry({ kind: 'mode', value: 'bus' }),
    ] });
    const options = await transportOptionsFor('trip-1', leg, null, ['train', 'bus']);
    expect(options.map(o => [o.mode, o.status])).toEqual([['train', 'resolved'], ['bus', 'missing_input']]);
  });

  it('defaults the party envelope to one adult when none is set', async () => {
    resolveBookingOptions.mockResolvedValueOnce({ results: [resolvedEntry({ kind: 'mode', value: 'train' })] });
    await transportOptionsFor('trip-1', leg, null, ['train']);
    expect(resolveBookingOptions.mock.calls[0][1].party).toEqual({ adults: 1, children: 0, infants: 0 });
  });

  it('folds a live flight offer onto the flight option (a separate search, not in the batch)', async () => {
    resolveBookingOptions.mockResolvedValueOnce({ results: [resolvedEntry({ kind: 'mode', value: 'flight' })] });
    searchFlights.mockResolvedValueOnce({ status: 'offer', offers: [{
      money: { currency: 'INR', per_traveler_amount_minor_units: 500000, group_total_minor_units: 1000000, group_total_is_approximate: true },
      airline_name: 'IndiGo', stop_count: 0, price_found_at: 't', is_recommended: true,
    }] });
    const [flight] = await transportOptionsFor('trip-1', leg, { adults: 2, children: 0, infants: 0 }, ['flight']);
    expect(flight.liveOffer.status).toBe('offer');
    expect(flight.liveOffer.offers[0].airline).toBe('IndiGo');
    expect(searchFlights).toHaveBeenCalledTimes(1);
  });
});

describe('feasibleTransportOptions', () => {
  it('enriches each option with its matching feasibility entry', () => {
    const options = [{ mode: 'flight', status: 'resolved' }, { mode: 'train', status: 'resolved' }];
    const feasibility = { modes: [
      { mode: 'flight', estimated_duration_minutes: 150, estimated_distance_km: 1500, reason: 'fast', duration_source: 'computed', verification: { status: 'GENERAL_GUIDANCE' }, status: 'feasible' },
    ] };
    const [flight, train] = feasibleTransportOptions(options, feasibility);
    expect(flight.durationMinutes).toBe(150);
    expect(train.durationMinutes).toBeUndefined();
  });

  it('is a no-op when there is no feasibility data', () => {
    const options = [{ mode: 'flight', status: 'resolved' }];
    expect(feasibleTransportOptions(options, null)).toEqual(options);
    expect(feasibleTransportOptions([], { modes: [] })).toEqual([]);
  });
});

describe('recommendedMode', () => {
  it('prefers flight > drive > train > bus among actionable options', () => {
    expect(recommendedMode([
      { mode: 'bus', status: 'resolved' }, { mode: 'drive', status: 'no_action' }, { mode: 'train', status: 'resolved' },
    ]).mode).toBe('drive');
  });

  it('is null when nothing is actionable', () => {
    expect(recommendedMode([{ mode: 'flight', status: 'missing_input' }])).toBeNull();
  });
});

describe('stayOptionsFor — one batch call', () => {
  it('issues one booking-options request for every stay partner and keeps only resolved+url', async () => {
    resolveBookingOptions.mockResolvedValueOnce({ results: [
      resolvedEntry({ kind: 'partner', value: 'booking_com' }, { url: 'https://booking.example', capability: 'prefilled_search', ctaLabel: 'Search Booking.com' }),
      { target: { kind: 'partner', value: 'agoda' }, status: 'disabled', generated_at: 't', disabled: { reason: 'no capability' } },
      resolvedEntry({ kind: 'partner', value: 'ixigo' }, { url: 'https://ixigo.example', capability: 'destination_redirect' }),
    ] });
    const options = await stayOptionsFor('trip-1', { id: 's1', location: 'Goa', nights: 2, departureDate: '2026-03-01' }, { adults: 2, children: 0, infants: 0 });

    expect(resolveBookingOptions).toHaveBeenCalledTimes(1);
    const payload = resolveBookingOptions.mock.calls[0][1];
    expect(payload.domain).toBe('stay');
    expect(payload.destination).toBe('Goa');
    expect(payload.return_date).toBe('2026-03-03'); // checkin + nights
    expect(payload.trip_shape).toBe('round_trip');
    expect(payload.targets.map(t => t.value)).toEqual(['booking_com', 'agoda', 'ixigo']);
    expect(options.map(o => o.partner)).toEqual(['booking_com', 'ixigo']);
  });
});

describe('a search with no exact date omits the date params (TWM-228)', () => {
  it('stayOptionsFor sends no departure_date / return_date when the segment has no check-in', async () => {
    resolveBookingOptions.mockResolvedValueOnce({ results: [resolvedEntry({ kind: 'partner', value: 'booking_com' })] });
    await stayOptionsFor('trip-1', { id: 's1', location: 'Goa', nights: 2, departureDate: null, checkoutDate: null }, null);
    const payload = resolveBookingOptions.mock.calls[0][1];
    expect(payload).not.toHaveProperty('departure_date');
    expect(payload).not.toHaveProperty('return_date');
    expect(payload.destination).toBe('Goa');
  });

  it('transportOptionsFor sends no departure_date when the leg has no exact date', async () => {
    resolveBookingOptions.mockResolvedValueOnce({ results: [resolvedEntry({ kind: 'mode', value: 'train' })] });
    await transportOptionsFor('trip-1', { from: 'Delhi', to: 'Goa', departureDate: null }, null, ['train']);
    expect(resolveBookingOptions.mock.calls[0][1]).not.toHaveProperty('departure_date');
  });
});

describe('PARTNER_LABEL', () => {
  it('names the confirmed partners', () => {
    expect(PARTNER_LABEL.booking_com).toBe('Booking.com');
    expect(PARTNER_LABEL.aviasales).toBe('Aviasales');
  });
});

describe('loadTransportBundle — the hub-substituted leg reaches every downstream call (TWM-215)', () => {
  it('sends the hub city, not the town, to feasibility and booking-options', async () => {
    getTripFeasibility.mockResolvedValue({ modes: [{ mode: 'train' }, { mode: 'bus' }] });
    resolveBookingOptions.mockResolvedValue({ results: [] });
    searchFlights.mockResolvedValue(flightClarification);
    const hubLeg = { from: 'Bengaluru', to: 'Udaipur', departureDate: '2026-05-01' };
    const hub = { city: 'Udaipur', side: 'destination', longHaulDistanceKm: 660 };

    const { feasibility } = await loadTransportBundle('trip-1', hubLeg, hub, { adults: 2, children: 0, infants: 0 });

    expect(getTripFeasibility).toHaveBeenCalledWith('trip-1', {
      origin: 'Bengaluru', destination: 'Udaipur', longHaulDistanceKm: 660,
    });
    expect(resolveBookingOptions.mock.calls[0][1]).toMatchObject({ from_city: 'Bengaluru', to_city: 'Udaipur' });
    expect(feasibility.modes.map(m => m.mode)).toEqual(['train', 'bus']);
  });

  it('passes no distance fallback for a directly-connected leg (no hub)', async () => {
    getTripFeasibility.mockResolvedValue({ modes: [] });
    resolveBookingOptions.mockResolvedValue({ results: [] });
    await loadTransportBundle('trip-1', { from: 'Delhi', to: 'Jaipur' }, null, { adults: 1, children: 0, infants: 0 });
    expect(getTripFeasibility).toHaveBeenCalledWith('trip-1', {
      origin: 'Delhi', destination: 'Jaipur', longHaulDistanceKm: null,
    });
  });
});
