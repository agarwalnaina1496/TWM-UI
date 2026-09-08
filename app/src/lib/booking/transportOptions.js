import { resolveBookingOptions } from '../tripApi.js';
import { modeLabel, partyEnvelope, toTransportOption } from './shared.js';
import { searchFlightOffer } from './flightOffer.js';

// TWM-220/TWM-221: gateway-leg transport resolution — one booking-options
// request for the Backend-approved modes, plus flight's separate live-offer
// search folded in.

// drive has no trusted-action domain — feasibility-only, never a batch target.
const BATCHABLE_MODES = new Set(['flight', 'train', 'bus']);

export async function transportOptionsFor(tripId, leg, party, approvedModes) {
  const modes = approvedModes || [];
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

  if (modes.includes('drive')) {
    options.push({ mode: 'drive', name: `${modeLabel('drive')}: ${leg.from} → ${leg.to}`, status: 'no_action' });
  }
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

// Fixed priority flight > drive > train > bus among modes that actually have
// something actionable (a resolved trusted action, or drive's no_action).
const MODE_PRIORITY = ['flight', 'drive', 'train', 'bus'];
export function recommendedMode(feasibleOptions) {
  const actionable = (feasibleOptions || []).filter(option => option.status === 'resolved' || option.status === 'no_action');
  for (const mode of MODE_PRIORITY) {
    const found = actionable.find(option => option.mode === mode);
    if (found) return found;
  }
  return null;
}
