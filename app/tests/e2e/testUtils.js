// TWM-110: mocks the real trip-persistence boundary with Playwright route
// interception so scripted conversations stay deterministic without a live
// Backend/agent deployment.
//
// TWM-220: specs still author `trip_state`-shaped fixture records; this
// harness composes the server-side read models the UI now consumes —
// `TripView` for GET/PATCH /trips/{id}, a thin list item for GET /trips,
// and the enriched document for GET /trips/{id}/itinerary. Command /
// first-message responses carry only message + agent_meta + recommendation;
// the app re-fetches the TripView.

function addDaysIso(iso, days) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const TRIP_ID = 'e2e-trip-1';

function tripRecord({ id = TRIP_ID, version = 1, trip_state = {}, title = 'Untitled Trip', updated_at = '2026-01-01T00:00:00.000Z' } = {}) {
  return {
    id, title, product_mode: 'self_led', version,
    trip_state, ui_state: {}, created_at: '2026-01-01T00:00:00.000Z', updated_at,
  };
}

function commandResponse(message, trip) {
  return { message, agent_meta: null, trip };
}

const RECAP_LABELS = {
  origin_city: 'Coming from', num_travelers: 'Travellers', trip_duration: 'Trip length',
  travel_dates: 'When', budget: 'Budget', destinations: 'Destination',
};
const RECAP_KEYS = ['origin_city', 'num_travelers', 'trip_duration', 'travel_dates', 'budget', 'destinations'];

function composeRecap(tripContext = {}) {
  const items = [];
  for (const key of RECAP_KEYS) {
    const raw = tripContext[key];
    if (raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0)) continue;
    const value = Array.isArray(raw) ? raw.join(', ') : String(raw);
    items.push({ key, label: RECAP_LABELS[key], value });
  }
  return items;
}

function composePlan(plannerState) {
  if (!plannerState) return null;
  return {
    places: plannerState.places ?? [],
    day_plan: (plannerState.day_plan ?? []).map(d => ({
      day_number: d.day_number, places: d.places ?? [], pace: d.pace ?? null, buffer_note: d.buffer_note ?? null,
    })),
    frozen: plannerState.frozen_plan != null,
    awaiting: plannerState.conversation_context?.awaiting ?? null,
  };
}

function itineraryResult(record) {
  const it = record.trip_state?.itinerary_state;
  if (it?.status !== 'ready') return null;
  return it.current_version?.result ?? null;
}

function composeSummary(result) {
  if (!result) return null;
  const ts = result.final_itinerary.trip_summary || {};
  const bs = result.final_itinerary.budget_summary || {};
  const count = ts.num_travelers ?? ts.travelers ?? null;
  return {
    title: ts.title || '', destinations: ts.destinations || [], duration_days: ts.duration_days ?? ts.trip_duration ?? 0,
    overview: ts.overview || '', route_rationale: ts.route_rationale || '',
    travelers: typeof count === 'number'
      ? { value: `~${count}`, exact: null, source: 'itinerary_estimate' }
      : { value: null, exact: null, source: 'unknown' },
    dates: { precision: 'none', departure: null, return: null, month: null, label: null, source: 'none' },
    budget: { low: bs.total_low ?? 0, high: bs.total_high ?? 0, currency: bs.currency || 'INR' },
  };
}

function composeBudgetBreakdown(result) {
  if (!result) return null;
  const bs = result.final_itinerary.budget_summary || {};
  return {
    fit_note: bs.budget_fit || `Estimated ${bs.currency || 'INR'} ${bs.total_low}–${bs.currency || 'INR'} ${bs.total_high}.`,
    lines: (bs.lines || []).map(l => ({ category: l.category, low: l.amount_low, high: l.amount_high, note: l.note })),
    estimated_for_travelers: result.final_itinerary.trip_summary?.num_travelers ?? null,
    party_changed_since: false,
  };
}

function composeBeforeYouGo(result) {
  if (!result) return null;
  const notes = (result.final_itinerary.practical_notes || []).map(n => ({ title: n.title, detail: n.detail, verify: !!n.needs_verification }));
  const assumptions = (result.final_itinerary.assumptions || []).map(a => ({ title: a.category === 'stay_area' ? "Where you'll stay" : (a.detail || '').split(/[.!?]/)[0].slice(0, 80), detail: a.detail, verify: true }));
  return [...notes, ...assumptions];
}

function toTripView(record, hasRecommendation) {
  const ts = record.trip_state || {};
  const result = itineraryResult(record);
  return {
    id: record.id, title: record.title, product_mode: record.product_mode, version: record.version,
    ui_state: record.ui_state || {}, created_at: record.created_at, updated_at: record.updated_at,
    lifecycle: {
      stage: ts.stage ?? 'new', status: ts.status ?? 'free',
      active_agent: ts.active_agent ?? null, selected_option: ts.selected_option ?? null,
    },
    context_recap: composeRecap(ts.trip_context),
    plan: composePlan(ts.planner_state),
    matcher: {
      last_message: ts.matcher_state?.conversation_context?.last_meridian_message ?? null,
      awaiting: ts.matcher_state?.conversation_context?.awaiting ?? null,
      has_recommendation: !!hasRecommendation,
    },
    summary: composeSummary(result),
    booking: result ? { party: ts.booking_setup?.party ?? null } : null,
    budget_breakdown: composeBudgetBreakdown(result),
    open_gaps: result ? (ts.booking_setup?.party ? [] : [{ what: "who's travelling", resolution: 'set_party', detail: 'Set the exact party.' }]) : null,
    before_you_go: composeBeforeYouGo(result),
  };
}

// The real GET /trips list item is thinner than this, but the app is always
// reached after an openTrip in production; this harness serves a full
// TripView superset here so a spec that navigates straight to a trip page
// (no ?tripId=) still renders off the boot pick.
function toListItem(record, hasRecommendation) {
  const ts = record.trip_state || {};
  return {
    ...toTripView(record, hasRecommendation),
    travel_window: null,
    has_places: (ts.planner_state?.places?.length || 0) > 0,
    has_day_plan: (ts.planner_state?.day_plan?.length || 0) > 0,
    has_itinerary: ts.itinerary_state?.status === 'ready',
    awaiting: ts.planner_state?.conversation_context?.awaiting ?? null,
    has_recommendation: !!hasRecommendation,
  };
}

// The enriched GET /trips/{id}/itinerary document.
function toEnrichedItinerary(record) {
  const result = itineraryResult(record);
  if (!result) return null;
  const cv = record.trip_state.itinerary_state.current_version;
  const days = result.final_itinerary.days;
  const originCity = record.trip_state?.trip_context?.origin_city;
  const searchPrefs = record.trip_state?.booking_setup?.search_prefs || {};
  const travelLegs = days.flatMap(d => d.timeline.filter(i => i.kind === 'TRAVEL' && i.from_city && i.to_city));
  const outbound = travelLegs.find(l => originCity && l.from_city === originCity);
  const inbound = [...travelLegs].reverse().find(l => originCity && l.to_city === originCity);

  const enrichedDays = days.map(day => ({
    ...day,
    timeline: day.timeline.map((item, index) => {
      const id = item.id || `${record.id}:${day.day_number}:${index}`;
      const isGateway = (item.kind === 'TRAVEL' && item.from_city && item.to_city) && (item === outbound || item === inbound);
      let resolved_date = null, date_precision = 'none', date_source = 'none';
      if (item.kind === 'TRAVEL' || item.kind === 'STAY') {
        const bucket = item.kind === 'TRAVEL' ? 'transports' : 'stays';
        const pref = searchPrefs[bucket]?.[id];
        if (pref?.precision === 'exact' && pref.date) { resolved_date = pref.date; date_precision = 'exact'; date_source = 'search_pref'; }
        else if (pref?.precision === 'month' && pref.month) { resolved_date = pref.month; date_precision = 'month'; date_source = 'search_pref'; }
      }
      return {
        ...item, id, is_gateway_leg: !!isGateway,
        resolved_date, date_precision, date_source,
      };
    }),
  }));

  // Consecutive same-location STAY grouping.
  const segments = [];
  let current = null;
  for (const day of enrichedDays) {
    for (const item of day.timeline.filter(i => i.kind === 'STAY' && (i.location || '').trim())) {
      const loc = item.location.trim();
      if (current && current.location.toLowerCase() === loc.toLowerCase() && day.day_number === current.end + 1) {
        current.end = day.day_number; current.ids.push(item.id); continue;
      }
      if (current) segments.push(current);
      current = { location: loc, start: day.day_number, end: day.day_number, ids: [item.id] };
    }
  }
  if (current) segments.push(current);
  const stay_segments = segments.map(s => {
    const nights = s.end - s.start + 1;
    const slug = s.location.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const id = `${record.id}:stay:${s.start}:${s.end}:${slug}`;
    const pref = searchPrefs.stays?.[id];
    let checkin_date = null, checkout_date = null, month = null, date_precision = 'none', date_source = 'none';
    if (pref?.precision === 'exact' && pref.date) {
      checkin_date = pref.date; checkout_date = addDaysIso(pref.date, nights);
      date_precision = 'exact'; date_source = 'search_pref';
    } else if (pref?.precision === 'month' && pref.month) {
      month = pref.month; date_precision = 'month'; date_source = 'search_pref';
    }
    return { id, location: s.location, start_day_number: s.start, end_day_number: s.end, nights, date_precision, checkin_date, checkout_date, month, date_source, board_item_ids: s.ids };
  });

  return {
    version: cv.version, source_guide_revision: cv.source_guide_revision,
    result: { ...result, final_itinerary: { ...result.final_itinerary, days: enrichedDays }, stay_segments },
    created_at: record.created_at,
  };
}

function bookingOptionsResponse(body) {
  const stayLabels = { booking_com: 'Search Booking.com', agoda: 'Search Agoda', ixigo: 'Browse ixigo hotels' };
  return {
    results: (body.targets || []).map(target => {
      const isMode = target.kind === 'mode';
      return {
        target,
        status: 'resolved',
        generated_at: 't',
        action: {
          action_type: 'SEARCH_REDIRECT',
          domain: isMode ? target.value : 'stay',
          target: { partner: isMode ? (target.value === 'flight' ? 'aviasales' : target.value) : target.value, path: 'search', query_params: {}, target_url: `https://example.com/booking/${target.value}` },
          internal_capability: null,
          affiliate_disclosure: false,
          capability: isMode ? 'prefilled_search' : 'destination_search',
          cta_label: isMode ? `Check ${target.value}` : (stayLabels[target.value] || 'Search stays'),
          capability_note: null,
        },
      };
    }),
  };
}

export async function mockTripCommandFlow(page, steps, { initialTrip, initialTrips, initialRecommendation = null } = {}) {
  let pending = [...steps];
  const seeded = initialTrips ?? (initialTrip ? [initialTrip] : []);
  const records = new Map(seeded.map(record => [record.id, record]));
  let current = seeded[0] ?? null;
  let latestRecommendation = initialRecommendation;

  await page.route('**/api/trips**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const method = request.method();

    if (method === 'GET' && /\/api\/trips\/?$/.test(pathname)) {
      const list = [...records.values()]
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
        .map(r => toListItem(r, r.id === current?.id && latestRecommendation != null));
      return route.fulfill({ json: { trips: list } });
    }

    const recoMatch = method === 'GET' && pathname.match(/\/api\/trips\/([^/]+)\/recommendations$/);
    if (recoMatch) {
      if (!latestRecommendation) return route.fulfill({ status: 404, json: { detail: 'No recommendations yet.' } });
      return route.fulfill({ json: latestRecommendation });
    }

    const itineraryMatch = method === 'GET' && pathname.match(/\/api\/trips\/([^/]+)\/itinerary$/);
    if (itineraryMatch && records.has(itineraryMatch[1])) {
      const enriched = toEnrichedItinerary(records.get(itineraryMatch[1]));
      if (!enriched) return route.fulfill({ status: 404, json: { detail: 'No itinerary yet.' } });
      return route.fulfill({ json: enriched });
    }

    if (method === 'POST' && pathname.endsWith('/trusted-action/feasibility')) {
      const reference = { status: 'GENERAL_GUIDANCE', source_title: null, source_url: null };
      const modes = ['flight', 'train', 'bus', 'drive'].map(mode => ({
        mode, status: 'feasible', duration_source: 'computed',
        estimated_duration_minutes: 120, estimated_distance_km: null,
        reason: 'Genuinely reachable by this mode.', verification: reference,
      }));
      return route.fulfill({ json: { modes } });
    }

    if (method === 'POST' && pathname.endsWith('/booking-options')) {
      return route.fulfill({ json: bookingOptionsResponse(request.postDataJSON()) });
    }

    if (method === 'POST' && pathname.endsWith('/trusted-action')) {
      return route.fulfill({ json: { status: 'resolved', action: { target: { target_url: 'https://example.com/booking' }, internal_capability: null, affiliate_disclosure: false } } });
    }

    if (method === 'POST' && pathname.endsWith('/flight-search')) {
      return route.fulfill({ json: { status: 'unavailable', unavailable: { code: 'x', message: 'Live flight search is not available yet.' } } });
    }

    const singleMatch = method === 'GET' && pathname.match(/\/api\/trips\/([^/]+)$/);
    if (singleMatch && records.has(singleMatch[1])) {
      const r = records.get(singleMatch[1]);
      return route.fulfill({ json: toTripView(r, r.id === current?.id && latestRecommendation != null) });
    }

    if (method === 'POST' && /\/api\/trips\/?$/.test(pathname)) {
      current = tripRecord({ id: seeded.length ? `${TRIP_ID}-${records.size + 1}` : undefined });
      records.set(current.id, current);
      return route.fulfill({ status: 201, json: toTripView(current, false) });
    }

    const renameMatch = method === 'PATCH' && pathname.match(/\/api\/trips\/([^/]+)$/);
    if (renameMatch && records.has(renameMatch[1])) {
      const body = request.postDataJSON();
      const updated = { ...records.get(renameMatch[1]), title: body.title ?? records.get(renameMatch[1]).title, ui_state: body.ui_state ?? records.get(renameMatch[1]).ui_state, version: body.expected_version + 1 };
      records.set(renameMatch[1], updated);
      return route.fulfill({ json: toTripView(updated, updated.id === current?.id && latestRecommendation != null) });
    }

    if (method === 'POST' && pathname.endsWith('/commands')) {
      const body = request.postDataJSON();
      const step = pending.shift();
      if (!step) throw new Error(`Unexpected trip command: ${JSON.stringify(body)} (no more scripted steps).`);
      if (step.command !== body.command) throw new Error(`Expected command "${step.command}" but got "${body.command}".`);
      current = step.response.trip;
      records.set(current.id, current);
      if (step.recommendation !== undefined) latestRecommendation = step.recommendation;
      return route.fulfill({ json: { message: step.response.message ?? null, agent_meta: null, recommendation: step.recommendation ?? null, trip: { id: current.id, version: current.version } } });
    }

    if (method === 'POST' && pathname.endsWith('/first-message')) {
      const body = request.postDataJSON();
      const step = pending.shift();
      if (!step) throw new Error(`Unexpected first-message command: ${JSON.stringify(body)} (no more scripted steps).`);
      if (step.entryIntent !== body.entry_intent) throw new Error(`Expected entry_intent "${step.entryIntent}" but got "${body.entry_intent}".`);
      current = step.response.trip;
      records.set(current.id, current);
      if (step.recommendation !== undefined) latestRecommendation = step.recommendation;
      return route.fulfill({ status: 201, json: { message: step.response.message ?? null, agent_meta: null, recommendation: step.recommendation ?? null, trip: { id: current.id, version: current.version } } });
    }

    return route.continue();
  });
}

function atlasResult({ title = 'Abbey Falls Getaway', destination = 'Coorg', primaryLocation = 'Coorg' } = {}) {
  const reference = { status: 'GENERAL_GUIDANCE', source_title: null, source_url: null };
  return {
    final_itinerary: {
      trip_summary: {
        title, destinations: [destination], duration_days: 1, num_travelers: 2,
        overview: 'A relaxed one-day visit.', route_rationale: 'Everything is within one base.',
      },
      days: [{
        day_number: 1, date: null, title: 'Arrival and exploring', primary_location: primaryLocation,
        summary: 'An easy first day.',
        timeline: [{
          start_time: 'Morning', end_time: null, kind: 'ACTIVITY', title: 'Abbey Falls', location: primaryLocation,
          detail: 'Visit at a relaxed pace.', movement_guidance: null, estimated_cost_low: 0, estimated_cost_high: 0,
          reference, requires_advance_booking: false, booking_readiness: null,
        }],
        notes: [
          { category: 'Weather', title: 'Carry layers', detail: 'Carry layers.', needs_verification: false },
          { category: 'Access', title: 'No permits', detail: 'None required.', needs_verification: false },
        ],
        backup_plan: null,
      }],
      budget_summary: { currency: 'INR', lines: [{ category: 'Local movement', amount_low: 500, amount_high: 800, note: 'General range.' }], total_low: 500, total_high: 800, budget_fit: 'Within a typical budget.' },
      practical_notes: [],
      sources: [],
      assumptions: [],
    },
    agent_meta: { agent: 'atlas', prompt_version: '1.2.0' },
  };
}

function readyItineraryState(options) {
  return {
    status: 'ready',
    current_version: { version: 1, source_guide_revision: 3, result: atlasResult(options) },
  };
}

export { TRIP_ID, tripRecord, commandResponse, atlasResult, readyItineraryState };
