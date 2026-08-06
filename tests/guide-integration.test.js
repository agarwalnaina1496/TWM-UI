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

assert.match(html, /sendDeterministicCommand\('start_planning'/);
assert.match(html, /sendDeterministicCommand\('approve_places'/);
assert.match(html, /session\.state\?\.phase === 'PLACES_DRAFT'/);
const approveSource = extractFunction('approveGuidePlaces');
assert.match(approveSource, /pendingRetryTurn\.command === 'approve_places'[\s\S]*idempotencyKey: retryKey/);
assert.match(approveSource, /!card\?\.classList\.contains\('is-stale'\)[\s\S]*pendingRetryTurn\.command === 'approve_places'[\s\S]*if \(!outcome\.ok && canRetryApproval\)/);
const conflictSource = extractFunction('handleTripConflict');
assert.match(conflictSource, /document\.querySelector\('\.guide-card:not\(\.is-stale\)'\)[\s\S]*visibleRevision = visibleCard\?\.dataset\.guideRevision/);
assert.match(conflictSource, /visibleRevision === String\(session\.revision\)[\s\S]*removeAttribute\('aria-disabled'\)[\s\S]*button\.disabled = false/);
assert.match(conflictSource, /else \{[\s\S]*deactivateOlderGuideCards\(\)[\s\S]*renderGuidePlacesCard\(session\.state, session\.revision\)/);
assert.match(conflictSource, /phase === 'DAY_PLAN_DRAFT' \|\| session\?\.state\?\.phase === 'PLAN_APPROVED'[\s\S]*deactivateOlderGuideCards\(\)/);
assert.doesNotMatch(html, /function guideRequest\b/);
assert.doesNotMatch(html, /function callGuide\b/);
assert.doesNotMatch(html, /saveTripState/);

const cardSource = extractFunction('renderGuidePlacesCard');
assert.match(cardSource, /escapeHtml\(destinations\)/);
assert.match(cardSource, /escapeHtml\(place\)/);
assert.match(cardSource, /<h3 class="guide-card-title" id="guide-card-title-\$\{revision\}">Trip Design<\/h3>/);
assert.match(cardSource, /aria-labelledby="guide-card-title-\$\{revision\}"/);
assert.match(extractFunction('deactivateOlderGuideCards'), /aria-disabled/);
assert.match(html, /\.guide-card-btn \{ min-height: 44px;/);
assert.match(html, /\.guide-card-actions \.guide-card-btn \{ flex: 1 1 130px; \}/);

const calls = [];
const guideSessions = new Map();
const context = vm.createContext({
  activeAgentFromState: () => null,
  appendMsg: (role, message) => calls.push(['message', role, message]),
  guideSession: tripId => guideSessions.get(tripId),
  hasTripContext: () => true,
  renderGuidePlacesCard: state => calls.push(['places', state.phase]),
  renderTripContextCard: options => calls.push(['context', options]),
});
vm.runInContext("let currentTripId = 'trip-1'; let tripState = { stage: 'planning' };", context);
vm.runInContext(extractFunction('resumeChat'), context);

guideSessions.set('trip-1', {
  revision: 2,
  state: {
    phase: 'NEEDS_CLARIFICATION',
    pending_clarification: 'Which temple style do you prefer?',
  },
});
context.resumeChat();
assert.deepEqual(plain(calls), [
  ['context', { showContinue: false }],
  ['message', 'assistant', 'Which temple style do you prefer?'],
]);

calls.length = 0;
guideSessions.set('trip-1', {
  revision: 3,
  state: { phase: 'PLACES_DRAFT', pending_clarification: null },
});
context.resumeChat();
assert.deepEqual(plain(calls), [
  ['context', { showContinue: false }],
  ['message', 'assistant', 'Continue refining your latest places draft here.'],
  ['places', 'PLACES_DRAFT'],
]);

console.log('Guide command integration tests passed.');
