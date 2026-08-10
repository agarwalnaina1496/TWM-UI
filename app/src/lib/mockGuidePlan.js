export const GUIDE_SCENARIO_ID = 'self_led_mp_year_end_couple_v1';

const GOLDEN_BLOCKS = [
  { id: 'gwalior', stop: 'Gwalior', days: 3, places: ['Gwalior Fort', 'Jai Vilas Palace', 'Old-city culture walk'], suggestion: { name: 'Tansen Tomb', reason: 'Adds a quiet music-history stop without changing the route.' } },
  { id: 'orchha', stop: 'Orchha', days: 3, places: ['Orchha Fort complex', 'Ram Raja Temple', 'Cenotaphs and Betwa riverside'], suggestion: { name: 'Betwa sunset walk', reason: 'Fits the easygoing pace and adds riverside downtime.' } },
  { id: 'khajuraho', stop: 'Khajuraho', days: 4, places: ['Western temple group', 'Eastern and Jain temple groups', 'Archaeological Museum', 'Raneh Falls'], suggestion: { name: 'Sound and light show', reason: 'Optional evening culture without crowding a sightseeing day.' } },
  { id: 'panna', stop: 'Panna', days: 3, places: ['Panna reserve and nature', 'Optional morning safari'], suggestion: { name: 'Pandav Falls', reason: 'Adds gentle nature time close to the reserve.' } },
  { id: 'departure', stop: 'Departure buffer', days: 1, places: ['Slow morning and return journey'], suggestion: null },
];

const clone = value => JSON.parse(JSON.stringify(value));
const deepFreeze = value => {
  Object.freeze(value);
  Object.values(value).forEach(child => {
    if (child && typeof child === 'object' && !Object.isFrozen(child)) deepFreeze(child);
  });
  return value;
};
const routeSignature = blocks => blocks.map(block => block.id).join('|');

function summary(blocks, pace) {
  const durationDays = blocks.reduce((total, block) => total + block.days, 0);
  const routeStops = blocks.filter(block => block.id !== 'departure').length;
  const placeCount = blocks.reduce((total, block) => total + block.places.length, 0);
  const estimate = durationDays * 5200;
  return {
    duration_days: durationDays,
    route_stops: routeStops,
    place_count: placeCount,
    rough_group_cost_inr: { low: Math.round(estimate * 0.85 / 1000) * 1000, high: Math.round(estimate * 1.15 / 1000) * 1000 },
    pace,
  };
}

function snapshot(plan) {
  const { history: _history, ...rest } = plan;
  return clone(rest);
}

export function createInitialGuidePlan(trip = {}) {
  const blocks = clone(GOLDEN_BLOCKS);
  const pace = 'Easygoing and balanced — culture, relaxation and nature';
  return {
    status: 'PLAN_DRAFT',
    scenario_id: GUIDE_SCENARIO_ID,
    plan_id: 'guide-mp-14d-v1',
    revision: 1,
    circuit: {
      id: trip.destination?.id || 'gwalior-orchha-khajuraho-panna',
      name: trip.destination?.name || 'Madhya Pradesh Heritage and Nature',
      original_route: GOLDEN_BLOCKS.filter(block => block.id !== 'departure').map(block => block.stop),
    },
    start_date: null,
    end_date: null,
    pace,
    day_blocks: blocks,
    summary: summary(blocks, pace),
    route_warning: null,
    assumptions: ['Dates are optional until transport is chosen.', 'Costs are rough totals for two travelers, before live price checks.'],
    traveler_context: clone(trip.tripContext || {}),
    history: [],
  };
}

function withRevision(plan, mutate) {
  const previous = snapshot(plan);
  const next = clone(plan);
  mutate(next);
  next.revision += 1;
  next.history = [...(plan.history || []), previous].slice(-10);
  next.summary = summary(next.day_blocks, next.pace);
  const currentRoute = next.day_blocks.filter(block => block.id !== 'departure');
  next.route_warning = routeSignature(currentRoute) === routeSignature(GOLDEN_BLOCKS.filter(block => block.id !== 'departure'))
    ? null
    : 'Route order changed. Re-check transfer times before treating this circuit as feasible.';
  return next;
}

function move(items, from, direction) {
  const to = from + direction;
  if (from < 0 || to < 0 || to >= items.length) return items;
  const result = [...items];
  [result[from], result[to]] = [result[to], result[from]];
  return result;
}

export function executeGuideRevision(plan, command) {
  if (!plan || command.expected_revision !== plan.revision) {
    return { status: 'STALE_REVISION', message: 'This change belongs to an older plan revision. Refresh the latest plan before retrying.', authoritative_plan: plan };
  }
  if (command.type === 'UNDO') {
    const history = plan.history || [];
    if (!history.length) return { status: 'INVALID_REVISION', message: 'There is no earlier revision to restore.', authoritative_plan: plan };
    const restored = clone(history.at(-1));
    restored.revision = plan.revision + 1;
    restored.history = history.slice(0, -1);
    return { status: 'SUCCESS', message: 'Previous plan restored.', plan: restored };
  }
  try {
    const next = withRevision(plan, draft => {
      const blockIndex = draft.day_blocks.findIndex(block => block.id === command.block_id);
      if (command.type === 'SET_PACE') draft.pace = command.value;
      else if (command.type === 'SET_START_DATE') {
        draft.start_date = command.value || null;
        draft.end_date = command.value ? new Date(new Date(`${command.value}T00:00:00Z`).getTime() + (draft.summary.duration_days - 1) * 86400000).toISOString().slice(0, 10) : null;
      } else if (command.type === 'SET_BLOCK_DAYS') {
        if (blockIndex < 0 || !Number.isInteger(command.value) || command.value < 1) throw new Error('Each route block needs at least one day.');
        draft.day_blocks[blockIndex].days = command.value;
      } else if (command.type === 'ADD_PLACE') {
        if (blockIndex < 0 || !command.value?.trim()) throw new Error('Choose a route stop and enter a place.');
        draft.day_blocks[blockIndex].places.push(command.value.trim());
      } else if (command.type === 'REMOVE_PLACE') {
        if (blockIndex < 0) throw new Error('Route stop not found.');
        draft.day_blocks[blockIndex].places = draft.day_blocks[blockIndex].places.filter((_, index) => index !== command.index);
      } else if (command.type === 'MOVE_PLACE') {
        if (blockIndex < 0) throw new Error('Route stop not found.');
        draft.day_blocks[blockIndex].places = move(draft.day_blocks[blockIndex].places, command.index, command.direction);
      } else if (command.type === 'MOVE_BLOCK') {
        const movable = draft.day_blocks.filter(block => block.id !== 'departure');
        const from = movable.findIndex(block => block.id === command.block_id);
        const reordered = move(movable, from, command.direction);
        draft.day_blocks = [...reordered, draft.day_blocks.find(block => block.id === 'departure')];
      } else throw new Error('Unsupported Guide revision command.');
    });
    return { status: 'SUCCESS', message: 'Guide revised the plan.', plan: next };
  } catch (error) {
    return { status: 'INVALID_REVISION', message: error.message, authoritative_plan: plan };
  }
}

export function approveGuidePlan(plan) {
  if (!plan || plan.summary.duration_days < 1 || plan.day_blocks.some(block => block.places.length === 0)) {
    return { status: 'INVALID_PLAN', message: 'Every route block needs at least one plan item before generation.' };
  }
  return {
    status: 'PLAN_APPROVED',
    snapshot: deepFreeze({
      ...snapshot(plan),
      status: 'PLAN_APPROVED',
      approved_revision: plan.revision,
      approved_at: 'fixture-time',
    }),
  };
}
