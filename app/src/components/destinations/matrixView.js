export const OUTCOME_ICON = { MATCH: '✓', TRADEOFF: '⚠', MISMATCH: '✕' };
export const OUTCOME_TONE = { MATCH: 'positive', TRADEOFF: 'caution', MISMATCH: 'negative' };

export function optionLabel(option) {
  return option.type === 'circuit' ? 'Multi-stop circuit' : 'Single destination';
}

export function criterionLabel(criteria, criterionId) {
  return criteria.find(c => c.id === criterionId)?.label || criterionId;
}

const CRITERION_ICON = { style: '🎨', budget: '💰', 'travel-time': '✈️', weather: '🌤️', duration: '📅', experience_mix: '🎨', pace: '🧭' };
export const criterionIcon = criterionId => CRITERION_ICON[criterionId] || '📌';

const COST_ICON_RULES = [
  [/fuel|road|transport/i, '🚗'], [/stay|hotel|houseboat/i, '🏨'], [/activit/i, '🎟️'],
];
export const costIcon = label => (COST_ICON_RULES.find(([re]) => re.test(label)) || [null, '💳'])[1];

// Returns a formatted price range string from the first cost_breakdown detail, or null.
export function priceRange(option) {
  for (const ev of option.evaluations) {
    for (const detail of ev.details) {
      if (detail.type !== 'cost_breakdown') continue;
      const items = detail.items ?? [];
      if (!items.length) continue;
      const currency = detail.currency ?? '';
      let min = 0, max = 0;
      for (const item of items) {
        if (item.group?.minimum) min += item.group.minimum;
        if (item.group?.maximum) max += item.group.maximum;
      }
      if (!max) continue;
      return `${currency} ${min.toLocaleString('en-IN')}–${max.toLocaleString('en-IN')}`;
    }
  }
  return null;
}

const ACCESS_LABEL_PATTERN = /access|route|connect|transfer|flight|airport|drive|reach/i;

// Heuristic: the first fact whose label reads as access/route information,
// so the detail card can show a practical-access line without inventing a
// dedicated "access_summary" field the real contract doesn't have.
export function accessFact(option) {
  for (const evaluation of option.evaluations) {
    for (const detail of evaluation.details) {
      if (detail.type !== 'facts') continue;
      const fact = detail.facts.find(f => ACCESS_LABEL_PATTERN.test(f.label));
      if (fact) return fact;
    }
  }
  return null;
}
