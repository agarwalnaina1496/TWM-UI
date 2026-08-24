// App-owned API payload field names, scoped by contract — each object
// covers exactly one Backend request/response shape and must not be
// conflated with trip_context's own field names (twm/schemas/
// trusted_action.py and twm/schemas/flight_search.py on the Backend side).

export const TRUSTED_ACTION_KEYS = Object.freeze({
  ACTION_TYPE: 'action_type',
  DOMAIN: 'domain',
  ORIGIN: 'origin',
  DESTINATION: 'destination',
  DEPARTURE_DATE: 'departure_date',
  RETURN_DATE: 'return_date',
  TRAVELER_COUNT: 'traveler_count',
  PREFERRED_PARTNER: 'preferred_partner',
});

export const FLIGHT_SEARCH_KEYS = Object.freeze({
  ORIGIN_IATA: 'origin_iata',
  DESTINATION_IATA: 'destination_iata',
  DEPARTURE_DATE: 'departure_date',
  TRAVELERS: 'travelers',
});
