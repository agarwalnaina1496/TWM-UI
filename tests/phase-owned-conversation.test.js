const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

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

const calls = [];
const context = vm.createContext({
  calls,
  PLANNER_COMING_SOON_MESSAGE: 'Planning is coming soon.',
  escapeHtml: value => String(value),
  appendMsg: (role, message) => calls.push(['message', role, message]),
  hasTripContext: () => true,
  renderTripContextCard: options => calls.push(['context', options]),
  replayLatestAdvisorAdvice: () => {
    calls.push(['advisor']);
    return true;
  },
  replayMatcherContext: () => {
    calls.push(['matcher']);
    return true;
  },
  hasRecommendations: () => true,
  renderInlineCta: htmlValue => calls.push(['cta', htmlValue]),
  reviewLatestMatchCtaHtml: () => 'review outcome'
});
vm.runInContext('let tripState = null;', context);
[
  'isMeridianBusinessStatus',
  'isMeridianFailureStatus',
  'meridianOutcomeHeading',
  'meridianSectionPoints',
  'shouldStoreMeridianOutput',
  'activeAgentFromState',
  'chatComposerPlaceholder',
  'phaseContextFallback',
  'latestRecommendation',
  'latestMatchReviewLabel',
  'responseMessageForIntent',
  'renderFailureRecos',
  'resumeChat'
].forEach(name => vm.runInContext(extractFunction(name), context));

for (const status of ['SUCCESS', 'SOFT_FAIL', 'HARD_FAIL', 'BUDGET_FAIL', 'CONFLICT_FAIL']) {
  assert.equal(context.shouldStoreMeridianOutput({ status }), true);
}
assert.equal(context.shouldStoreMeridianOutput({ status: 'NEEDS_CLARIFICATION' }), false);
assert.equal(context.shouldStoreMeridianOutput({ status: 'UNKNOWN' }), false);

assert.equal(context.meridianOutcomeHeading('BUDGET_FAIL'), 'The current budget needs adjusting');
assert.equal(context.meridianOutcomeHeading('CONFLICT_FAIL'), 'Some trip preferences conflict');
assert.deepEqual(plain(context.meridianSectionPoints({
  type: 'stops',
  stops: [{ name: 'Kaza', nights: 2, what_it_offers: 'Monasteries and villages' }]
})), ['Kaza, 2 nights, Monasteries and villages']);
assert.deepEqual(plain(context.meridianSectionPoints({
  type: 'internal_travel',
  legs: [{ from: 'Kaza', to: 'Manali', duration: '6 hours', mode: 'road' }]
})), ['Kaza to Manali, 6 hours, by road']);
assert.deepEqual(plain(context.meridianSectionPoints({ type: 'season', points: ['Best in summer'] })), ['Best in summer']);
assert.equal(context.responseMessageForIntent({ intent: 'planner', message: 'ignored' }), 'Planning is coming soon.');

const failureContainer = {};
context.renderFailureRecos(failureContainer, { status: 'HARD_FAIL', message: 'No reliable match.' });
assert.match(failureContainer.innerHTML, /No reliable match yet/);
assert.equal(failureContainer.innerHTML.includes('HARD_FAIL'), false);
assert.equal(failureContainer.innerHTML.includes('Ways to adjust'), false);
context.renderFailureRecos(failureContainer, {
  status: 'BUDGET_FAIL',
  message: 'The budget needs adjusting.',
  constraint_adjustment_suggestions: ['Increase the stay budget.']
});
assert.match(failureContainer.innerHTML, /Ways to adjust/);
assert.match(failureContainer.innerHTML, /Increase the stay budget/);

vm.runInContext("tripState = { stage: 'matching', active_agent: 'meridian', matcher_state: { recommendations: [] } }", context);
assert.equal(context.chatComposerPlaceholder(), 'Reply or refine your destination preferences...');
assert.equal(context.phaseContextFallback(), 'Destination matching is in progress.');

calls.length = 0;
context.resumeChat();
assert.deepEqual(plain(calls), [
  ['context', { showContinue: false }],
  ['matcher']
]);

vm.runInContext("tripState = { stage: 'matching', active_agent: 'scout', matcher_state: { recommendations: [] } }", context);
calls.length = 0;
context.resumeChat();
assert.deepEqual(plain(calls), [
  ['context', { showContinue: true }],
  ['advisor']
]);

vm.runInContext("tripState = { stage: 'recommended', active_agent: null, matcher_state: { recommendations: [{ status: 'BUDGET_FAIL', message: 'The budget needs adjusting.' }] } }", context);
assert.equal(context.latestMatchReviewLabel(), 'Review match outcome');
calls.length = 0;
context.resumeChat();
assert.deepEqual(plain(calls), [
  ['context', { showContinue: false }],
  ['message', 'assistant', 'The budget needs adjusting.'],
  ['cta', 'review outcome']
]);

vm.runInContext("tripState = { stage: 'recommended', active_agent: null, matcher_state: { recommendations: [{ status: 'SUCCESS', message: 'Here are your matches.' }] } }", context);
assert.equal(context.latestMatchReviewLabel(), 'Review recommendations');

vm.runInContext("tripState = { stage: 'planning', active_agent: null, matcher_state: { recommendations: [] } }", context);
assert.equal(context.chatComposerPlaceholder(), 'Tell us what you want help planning...');
assert.equal(context.phaseContextFallback(), 'Planning context is saved for this trip.');

assert.equal(html.includes('match_sections'), false);
assert.equal(html.includes('why_this_works_for_you'), false);
assert.equal(html.includes('failure_sections'), false);
assert.equal(html.includes('refineWithScout'), false);
assert.equal(html.includes('API.planner'), false);
assert.match(html, /retryLastFailedTurn/);
assert.match(html, /constraint_adjustment_suggestions/);

console.log('Phase-owned conversation tests passed.');
