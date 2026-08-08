// Fake-backend prototype only: stands in for the real Scout LLM (extraction +
// intent routing). Everything here is local heuristics, not a model call.

export const DOMESTIC_DESTINATIONS = {
  coorg: 'Coorg, Karnataka', goa: 'Goa', manali: 'Manali', kerala: 'Kerala',
  shillong: 'Shillong, Meghalaya', kashmir: 'Kashmir', ladakh: 'Ladakh',
  pondicherry: 'Pondicherry', munnar: 'Munnar, Kerala', ooty: 'Ooty', rishikesh: 'Rishikesh',
};

export function classify(text) {
  const t = text.toLowerCase();
  const foundDest = Object.keys(DOMESTIC_DESTINATIONS).find(d => t.includes(d));
  const adviceWords = ['safe', 'best time', 'weather', 'is it', 'should i carry', 'budget for a'];
  const discoveryWords = ['suggest', 'no idea', 'not sure', 'where to go', 'where should i', 'recommend a destination', 'options for'];
  const planWords = ['plan', 'itinerary', 'book', 'trip to', 'help me plan'];

  const isAdvice = adviceWords.some(w => t.includes(w)) && !planWords.some(w => t.includes(w));
  const wantsPlan = planWords.some(w => t.includes(w));
  const wantsDiscovery = discoveryWords.some(w => t.includes(w));

  if (isAdvice) return 'advice';
  if (foundDest && (wantsPlan || !wantsDiscovery)) return 'decided';
  if (wantsDiscovery && wantsPlan) return 'discover_then_plan';
  if (wantsDiscovery) return 'discover_only';
  if (foundDest) return 'decided';
  return 'discover_then_plan';
}

export function findDestination(text) {
  const t = text.toLowerCase();
  for (const k in DOMESTIC_DESTINATIONS) {
    if (t.includes(k)) return DOMESTIC_DESTINATIONS[k];
  }
  return null;
}

const BUDGET_KEYWORDS = [
  { v: 'budget', words: ['under 30', 'cheap', 'budget trip', 'low budget', 'shoestring'] },
  { v: 'premium', words: ['premium', 'luxury', '70,000+', '70000+', 'high end', 'high-end'] },
  { v: 'mid', words: ['mid range', 'mid-range', '30,000', '30000', '50k', '50,000'] },
];

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

// Best-effort extraction from free text so the chat can skip fields it
// already has an answer for, instead of re-asking everything.
export function extractFields(text) {
  const t = text.toLowerCase();
  const fields = {};

  const destination = findDestination(text);
  if (destination) fields.destination = destination;

  const budgetHit = BUDGET_KEYWORDS.find(b => b.words.some(w => t.includes(w)));
  if (budgetHit) fields.budget = budgetHit.v;

  const travelerMatch = t.match(/(\d+)\s*(people|travelers|traveller|persons|of us|pax)/);
  if (travelerMatch) fields.travelers = Math.max(1, Math.min(10, parseInt(travelerMatch[1], 10)));
  else if (/\bsolo\b/.test(t)) fields.travelers = 1;
  else if (/\bcouple\b/.test(t)) fields.travelers = 2;

  const month = MONTHS.find(m => t.includes(m));
  if (month) fields.month = month[0].toUpperCase() + month.slice(1);

  const originMatch = t.match(/from ([a-z\s]+?)(?:,| to | for | in |\.|$)/);
  if (originMatch && !t.includes('from where')) {
    const candidate = originMatch[1].trim();
    if (candidate.length > 2 && candidate.length < 30) {
      fields.origin = candidate.replace(/\b\w/g, c => c.toUpperCase());
    }
  }

  const styleWords = ['relaxing', 'relaxed', 'adventure', 'food', 'slow', 'packed', 'nature', 'party', 'romantic', 'family'];
  const foundStyle = styleWords.filter(w => t.includes(w));
  if (foundStyle.length) fields.style = foundStyle.join(', ');

  return fields;
}

export const ADVICE_REPLIES = {
  ladakh: {
    message: "Ladakh is generally safe to visit, but December is deep winter — the Leh-Manali and Srinagar-Leh highways are both closed, so the only way in is by air. Temperatures regularly drop below −15°C overnight. Book flights into Leh well ahead, and plan a rest day on arrival to acclimatize.",
    suggestDestination: 'Ladakh',
  },
  default: {
    message: "Good question — generally the best time depends on the destination and what you want out of the trip. Tell me where you're thinking of going and I can get specific.",
    suggestDestination: null,
  },
};

export function adviceReplyFor(text) {
  const t = text.toLowerCase();
  if (t.includes('ladakh')) return ADVICE_REPLIES.ladakh;
  return ADVICE_REPLIES.default;
}
