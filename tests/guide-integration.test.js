const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function extractFunction(name) {
  const asyncStart = html.indexOf(`async function ${name}(`);
  const start = asyncStart === -1 ? html.indexOf(`function ${name}(`) : asyncStart;
  assert.notEqual(start, -1, `Missing function ${name}`);
  const bodyStart = html.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < html.length; index += 1) {
    if (html[index] === '{') depth += 1;
    if (html[index] === '}') depth -= 1;
    if (depth === 0) return html.slice(start, index + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}

let saveCount = 0;
const responseState = {
  phase: 'PLACES_DRAFT',
  destinations: ['Rishikesh'],
  duration_days: 3,
  start_date: null,
  places: ['Ram Jhula', '<img src=x onerror=alert(1)>'],
  day_plan: [],
  preferences: ['pilgrimage'],
  exclusions: ['rafting'],
  applied_changes: ['Removed rafting'],
  pending_clarification: null
};
let requestBody = null;
const context = vm.createContext({
  API: { guide: 'https://example.test/guide' },
  Error,
  Map,
  Set,
  console,
  fetch: async (url, options) => {
    assert.equal(url, 'https://example.test/guide');
    requestBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ message: 'Draft updated.', guide_state: responseState }) };
  },
  cloneJson: value => JSON.parse(JSON.stringify(value ?? {})),
  apiResponseError: () => new Error('API failure'),
  markBackendActivity: () => {},
  saveTripState: () => { saveCount += 1; }
});

vm.runInContext(`
  let currentTripId = 'trip-1';
  let tripState = { trip_context: { selected_option: { name: 'Rishikesh' }, duration: '3 days' }, planner_state: null };
  const guideSessions = new Map();
  const GUIDE_PHASES = new Set(['NEEDS_CLARIFICATION', 'PLACES_DRAFT', 'DAY_PLAN_DRAFT', 'PLAN_APPROVED']);
`, context);
['isPlainObject', 'guideSession', 'validateGuideState', 'guideRequest', 'callGuide']
  .forEach(name => vm.runInContext(extractFunction(name), context));
vm.runInContext("guideSessions.set('trip-1', { state: null, revision: 0 })", context);

const plain = value => JSON.parse(JSON.stringify(value));
const startRequest = plain(context.guideRequest('START'));
assert.deepEqual(startRequest, {
  event: 'START',
  trip_state: {
    trip_context: { selected_option: { name: 'Rishikesh' }, duration: '3 days' },
    guide_state: {}
  }
});
assert.equal('message' in startRequest, false);

assert.throws(
  () => context.validateGuideState({ ...responseState, phase: 'UNKNOWN' }),
  /invalid phase/
);
assert.throws(
  () => context.validateGuideState({ ...responseState, places: [] }),
  /empty/
);

(async () => {
  await context.callGuide('START');
  assert.deepEqual(requestBody, startRequest);
  assert.deepEqual(plain(vm.runInContext("guideSessions.get('trip-1').state", context)), responseState);
  assert.equal(vm.runInContext("guideSessions.get('trip-1').revision", context), 1);
  assert.equal(saveCount, 1);
  assert.deepEqual(plain(vm.runInContext('tripState.planner_state.guide_session.state', context)), responseState);

  const cardSource = extractFunction('renderGuidePlacesCard');
  assert.match(cardSource, /escapeHtml\(destinations\)/);
  assert.match(cardSource, /escapeHtml\(place\)/);
  assert.equal(cardSource.includes('innerHTML = state'), false);

  const approvalSource = extractFunction('approveGuidePlaces');
  assert.match(approvalSource, /revision !== session\.revision/);
  assert.match(approvalSource, /callGuide\('APPROVE_PLACES'\)/);

  const dispatchSource = extractFunction('dispatchActiveAgentTurn');
  assert.match(dispatchSource, /!session\.state && !message \? 'START' : 'TRAVELER_MESSAGE'/);
  assert.equal(dispatchSource.includes('saveTripState'), false);

  const resumedMessages = [];
  let resumedCardState = null;
  Object.assign(context, {
    activeAgentFromState: () => null,
    renderTripContextCard: () => {},
    appendMsg: (role, message) => resumedMessages.push([role, message]),
    renderGuidePlacesCard: state => { resumedCardState = state; }
  });
  vm.runInContext(extractFunction('resumeChat'), context);
  vm.runInContext(`
    tripState.stage = 'planning';
    guideSessions.set('trip-1', {
      revision: 2,
      state: { ...guideSessions.get('trip-1').state, phase: 'NEEDS_CLARIFICATION', pending_clarification: 'Which temple style do you prefer?' }
    });
    resumeChat();
  `, context);
  assert.deepEqual(resumedMessages.pop(), ['assistant', 'Which temple style do you prefer?']);
  assert.equal(resumedCardState, null);

  vm.runInContext(`
    guideSessions.set('trip-1', {
      revision: 3,
      state: { ...guideSessions.get('trip-1').state, phase: 'PLACES_DRAFT', pending_clarification: null }
    });
    resumeChat();
  `, context);
  assert.equal(resumedMessages.pop()[1], 'Continue refining your latest places draft here.');
  assert.equal(resumedCardState.phase, 'PLACES_DRAFT');

  assert.match(html, /<h3 class="guide-card-title" id="guide-card-title-\$\{revision\}">Trip Design<\/h3>/);
  assert.match(html, /aria-labelledby="guide-card-title-\$\{revision\}"/);
  assert.match(extractFunction('deactivateOlderGuideCards'), /aria-disabled/);
  assert.match(html, /\.guide-card-btn \{ min-height: 44px;/);
  assert.match(html, /\.guide-card-actions \.guide-card-btn \{ flex: 1 1 130px; \}/);

  console.log('Guide integration tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
