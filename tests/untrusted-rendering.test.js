const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
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

const context = vm.createContext({});
vm.runInContext(extractFunction('escapeHtml'), context);
vm.runInContext(extractFunction('md'), context);

const payloads = [
  `"><img src=x onerror=alert(1)>`,
  `');window.__owned=true;//`,
  `<script>window.__owned=true</script>`,
  `javascript:alert(1)`,
  `Uttarakhand 🏔️ \u202Etxt`
];

for (const payload of payloads) {
  const rendered = context.md(payload);
  assert.equal(rendered.includes('<script'), false);
  assert.equal(rendered.includes('<img'), false);
}
assert.match(context.md('**safe**'), /<strong>safe<\/strong>/);

// No traveler/model value may be interpolated into executable inline handlers.
assert.equal(/on\w+="[^"]*\$\{/.test(html), false);
assert.equal(/(?:href|src)="[^"]*\$\{/.test(html), false);
assert.equal(/javascript:/i.test(html), false);
assert.equal(html.includes('function jsArg('), false);
assert.equal(extractFunction('renderRecos').includes('addEventListener'), true);
assert.equal(extractFunction('renderRecommendationDetail').includes('addEventListener'), true);
assert.match(html, /row\.querySelector\('\[data-action="review-recommendations"\]'\)\?\.addEventListener/);
assert.equal(extractFunction('renderTripsList').includes('bindTripCardActions'), true);

// Saved trip identifiers remain inert and are passed through closures unchanged.
const calls = [];
const listeners = new Map();
const actionButton = {
  dataset: { tripAction: 'recommendations' },
  addEventListener: (name, handler) => listeners.set(`action:${name}`, handler)
};
const renameButton = { addEventListener: (name, handler) => listeners.set(`rename:${name}`, handler) };
const deleteButton = { addEventListener: (name, handler) => listeners.set(`delete:${name}`, handler) };
const title = {};
const card = {
  dataset: { cardAction: '' },
  querySelectorAll: selector => selector === '[data-trip-action]' ? [actionButton] : [],
  querySelector: selector => ({
    '.rename-btn': renameButton,
    '.icon-btn.danger': deleteButton,
    '.tc-name-text': title
  })[selector] || null,
  addEventListener: () => assert.fail('Dual-action card must not bind a card action')
};
Object.assign(context, {
  navigate: screen => calls.push(['navigate', screen]),
  openTripRecos: id => calls.push(['recommendations', id]),
  openTripForPlanning: id => calls.push(['planning', id]),
  openTrip: id => calls.push(['chat', id]),
  startRename: id => calls.push(['rename', id]),
  confirmDeleteTrip: id => calls.push(['delete', id])
});
vm.runInContext(extractFunction('runTripAction'), context);
vm.runInContext(extractFunction('bindTripCardActions'), context);

const maliciousId = `trip-');window.__owned=true;//`;
context.bindTripCardActions(card, { id: maliciousId });
listeners.get('action:click')({ stopPropagation() {} });
listeners.get('rename:click')({ stopPropagation() {} });
listeners.get('delete:click')({ stopPropagation() {} });
assert.deepEqual(calls, [
  ['recommendations', maliciousId],
  ['rename', maliciousId],
  ['delete', maliciousId]
]);

console.log('Untrusted rendering tests passed.');
