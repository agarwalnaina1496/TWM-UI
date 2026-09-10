import { resolveBookingOptions, getTripFeasibility } from '../tripApi.js';
import { modeLabel, partyEnvelope, toTransportOption } from './shared.js';
import { searchFlightOffer } from './flightOffer.js';

// TWM-215: one drawer's worth of transport data for a leg (already
// hub-substituted by the caller when a gateway hub is chosen) — the
// deterministic feasibility assessment plus the resolved bookable options.
// `hub` only contributes its `longHaulDistanceKm` fallback for a rail-only
// gateway with no resolvable airport.
export async function loadTransportBundle(tripId, leg, hub, party, modeResolution = null) {
  if (modeResolution) {
    const approvedModes = [modeResolution.mode];
    const options = await transportOptionsFor(tripId, leg, party, approvedModes);
    return { options, feasibility: feasibilityFromModeResolution(modeResolution, leg, hub) };
  }
  const feasibility = await getTripFeasibility(tripId, {
    origin: leg.from,
    destination: leg.to,
    longHaulDistanceKm: hub?.longHaulDistanceKm ?? null,
  });
  const approvedModes = (feasibility?.modes || []).map(entry => entry.mode);
  const options = await transportOptionsFor(tripId, leg, party, approvedModes);
  return { options, feasibility };
}

function feasibilityFromModeResolution(modeResolution, leg, hub) {
  const distanceKm = hub?.distanceKm ?? hub?.longHaulDistanceKm ?? null;
  return {
    modes: [{
      mode: modeResolution.mode,
      status: 'feasible',
      duration_source: 'computed',
      estimated_distance_km: distanceKm,
      reason: modeResolution.direct
        ? modeResolution.ruledOutReason || `${modeLabel(modeResolution.mode)} is available directly for ${leg.from} → ${leg.to}.`
        : modeResolution.ruledOutReason || `${modeLabel(modeResolution.mode)} is routed via ${hub?.city}.`,
      verification: { status: 'GENERAL_GUIDANCE' },
    }],
  };
}

// TWM-220/TWM-221: gateway-leg transport resolution — one booking-options
// request for the Backend-approved modes, plus flight's separate live-offer
// search folded in.

// drive has no trusted-action domain — feasibility-only, never a batch target.
const BATCHABLE_MODES = new Set(['flight', 'train', 'bus']);

export async function transportOptionsFor(tripId, leg, party, approvedModes) {
  const modes = (approvedModes || []).filter(mode => mode !== 'drive');
  const batchModes = modes.filter(mode => BATCHABLE_MODES.has(mode));
  const options = [];

  if (batchModes.length > 0) {
    const batch = await resolveBookingOptions(tripId, {
      domain: 'transport',
      from_city: leg.from,
      to_city: leg.to,
      ...(leg.departureDate ? { departure_date: leg.departureDate } : {}),
      party: partyEnvelope(party),
      targets: batchModes.map(mode => ({ kind: 'mode', value: mode })),
    });
    const byMode = new Map((batch.results || []).map(entry => [entry.target.value, entry]));
    for (const mode of batchModes) {
      const name = `${modeLabel(mode)}: ${leg.from} → ${leg.to}`;
      const entry = byMode.get(mode);
      options.push(entry
        ? toTransportOption(mode, name, entry)
        : { mode, name, status: 'error', errorMessage: 'Could not load this option.' });
    }
  }

  const flightOption = options.find(option => option.mode === 'flight');
  if (flightOption) flightOption.liveOffer = await searchFlightOffer(tripId, leg, party);

  return options;
}

// A straight 1:1 enrichment pass — attach each option's matching
// duration/distance/reason/verification from the feasibility entry.
export function feasibleTransportOptions(options, feasibility) {
  const modesByName = new Map((feasibility?.modes || []).map(entry => [entry.mode, entry]));
  return (options || []).map(option => {
    const modeFeasibility = modesByName.get(option.mode);
    if (!modeFeasibility) return option;
    return {
      ...option,
      durationMinutes: modeFeasibility.estimated_duration_minutes,
      distanceKm: modeFeasibility.estimated_distance_km,
      reason: modeFeasibility.reason,
      durationSource: modeFeasibility.duration_source,
      verification: modeFeasibility.verification,
      feasibilityStatus: modeFeasibility.status,
    };
  });
}
