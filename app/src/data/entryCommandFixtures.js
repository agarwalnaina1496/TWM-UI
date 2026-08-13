export const ENTRY_INTENTS = Object.freeze({
  ADVICE: 'advice',
  DISCOVER: 'discover_destination',
  KNOWN_DESTINATION: 'known_destination',
});

export const GOLDEN_SCENARIO_ID = 'self_led_mp_year_end_couple_v1';
export const GOLDEN_QUERY = `**Planning a 2-week end-of-year trip in India with my spouse — need destinations with mild weather (not too hot, not too cold)!**

Hey everyone,

My spouse and I are planning our end-of-year vacation — we've got about 2 weeks off and want to make the most of it. We want to be in India, and we're trying to narrow down where to go.

A few things we're keeping in mind:

Weather: We'd love somewhere with pleasant, moderate weather during Dec–Jan — nothing extremely cold (no sub-zero/snowstorm situations unless it's a deliberate choice) and nothing scorching hot either. Comfortable enough to walk around, sightsee, and enjoy outdoor stuff.

Duration: About 14 days, so we can do a deeper dive into one country/region rather than rushing through multiple.

Vibe: Open to a mix — some culture/sightseeing, some relaxation, maybe a bit of nature/adventure. We're not exclusively looking for a beach trip or exclusively a city trip — happy to hear all kinds of suggestions.

We're a couple in our early 40s, fairly easygoing travelers who enjoy a good balance of exploring and relaxing.`;

// Keyed by the `conversation_context.awaiting` slug, shared by Meridian's
// matcher_state.awaiting and Guide's fixed GuideAwaiting enum — both now use
// the same slug per fact (origin_city, num_travelers, duration,
// travel_dates, budget), so one entry per fact covers both agents.
export const QUICK_REPLIES = Object.freeze({
  origin_city: ['Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Kolkata', 'Hyderabad'],
  num_travelers: ['2', '4', 'Just me'],
  // "duration", not "duration_days" — mirrors Guide's existing awaiting slug.
  duration: ['3 days', '5 days', '7 days'],
  travel_dates: ['Not sure yet', 'Sometime next month', 'Flexible'],
  budget: ['₹1,00,000 total for both'],
});
