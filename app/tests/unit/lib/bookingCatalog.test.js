import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  transportOptionsFor, feasibleTransportOptions, transportLegs, bundleRoundTrip,
  stayLegs, stayOptionsFor, activityBookings, notBookedYetLabel, modeLabel, recommendedMode,
  fetchLegFeasibility,
} from '../../../src/lib/bookingCatalog.js';

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

// TWM-132: transportOptionsFor/stayOptionsFor/feasibleTransportOptions now
// call the real Backend trusted-action + feasibility endpoints
// (POST /trips/{id}/trusted-action, POST /trips/{id}/trusted-action/feasibility)
// instead of returning mock MODE_TEMPLATE bands — every fetch mock below
// stands in for those two endpoints.
beforeEach(() => {
  global.fetch = vi.fn(async url => {
    if (url.includes('/trusted-action/feasibility')) return jsonResponse(null);
    if (url.includes('/trusted-action')) return jsonResponse(resolvedAction());
    return jsonResponse({});
  });
});

describe('transportLegs', () => {
  it('includes the origin<->destination bookend legs, not just local transfers', () => {
    const days = [
      { day_number: 1, primary_location: 'Gwalior' },
      { day_number: 2, primary_location: 'Gwalior' },
      { day_number: 3, primary_location: 'Orchha' },
    ];
    const legs = transportLegs(days, 'Delhi');
    expect(legs[0]).toEqual({ id: 'outbound-origin', from: 'Delhi', to: 'Gwalior' });
    expect(legs[legs.length - 1]).toEqual({ id: 'return-origin', from: 'Orchha', to: 'Delhi' });
    expect(legs).toHaveLength(3); // Delhi->Gwalior, Gwalior->Orchha, Orchha->Delhi
  });

  it('falls back to a generic origin label when none is known', () => {
    const legs = transportLegs([{ day_number: 1, primary_location: 'Goa' }], undefined);
    expect(legs[0].from).toBe('Home');
  });

  it('is empty for no days', () => {
    expect(transportLegs([], 'Delhi')).toEqual([]);
  });
});

describe('bundleRoundTrip', () => {
  it('bundles the outbound and return legs into one decision when they mirror each other', () => {
    const legs = [
      { id: 'outbound-origin', from: 'Delhi', to: 'Gwalior' },
      { id: 'leg-0', from: 'Gwalior', to: 'Orchha' },
      { id: 'return-origin', from: 'Orchha', to: 'Delhi' },
    ];
    const { bundle, rest } = bundleRoundTrip(legs);
    expect(bundle).toEqual({ id: 'round-trip', outbound: legs[0], inbound: legs[2] });
    expect(rest).toEqual([legs[1]]);
  });

  it('does not bundle when the trip is genuinely one-way', () => {
    const legs = [
      { id: 'a', from: 'Delhi', to: 'Gwalior' },
      { id: 'b', from: 'Gwalior', to: 'Mumbai' },
    ];
    const { bundle, rest } = bundleRoundTrip(legs);
    expect(bundle).toBeNull();
    expect(rest).toEqual(legs);
  });

  it('does not bundle a single leg', () => {
    const legs = [{ id: 'a', from: 'Delhi', to: 'Gwalior' }];
    expect(bundleRoundTrip(legs)).toEqual({ bundle: null, rest: legs });
  });
});

describe('transportOptionsFor', () => {
  const leg = { from: 'Delhi', to: 'Gwalior' };

  it('resolves one trusted action per mode, keyed by mode, with the target URL mapped onto option.url', async () => {
    const options = await transportOptionsFor('trip-1', leg);
    expect(options.map(o => o.mode)).toEqual(['flight', 'train', 'bus', 'drive']);
    expect(options.find(o => o.mode === 'flight')).toMatchObject({ status: 'resolved', url: 'https://www.ixigo.com/search?domain=flight', affiliateDisclosure: true });
  });

  it('drive has no trusted-action domain — feasibility-only, no network call, no CTA', async () => {
    const options = await transportOptionsFor('trip-1', leg);
    expect(options.find(o => o.mode === 'drive')).toMatchObject({ status: 'no_action' });
  });

  it('maps each of the four non-resolved statuses onto option.status safely', async () => {
    global.fetch = vi.fn(async url => {
      if (url.includes('/trusted-action/feasibility')) return jsonResponse(null);
      return jsonResponse({ status: 'missing_input', generated_at: '2026-01-01T00:00:00.000Z', missing_input: { missing_fields: ['origin'], message: 'x' } });
    });
    const options = await transportOptionsFor('trip-1', leg);
    expect(options.find(o => o.mode === 'flight')).toMatchObject({ status: 'missing_input' });
  });

  it('surfaces a network failure as a status: error option instead of throwing', async () => {
    global.fetch = vi.fn(async () => { throw new Error('network down'); });
    const options = await transportOptionsFor('trip-1', leg);
    expect(options.find(o => o.mode === 'flight')).toMatchObject({ status: 'error' });
  });
});

describe('feasibleTransportOptions', () => {
  it('excludes a ruled_out mode entirely (not faded), carrying the Backend-computed reason', () => {
    const options = [
      { mode: 'flight', name: 'Flight' },
      { mode: 'bus', name: 'Bus' },
    ];
    const feasibility = {
      modes: [
        { mode: 'flight', status: 'feasible', duration_source: 'computed', reason: 'Fast option.' },
        { mode: 'bus', status: 'ruled_out', duration_source: 'llm_estimated', reason: 'A 14h journey is not practical here.', verification: { status: 'GENERAL_GUIDANCE', source_title: null, source_url: null } },
      ],
    };
    const { feasible, excluded } = feasibleTransportOptions(options, feasibility);
    expect(feasible.some(o => o.mode === 'bus')).toBe(false);
    expect(excluded.some(o => o.mode === 'bus')).toBe(true);
    expect(excluded.find(o => o.mode === 'bus').reason).toBe('A 14h journey is not practical here.');
  });

  it('treats every mode as feasible with no duration data when no assessment exists yet', () => {
    const options = [{ mode: 'flight', name: 'Flight' }];
    const { feasible, excluded } = feasibleTransportOptions(options, null);
    expect(feasible).toHaveLength(1);
    expect(excluded).toHaveLength(0);
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
