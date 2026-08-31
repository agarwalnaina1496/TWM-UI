import { describe, it, expect } from 'vitest';
import {
  TRIP_CONTEXT_KEYS,
  tripOriginCity,
  tripTravelerComposition,
  tripTravelerCount,
  tripTravelDatesMonthName,
  travelerCompositionTotal,
} from '../../../src/constants/tripContext.js';

describe('tripOriginCity', () => {
  it('reads the canonical origin_city key', () => {
    expect(tripOriginCity({ origin_city: 'Bangalore' })).toBe('Bangalore');
  });

  it('never falls back to a noncanonical origin key', () => {
    expect(tripOriginCity({ origin: 'Bangalore' })).toBeNull();
  });

  it('is null for a missing/empty trip_context', () => {
    expect(tripOriginCity(undefined)).toBeNull();
    expect(tripOriginCity({})).toBeNull();
  });
});

// tripTravelDatesMonthName reads the loose, verbatim travel_dates fact --
// used only to default which precision a booking-date form starts on
// (TWM-215), never to fabricate a real YYYY-MM value (no year is confirmed
// just because a month name was mentioned).
describe('tripTravelDatesMonthName', () => {
  it('extracts a named month from free-form travel_dates text', () => {
    expect(tripTravelDatesMonthName({ travel_dates: 'December, exact days flexible' })).toBe('December');
  });

  it('is case-insensitive', () => {
    expect(tripTravelDatesMonthName({ travel_dates: 'sometime in october' })).toBe('October');
  });

  it('is null when no month name appears', () => {
    expect(tripTravelDatesMonthName({ travel_dates: 'flexible, not sure yet' })).toBeNull();
  });

  it('is null for a missing/empty trip_context', () => {
    expect(tripTravelDatesMonthName(undefined)).toBeNull();
    expect(tripTravelDatesMonthName({})).toBeNull();
  });
});

// tripTravelerCount reads the loose, conversational num_travelers fact
// (same role as travel_dates) — never trusted for a real booking payload.
describe('tripTravelerCount', () => {
  it('normalizes a chat-entered numeric string', () => {
    expect(tripTravelerCount({ [TRIP_CONTEXT_KEYS.NUM_TRAVELERS]: '4' })).toBe(4);
  });

  it('normalizes a plain number', () => {
    expect(tripTravelerCount({ num_travelers: 2 })).toBe(2);
  });

  it('is null for missing, empty, or non-numeric values', () => {
    expect(tripTravelerCount({})).toBeNull();
    expect(tripTravelerCount({ num_travelers: '' })).toBeNull();
    expect(tripTravelerCount({ num_travelers: 'just me' })).toBeNull();
  });
});

// tripTravelerComposition reads the Backend-owned, structured
// adult/child/infant composition — set only via update_traveler_composition,
// never Scout/Meridian/Guide extraction. Same structured-precise-counterpart
// role as tripBookingDateContext plays for dates.
describe('tripTravelerComposition', () => {
  it('reads the canonical structured composition', () => {
    const tripContext = { traveler_composition: { adults: 2, children: 1, infants: 1 } };
    expect(tripTravelerComposition(tripContext)).toEqual({ adults: 2, children: 1, infants: 1 });
    expect(travelerCompositionTotal(tripTravelerComposition(tripContext))).toBe(4);
  });

  it('never reads the loose num_travelers key', () => {
    expect(tripTravelerComposition({ num_travelers: { adults: 2, children: 0, infants: 0 } })).toBeNull();
  });

  it('is null for missing or malformed compositions', () => {
    expect(tripTravelerComposition({})).toBeNull();
    expect(tripTravelerComposition({ traveler_composition: { adults: 0, children: 2, infants: 0 } })).toBeNull();
    expect(tripTravelerComposition({ traveler_composition: { adults: 2, children: '1', infants: 0 } })).toBeNull();
  });
});
