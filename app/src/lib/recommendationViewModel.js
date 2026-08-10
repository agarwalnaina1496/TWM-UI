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

export function recommendationViewModel(payload, metadataByOption = {}) {
  if (!isObject(payload) || payload.status !== 'SUCCESS') throw new Error('Recommendation response is invalid.');
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
  return { message: payload.message ?? '', criteria, options: joinedOptions };
}

export function safeRecommendationViewModel(payload, metadataByOption = {}) {
  try {
    return { data: recommendationViewModel(payload, metadataByOption), error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Recommendation response is invalid.' };
  }
}
