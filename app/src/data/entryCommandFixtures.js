export const ENTRY_INTENTS = Object.freeze({
  ADVICE: 'advice',
  DISCOVER: 'discover_destination',
  KNOWN_DESTINATION: 'known_destination',
});

export const GOLDEN_SCENARIO_ID = 'self_led_mp_year_end_couple_v1';
export const GOLDEN_QUERY = `**Planning a 2-week end-of-year trip in India with my spouse — need destinations with mild weather (not too hot, not too cold)!**
[❓ Travel Question](https://www.reddit.com/r/TravelInIndia/?f=flair_name%3A%22%E2%9D%93%20Travel%20Question%22)

Hey everyone,

My spouse and I are planning our end-of-year vacation — we've got about 2 weeks off and want to make the most of it. We want to be in India, and we're trying to narrow down where to go.

A few things we're keeping in mind:

Weather: We'd love somewhere with pleasant, moderate weather during Dec–Jan — nothing extremely cold (no sub-zero/snowstorm situations unless it's a deliberate choice) and nothing scorching hot either. Comfortable enough to walk around, sightsee, and enjoy outdoor stuff.

Duration: About 14 days, so we can do a deeper dive into one country/region rather than rushing through multiple.

Vibe: Open to a mix — some culture/sightseeing, some relaxation, maybe a bit of nature/adventure. We're not exclusively looking for a beach trip or exclusively a city trip — happy to hear all kinds of suggestions.

We're a couple in our early 40s, fairly easygoing travelers who enjoy a good balance of exploring and relaxing.`;

export const GOLDEN_CONTEXT = Object.freeze({
  scenario_id: GOLDEN_SCENARIO_ID,
  original_traveler_request: GOLDEN_QUERY,
  travelers: 'My spouse and I, a couple in our early 40s',
  duration: 'About 14 days, so we can do a deeper dive into one country/region rather than rushing through multiple.',
  travel_window: 'End-of-year vacation during Dec–Jan',
  weather_preference: "We'd love somewhere with pleasant, moderate weather during Dec–Jan — nothing extremely cold (no sub-zero/snowstorm situations unless it's a deliberate choice) and nothing scorching hot either. Comfortable enough to walk around, sightsee, and enjoy outdoor stuff.",
  trip_vibe: "Open to a mix — some culture/sightseeing, some relaxation, maybe a bit of nature/adventure. We're not exclusively looking for a beach trip or exclusively a city trip — happy to hear all kinds of suggestions.",
  traveler_style: "We're a couple in our early 40s, fairly easygoing travelers who enjoy a good balance of exploring and relaxing.",
  derived: {
    traveler_count: 2, duration_days: 14, preferred_weather: 'moderate', avoid_extreme_heat: true,
    avoid_extreme_cold: true, snow_policy: 'deliberate_choice_only', outdoor_walkability: true, pace: 'balanced',
  },
});

export const GOLDEN_MESSAGES = Object.freeze({
  askOrigin: 'A two-week India trip with a mix of culture, nature and downtime sounds lovely. I’ve noted that you’re travelling as a couple around December–January, want comfortable weather without extremes, and prefer a balanced pace rather than rushing.\n\nWhere will you be travelling from?',
  askBudget: 'Got it—starting from Delhi. And roughly what total budget would you like to stay within for both of you, including travel and stays?',
  handoff: 'Perfect. I’ll look for a comfortable 14-day trip for two from Delhi within approximately ₹1,00,000, prioritising mild weather and affordable round-trip connectivity. Since this is the year-end period, I’ll avoid options where flights or peak-season stays would make the overall trip unrealistic.',
});

export const QUICK_REPLIES = Object.freeze({ origin: ['Delhi'], budget: ['₹1,00,000 total for both'] });
export const MOCK_TRIP_ID = '00000000-0000-4000-8000-000000000137';
