// TWM-234: a trip in one of these stages has no destination committed to
// plan yet -- it is still "Discovering", not "a trip" in the traveler's own
// sense of the word. Shared between the Dashboard tab bar (which stages get
// an Itinerary tab) and Dashboard-home (which stages get their own list
// section and CTA label), so the boundary can't drift between the two.
export const DISCOVER_STAGES = new Set(['new', 'matching', 'recommended', 'matched']);
