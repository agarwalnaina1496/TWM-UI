const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

assert.match(html, /function tripPromptProvenance\(state = tripState\)/);
assert.match(html, /debugAgentMeta\(item\.agent_meta, 'scout'\)/);
assert.match(html, /debugAgentMeta\(item\?\.agent_meta, 'meridian'\)/);
assert.doesNotMatch(html, /function recordScoutAdvice\b/);
assert.doesNotMatch(html, /function recordMeridianRecommendation\b/);

console.log('Authoritative provenance rendering tests passed.');
