const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

assert.match(html, /sendDeterministicCommand\('start_planning'/);
assert.match(html, /sendDeterministicCommand\('approve_places'/);
assert.match(html, /session\.state\?\.phase === 'PLACES_DRAFT'/);
assert.doesNotMatch(html, /function guideRequest\b/);
assert.doesNotMatch(html, /function callGuide\b/);
assert.doesNotMatch(html, /saveTripState/);

console.log('Guide command integration tests passed.');
