// Shared primitives for the booking-options resolution modules (TWM-221 —
// split out of the old monolithic bookingCatalog.js).

export const MODES = ['flight', 'train', 'bus', 'drive'];
const MODE_LABEL = { flight: 'Flight', train: 'Train', bus: 'Bus', drive: 'Drive' };
export function modeLabel(mode) {
  return MODE_LABEL[mode] || mode;
}

export const PARTNER_LABEL = {
  aviasales: 'Aviasales', hotellook: 'Hotellook', booking_com: 'Booking.com', agoda: 'Agoda', hostelworld: 'Hostelworld', ixigo: 'ixigo',
};

// Always send a valid party envelope (the batch endpoint requires adults >= 1).
export function partyEnvelope(party) {
  if (!party) return { adults: 1, children: 0, infants: 0 };
  return {
    adults: Math.max(1, party.adults ?? 1),
    children: Math.max(0, party.children ?? 0),
    infants: Math.max(0, party.infants ?? 0),
  };
}

export function addDaysIso(isoDate, dayCount) {
  const parsed = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCDate(parsed.getUTCDate() + dayCount);
  return parsed.toISOString().slice(0, 10);
}

// One booking-options result entry -> the shape TransportOptionCard renders.
// Every Backend outcome (resolved / missing_input / unsupported_partner /
// disabled, plus a client-side error fallback) maps to a `status`.
export function toTransportOption(mode, name, entry) {
  if (entry.status === 'resolved') {
    const action = entry.action;
    return {
      mode,
      name,
      status: 'resolved',
      url: action.target?.target_url ?? null,
      partner: action.target?.partner ?? null,
      internalCapability: action.internal_capability ?? null,
      affiliateDisclosure: !!action.affiliate_disclosure,
    };
  }
  return { mode, name, status: entry.status };
}

export function toStayOption(location, partner, entry) {
  const name = `${location} — ${PARTNER_LABEL[partner] || partner}`;
  if (entry.status === 'resolved') {
    const action = entry.action;
    return {
      name,
      partner: action.target?.partner ?? partner,
      status: 'resolved',
      url: action.target?.target_url ?? null,
      affiliateDisclosure: !!action.affiliate_disclosure,
      capability: action.capability ?? null,
      ctaLabel: action.cta_label ?? 'Search stays',
      capabilityNote: action.capability_note ?? null,
    };
  }
  return { name, status: entry.status };
}
