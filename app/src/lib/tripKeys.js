// TWM-221: the query-key namespace for the client trip data layer. Every
// client read of trip data goes through one of these keys.
export const tripKeys = {
  list: ['trips'],
  trip: id => ['trip', id],
  recommendations: id => ['recommendations', id],
  itinerary: id => ['itinerary', id],
};
