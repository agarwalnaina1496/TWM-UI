const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

assert.match(html, /function acceptAuthoritativeTrip\(record\)/);
assert.match(html, /acceptAuthoritativeTrip\(result\.trip\)/);
assert.match(html, /currentRecos = latestRecommendation\(\)/);
assert.doesNotMatch(html, /function applyStateDelta\b/);
assert.doesNotMatch(html, /function deepMergeStateBranch\b/);
assert.doesNotMatch(html, /tripState\.stage\s*=(?!=)/);
assert.doesNotMatch(html, /tripState\.trip_context\.selected_option\s*=(?!=)/);

console.log('Backend-owned conversation phase tests passed.');
