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

const context = vm.createContext({ Date });
[
  'isPlainObject',
  'normalizedAgentMeta',
  'debugAgentMeta',
  'tripPromptProvenance',
  'normalizeScoutResponse',
  'recommendationPayloadFromMeridian'
].forEach(name => vm.runInContext(extractFunction(name), context));

const validScout = { agent: 'scout', prompt_version: ' 1.2.3 ' };
assert.deepEqual(
  { ...context.normalizedAgentMeta(validScout, 'scout') },
  { agent: 'scout', prompt_version: '1.2.3' }
);
assert.equal(context.normalizedAgentMeta({ agent: 'meridian', prompt_version: '1.0.0' }, 'scout'), null);
assert.equal(context.normalizedAgentMeta({ agent: 'scout', prompt_version: '' }, 'scout'), null);

const scoutResponse = context.normalizeScoutResponse({
  intent: 'advise',
  message: 'Advice',
  agent_meta: validScout,
  state_delta: {}
});
assert.deepEqual(
  { ...scoutResponse.state_delta.advisor_state.artifacts[0].agent_meta },
  { agent: 'scout', prompt_version: '1.2.3' }
);

const legacyScout = context.normalizeScoutResponse({
  intent: 'advise',
  message: 'Legacy advice',
  state_delta: {}
});
assert.equal('agent_meta' in legacyScout.state_delta.advisor_state.artifacts[0], false);

const meridianPayload = context.recommendationPayloadFromMeridian({
  status: 'SUCCESS',
  state_delta: { matcher_state: {} },
  agent_meta: { agent: 'meridian', prompt_version: '2.0.0' }
});
assert.equal('state_delta' in meridianPayload, false);
assert.deepEqual(
  { ...meridianPayload.agent_meta },
  { agent: 'meridian', prompt_version: '2.0.0' }
);

const legacyProvenance = context.tripPromptProvenance({
  advisor_state: { artifacts: [{ type: 'advice', source: 'scout' }] },
  matcher_state: { recommendations: [{ status: 'SUCCESS' }] }
});
assert.equal(legacyProvenance.scout[0].prompt_version, 'unknown/legacy');
assert.equal(legacyProvenance.meridian[0].prompt_version, 'unknown/legacy');

console.log('Agent provenance tests passed.');
