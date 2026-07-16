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

const storage = new Map();
const context = vm.createContext({
  Error,
  localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value)
  },
  syncTripFromState: () => {},
  renderStateBar: () => {}
});
vm.runInContext("let tripState = null; const STATE_KEY = 'state:';", context);
[
  'defaultState',
  'loadTripState',
  'saveTripState',
  'isMeridianBusinessStatus',
  'activeAgentFromState',
  'setActiveAgent',
  'applyMeridianRoutingOutcome',
  'applyRoutingFromScoutIntent',
  'scoutRequestFromState',
  'meridianTripContextFromState',
  'meridianAdvisorStateFromState',
  'meridianRequestFromState',
  'dispatchActiveAgentTurn'
].forEach(name => vm.runInContext(extractFunction(name), context));

const plain = value => JSON.parse(JSON.stringify(value));

vm.runInContext("tripState = defaultState('trip-1')", context);
assert.equal(vm.runInContext('tripState.active_agent', context), 'scout');
assert.equal(vm.runInContext('activeAgentFromState()', context), 'scout');

vm.runInContext("applyRoutingFromScoutIntent('matcher')", context);
assert.equal(vm.runInContext('tripState.stage', context), 'matching');
assert.equal(vm.runInContext('tripState.active_agent', context), 'meridian');
assert.equal(vm.runInContext('activeAgentFromState()', context), 'meridian');

vm.runInContext("applyMeridianRoutingOutcome('NEEDS_CLARIFICATION')", context);
assert.equal(vm.runInContext('tripState.active_agent', context), 'meridian');
vm.runInContext('saveTripState()', context);
vm.runInContext('tripState = loadTripState(\'trip-1\')', context);
assert.equal(vm.runInContext('tripState.active_agent', context), 'meridian');

vm.runInContext("applyMeridianRoutingOutcome('SUCCESS')", context);
assert.equal(vm.runInContext('tripState.active_agent', context), null);

for (const status of ['SOFT_FAIL', 'HARD_FAIL', 'BUDGET_FAIL', 'CONFLICT_FAIL']) {
  vm.runInContext("setActiveAgent('meridian')", context);
  vm.runInContext(`applyMeridianRoutingOutcome('${status}')`, context);
  assert.equal(vm.runInContext('tripState.active_agent', context), null);
}

vm.runInContext("tripState = defaultState('trip-2')", context);
assert.equal(vm.runInContext('tripState.active_agent', context), 'scout');

vm.runInContext("setActiveAgent('meridian')", context);
const scoutPayload = plain(vm.runInContext("scoutRequestFromState(tripState, 'entry')", context));
assert.equal('active_agent' in scoutPayload.trip_state, false);

const meridianPayload = plain(vm.runInContext("meridianRequestFromState(tripState, 'refine')", context));
assert.equal('active_agent' in meridianPayload.trip_state, false);
assert.equal(meridianPayload.message, 'refine');
assert.deepEqual(Object.keys(meridianPayload.trip_state).sort(), [
  'advisor_state',
  'matcher_state',
  'trip_context'
]);

assert.throws(
  () => vm.runInContext("applyMeridianRoutingOutcome('UNKNOWN')", context),
  /Unexpected Meridian status/
);

context.callScout = async () => assert.fail('Scout must not receive an active Meridian turn');
context.callMeridian = async message => ({ status: 'NEEDS_CLARIFICATION', message: null, received: message });
context.appendMsg = () => {};
context.hasRecommendations = () => false;
context.renderInlineCta = () => {};
context.reviewRecosOnlyCtaHtml = () => '';
context.handleScoutResult = value => value;
vm.runInContext("tripState.stage = 'matching'; tripState.active_agent = 'meridian'", context);

(async () => {
  const result = await context.dispatchActiveAgentTurn('clarification answer');
  assert.equal(result.received, 'clarification answer');

  context.callScout = async message => ({ intent: null, message: null, received: message });
  context.callMeridian = async () => assert.fail('Meridian must not receive a fresh Scout turn');
  context.handleScoutResult = (value, message) => ({ ...value, handledMessage: message });
  vm.runInContext("tripState = defaultState('trip-3')", context);
  const scoutResult = await context.dispatchActiveAgentTurn('new entry turn');
  assert.equal(scoutResult.received, 'new entry turn');
  assert.equal(scoutResult.handledMessage, 'new entry turn');

  console.log('Active-agent routing tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
