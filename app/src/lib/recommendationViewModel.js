const OUTCOMES = new Set(['MATCH', 'TRADEOFF', 'MISMATCH']);
const DETAIL_TYPES = new Set(['bullets', 'facts', 'cost_breakdown']);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function optionKey(option) {
  return String(option?.type === 'circuit' ? option?.circuit_id ?? '' : option?.destination_id ?? '');
}

function validRange(range) {
  return isObject(range)
    && Number.isFinite(range.minimum)
    && Number.isFinite(range.maximum)
    && range.minimum >= 0
    && range.maximum >= range.minimum;
}

function validDetail(detail) {
  if (!isObject(detail) || !DETAIL_TYPES.has(detail.type)) return false;
  if (detail.type === 'bullets') return Array.isArray(detail.items) && detail.items.length > 0;
  if (detail.type === 'facts') return Array.isArray(detail.facts) && detail.facts.length > 0;
  return /^[A-Z]{3}$/.test(detail.currency ?? '')
    && Array.isArray(detail.items)
    && detail.items.length > 0
    && detail.items.every(item => isObject(item)
      && typeof item.label === 'string'
      && (validRange(item.per_person) || validRange(item.group)));
}

const OPTION_STATUSES = new Set(['SUCCESS', 'SOFT_FAIL']);

export function recommendationViewModel(payload, metadataByOption = {}) {
  if (!isObject(payload) || !OPTION_STATUSES.has(payload.status)) throw new Error('Recommendation response is invalid.');
  const { traveler_criteria: criteria, options } = payload;
  if (!Array.isArray(criteria) || criteria.length === 0) throw new Error('Traveler criteria are missing.');
  if (!Array.isArray(options) || options.length === 0 || options.length > 3) throw new Error('Recommendation options are invalid.');

  const criteriaById = new Map();
  criteria.forEach(criterion => {
    if (!isObject(criterion) || !criterion.id || !criterion.label || criteriaById.has(String(criterion.id))) {
      throw new Error('Traveler criteria are invalid.');
    }
    criteriaById.set(String(criterion.id), criterion);
  });

  const ranks = new Set();
  const keys = new Set();
  const joinedOptions = options.map(option => {
    const key = optionKey(option);
    const validIdentity = option?.type === 'single'
      ? Boolean(option.destination_id && !option.circuit_id)
      : option?.type === 'circuit' && Boolean(option.circuit_id && !option.destination_id);
    if (!isObject(option) || !validIdentity || !key || !option.name
      || !Number.isInteger(option.rank) || option.rank < 1 || option.rank > 3
      || ranks.has(option.rank) || keys.has(key)) {
      throw new Error('Recommendation option identity or rank is invalid.');
    }
    ranks.add(option.rank);
    keys.add(key);

    if (!Array.isArray(option.evaluations) || option.evaluations.length !== criteria.length) {
      throw new Error('Recommendation evaluations are incomplete.');
    }
    const seenCriteria = new Set();
    const evaluations = option.evaluations.map(evaluation => {
      const criterionId = String(evaluation?.criterion_id ?? '');
      if (!isObject(evaluation) || !criteriaById.has(criterionId) || seenCriteria.has(criterionId)
        || !OUTCOMES.has(evaluation.outcome) || !evaluation.conclusion
        || !Array.isArray(evaluation.details) || evaluation.details.length === 0
        || evaluation.details.some(detail => !validDetail(detail))) {
        throw new Error('Recommendation evaluation references or details are invalid.');
      }
      seenCriteria.add(criterionId);
      return { ...evaluation, criterion: criteriaById.get(criterionId) };
    });

    return { ...option, key, evaluations, prototype: metadataByOption[key] ?? null };
  }).sort((a, b) => a.rank - b.rank);

  if (joinedOptions.some((option, index) => option.rank !== index + 1)) {
    throw new Error('Recommendation ranks must be sequential.');
  }
  return { status: payload.status, message: payload.message ?? '', criteria, options: joinedOptions };
}

export function safeRecommendationViewModel(payload, metadataByOption = {}) {
  try {
    return { data: recommendationViewModel(payload, metadataByOption), error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Recommendation response is invalid.' };
  }
}

const FAILURE_STATUSES = new Set(['HARD_FAIL', 'BUDGET_FAIL', 'CONFLICT_FAIL']);

// A terminal failure carries no options, only an honest explanation and
// optional adjustment suggestions — a distinct, simpler shape from the
// ranked-options view model above.
export function failureOutcomeViewModel(payload) {
  if (!isObject(payload) || !FAILURE_STATUSES.has(payload.status) || !payload.message) {
    throw new Error('Recommendation failure response is invalid.');
  }
  const suggestions = payload.constraint_adjustment_suggestions;
  if (suggestions !== undefined && (!Array.isArray(suggestions) || suggestions.some(item => typeof item !== 'string' || !item))) {
    throw new Error('Constraint adjustment suggestions are invalid.');
  }
  return {
    status: payload.status,
    message: payload.message,
    constraintAdjustmentSuggestions: suggestions ?? [],
  };
}

export function safeFailureOutcomeViewModel(payload) {
  try {
    return { data: failureOutcomeViewModel(payload), error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Recommendation failure response is invalid.' };
  }
}

// Dispatches a raw saved matcher_state.recommendations entry to the right
// safe view model by its status, or reports it as invalid.
// TWM-173: replaces totalPartyEstimate()'s fabricated cost total (the UI's
// own comment called it a heuristic, "not a schema-guaranteed number") with
// an honest count of what Meridian actually declared per criterion — no
// number the agent didn't say.
export function rollupCounts(evaluations) {
  const counts = { MATCH: 0, TRADEOFF: 0, MISMATCH: 0 };
  evaluations.forEach(ev => { if (counts[ev.outcome] !== undefined) counts[ev.outcome] += 1; });
  return counts;
}

const ROLLUP_LABEL = {
  MATCH: ['match', 'matches'],
  TRADEOFF: ['trade-off', 'trade-offs'],
  MISMATCH: ['mismatch', 'mismatches'],
};

export function rollupSummary(evaluations) {
  const counts = rollupCounts(evaluations);
  return ['MATCH', 'TRADEOFF', 'MISMATCH']
    .filter(outcome => counts[outcome] > 0)
    .map(outcome => `${counts[outcome]} ${ROLLUP_LABEL[outcome][counts[outcome] === 1 ? 0 : 1]}`)
    .join(' · ');
}

export function safeMatcherOutcomeViewModel(payload, metadataByOption = {}) {
  if (isObject(payload) && OPTION_STATUSES.has(payload.status)) {
    const result = safeRecommendationViewModel(payload, metadataByOption);
    return { kind: 'options', ...result };
  }
  if (isObject(payload) && FAILURE_STATUSES.has(payload.status)) {
    const result = safeFailureOutcomeViewModel(payload);
    return { kind: 'failure', ...result };
  }
  return { kind: 'options', data: null, error: 'Recommendation response is invalid.' };
}
