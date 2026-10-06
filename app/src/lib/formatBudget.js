// TWM-234: a budget the traveler stated in rupees, worded as a compact chip --
// "25000 to 26000 INR" -> "₹25k–26k", "50k total budget" -> "₹50k total".
// The traveler's raw phrasing stays in the stored context; only the display is
// normalised. Anything that is not plainly a rupee amount (or two) -- "Tight",
// "$2,000", "around 1 lakh for 2" -- returns null so the caller shows the
// traveler's own words instead of guessing.

const UNITS = {
  thousand: 1e3, k: 1e3,
  lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, l: 1e5,
  crore: 1e7, crores: 1e7, cr: 1e7,
};
const AMOUNT = /(\d[\d,]*(?:\.\d+)?)\s*(thousand|lakhs?|lacs?|crores?|cr|k|l)?(?![a-z])/gi;
const OTHER_CURRENCY = /\$|€|£|\b(usd|eur|gbp|aed)\b/i;
const FILLER = /\b(inr|rs|rupees?|total|budget|per\s*person|per\s*head|each|pp|to|and|up\s*to|upto|under|within|max\w*|about|around|approx\w*)\b|[₹~\-–—,.\s]/gi;
const UP_TO = /\b(up\s*to|upto|under|within|max\w*)\b/i;
const PER_PERSON = /per\s*(person|head)|\bpp\b|\beach\b/i;
const TOTAL = /\btotal\b/i;

const tenth = x => String(Math.round(x * 10) / 10);

function compact(amount) {
  if (amount >= 1e7) return `${tenth(amount / 1e7)}Cr`;
  if (amount >= 1e5) return `${tenth(amount / 1e5)}L`;
  if (amount >= 1e3) return `${tenth(amount / 1e3)}k`;
  return String(amount);
}

export function formatBudget(value) {
  const text = String(value ?? '');
  if (OTHER_CURRENCY.test(text)) return null;
  const found = [...text.matchAll(AMOUNT)];
  if (found.length === 0 || found.length > 2) return null;
  if (text.replace(AMOUNT, ' ').replace(FILLER, ' ').trim() !== '') return null;

  const amounts = found
    .map(([, digits, unit]) => Number(digits.replace(/,/g, '')) * (UNITS[unit?.toLowerCase()] ?? 1))
    .sort((a, b) => a - b);
  const range = amounts.length === 2 && amounts[0] !== amounts[1]
    ? `₹${compact(amounts[0])}–${compact(amounts[1])}`
    : `₹${compact(amounts[0])}`;

  if (amounts.length === 1 && UP_TO.test(text)) return `Up to ${range}`;
  if (PER_PERSON.test(text)) return `${range} per person`;
  if (TOTAL.test(text)) return `${range} total`;
  return range;
}
