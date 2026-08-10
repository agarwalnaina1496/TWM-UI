export const GOLDEN_SCENARIO_ID = 'self_led_mp_year_end_couple_v1';

const criteria = [
  { id: 'budget', label: '₹1,00,000 total for two from Delhi', requirement_type: 'HARD', source_context_paths: ['budget'] },
  { id: 'weather', label: 'Moderate weather for walking and outdoor sightseeing', requirement_type: 'HARD', source_context_paths: ['weather_preference'] },
  { id: 'duration', label: 'A meaningful, unhurried 14-day trip', requirement_type: 'PREFERENCE', source_context_paths: ['duration'] },
  { id: 'experience_mix', label: 'Culture, relaxation and some nature or adventure', requirement_type: 'PREFERENCE', source_context_paths: ['trip_vibe'] },
  { id: 'pace', label: 'Easygoing balance of exploring and relaxing', requirement_type: 'PREFERENCE', source_context_paths: ['traveler_style'] },
];

const bullets = items => ({ type: 'bullets', items });
const facts = entries => ({ type: 'facts', facts: entries.map(([label, value]) => ({ label, value })) });
const cost = (minimum, maximum, items) => ({
  type: 'cost_breakdown', currency: 'INR', group_total: { minimum, maximum },
  items: items.map(([label, low, high]) => ({ label, group: { minimum: low, maximum: high } })),
  note: 'Qualified total-party estimate for two, including Delhi round trip, 13 nights, local travel, food and selected activities.',
});
const match = (criterion_id, conclusion, details) => ({ criterion_id, outcome: 'MATCH', conclusion, details, tradeoffs: [] });
const tradeoff = (criterion_id, conclusion, details, tradeoffs) => ({ criterion_id, outcome: 'TRADEOFF', conclusion, details, tradeoffs });

export function goldenMeridianFixture(referenceOptionId = null) {
  const options = [
    {
      rank: 1, type: 'circuit', name: 'Madhya Pradesh Heritage and Nature', circuit_id: 'gwalior-orchha-khajuraho-panna',
      summary: 'The strongest balance of Delhi connectivity, comfortable winter sightseeing, heritage, nature and an unhurried two-week pace.',
      evaluations: [
        match('budget', 'Train-first connectivity and modest private stays leave a useful buffer.', [cost(60000, 82000, [['Delhi round trip and intercity transport', 8000, 13000], ['13 nights', 24000, 32000], ['Food for two', 14000, 19000], ['Local transport and activities', 14000, 18000]])]),
        match('weather', 'Winter days generally support sightseeing; mornings and nights remain cool without making snow part of the trip.', [facts([['Seasonal fit', 'Comfortable winter sightseeing with cool mornings and nights'], ['Snow dependency', 'None']])]),
        match('duration', 'Four bases support a deeper regional trip without daily relocation.', [bullets(['Gwalior, Orchha, Khajuraho and Panna over approximately 14 days', 'Multi-night bases plus travel and recovery buffers'])]),
        match('experience_mix', 'Forts, temples, riverside downtime and an optional Panna nature experience cover the requested mix.', [bullets(['Heritage and old-city culture', 'Betwa riverside relaxation', 'Optional safari or lower-cost nature day'])]),
        match('pace', 'Multi-night bases and buffer time avoid a checklist itinerary.', [bullets(['No daily hotel changes', 'Flexible time remains around transfer and nature days'])]),
      ],
      other_considerations: ['Panna safari is optional because additional safaris can push the trip toward the upper end of the estimate.'],
    },
    {
      rank: 2, type: 'circuit', name: 'Kerala Culture, Backwaters and Coast', circuit_id: 'kochi-kumarakom-alleppey-varkala-thiruvananthapuram',
      summary: 'The strongest relaxation and moderate-weather direction, with culture, backwaters and coast rather than a beach-only trip.',
      evaluations: [
        tradeoff('budget', 'The trip can approach the ceiling, but Christmas and New Year flights or stays may exceed it.', [cost(88000, 115000, [['Delhi return flights', 30000, 44000], ['13 nights', 28000, 38000], ['Food for two', 14000, 19000], ['Ground travel and activities', 16000, 24000]])], ['Peak-period airfare and stays may take the complete trip above ₹1,00,000.']),
        match('weather', 'The lower-altitude route generally supports warm, pleasant winter sightseeing without deliberate cold exposure.', [facts([['Route choice', 'Munnar omitted to avoid colder high-range conditions'], ['Outdoor effect', 'Morning and late-afternoon sightseeing remain the best fit']])]),
        match('duration', 'Four multi-night bases make good use of two weeks without rushing.', [bullets(['Culture in Kochi', 'Backwater downtime', 'Coastal relaxation and city sightseeing'])]),
        match('experience_mix', 'The route blends heritage, backwaters, coast and relaxed exploration.', [bullets(['Not a beach-only itinerary', 'Backwaters and local culture add nature and variety'])]),
        match('pace', 'Longer stays suit an easygoing couple.', [bullets(['Limited base changes', 'Dedicated downtime around the backwaters and Varkala'])]),
      ],
      other_considerations: ['Year-end is peak season, so the estimate is not a checked price or availability guarantee.'],
    },
    {
      rank: 3, type: 'circuit', name: 'Assam–Meghalaya Nature and Culture', circuit_id: 'guwahati-kaziranga-shillong-cherrapunji',
      summary: 'The strongest Northeast and nature direction, avoiding deliberate snow destinations.',
      evaluations: [
        tradeoff('budget', 'Early flights and selective shared transfers can keep it near budget, but the upper range exceeds the ceiling.', [cost(86000, 120000, [['Delhi return flights', 34000, 56000], ['13 nights', 24000, 33000], ['Food for two', 12000, 17000], ['Ground travel and activities', 16000, 24000]])], ['Airfare and Meghalaya road transfers create the clearest budget risk.']),
        tradeoff('weather', 'Guwahati and Kaziranga fit well, while Shillong and Cherrapunji mornings and nights feel colder than ideal.', [facts([['Snow dependency', 'None'], ['Cold exposure', 'Cooler and damper in the Meghalaya hills']])], ['Warm layers are needed in Shillong and Cherrapunji.']),
        match('duration', 'The circuit rewards a two-week window.', [bullets(['Wildlife, city culture and hill landscapes fit into multi-night bases'])]),
        match('experience_mix', 'This is the strongest nature and light-adventure direction.', [bullets(['Kaziranga wildlife', 'Shillong culture and cafés', 'Cherrapunji caves, landscapes and walks'])]),
        match('pace', 'Four bases can be kept balanced with recovery time after road transfers.', [bullets(['Avoid adding distant high-altitude destinations', 'Keep at least one flexible Meghalaya day'])]),
      ],
      other_considerations: ['Winter waterfall flow can be lower.', 'Private cabs throughout would materially increase the estimate.'],
    },
  ];
  if (referenceOptionId) {
    const reference = options.find(option => option.circuit_id === referenceOptionId);
    if (reference) options.sort((a, b) => (a === reference ? -1 : b === reference ? 1 : a.rank - b.rank)).forEach((option, index) => { option.rank = index + 1; });
  }
  return {
    status: 'SUCCESS', state_delta: { trip_context: {}, matcher_state: { conversation_context: { awaiting: null } } },
    message: referenceOptionId
      ? `Refreshed around ${options[0].name}, while keeping your existing preferences.`
      : 'Madhya Pradesh is the strongest overall match because it keeps the full 14-day trip comfortably within budget while balancing heritage, nature and downtime. Kerala offers the most relaxed, moderate-weather alternative, while Assam–Meghalaya is the strongest Northeast choice with clearer airfare and colder-night trade-offs.',
    trip_type: 'circuit', traveler_criteria: criteria, options,
  };
}

export const GOLDEN_MERIDIAN_METADATA = {
  'gwalior-orchha-khajuraho-panna': { places: ['Gwalior', 'Orchha', 'Khajuraho', 'Panna'], estimated_group: [60000, 82000], access_summary: 'Delhi train-first circuit with four multi-night bases', price_preview: [{ state: 'current', total: [60000, 82000], source: 'Qualified fixture assumptions', checkedAt: 'Scenario estimate' }] },
  'kochi-kumarakom-alleppey-varkala-thiruvananthapuram': { places: ['Kochi', 'Kumarakom/Alleppey', 'Varkala', 'Thiruvananthapuram'], estimated_group: [88000, 115000], access_summary: 'Delhi flights plus lower-altitude Kerala ground circuit', price_preview: [{ state: 'partial', total: [88000, 115000], source: 'Qualified fixture assumptions', checkedAt: 'Scenario estimate', note: 'Peak-period availability is not checked.' }] },
  'guwahati-kaziranga-shillong-cherrapunji': { places: ['Guwahati', 'Kaziranga', 'Shillong', 'Cherrapunji'], estimated_group: [86000, 120000], access_summary: 'Delhi–Guwahati flight plus Northeast road circuit', price_preview: [{ state: 'stale', total: [86000, 120000], source: 'Qualified fixture assumptions', checkedAt: 'Scenario estimate', note: 'Airfare is highly date-sensitive.' }] },
};
