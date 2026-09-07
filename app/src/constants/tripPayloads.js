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
  TRIP_SHAPE: 'trip_shape',
  TRAVELER_COUNT: 'traveler_count',
  PREFERRED_PARTNER: 'preferred_partner',
});

export const FLIGHT_SEARCH_KEYS = Object.freeze({
  ORIGIN_IATA: 'origin_iata',
  DESTINATION_IATA: 'destination_iata',
  // TWM-196: structured city/place endpoints — Backend resolves these to
  // an IATA code (twm/services/airport_resolution). Send instead of a
  // frontend-guessed origin_iata/destination_iata.
  ORIGIN_PLACE: 'origin_place',
  DESTINATION_PLACE: 'destination_place',
  DEPARTURE_DATE: 'departure_date',
  // TWM-196: month-precision search, mutually exclusive with
  // DEPARTURE_DATE on the request — validated YYYY-MM only.
  DEPARTURE_MONTH: 'departure_month',
  TRAVELERS: 'travelers',
});
