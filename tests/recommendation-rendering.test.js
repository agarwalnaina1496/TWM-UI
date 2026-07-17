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

const context = vm.createContext({ Intl, Map, Set, Number });
vm.runInContext(`
  const RECOMMENDATION_OUTCOMES = new Set(['MATCH', 'TRADEOFF', 'MISMATCH']);
  const RECOMMENDATION_DETAIL_TYPES = new Set(['bullets', 'facts', 'cost_breakdown']);
`, context);
['escapeHtml', 'isPlainObject', 'recommendationOptionKey', 'recommendationViewModel', 'validEstimateRange', 'formatEstimateRange', 'recommendationDetailHtml']
  .forEach(name => vm.runInContext(extractFunction(name), context));

function payload() {
  return {
    status: 'SUCCESS',
    message: 'Ranked against what matters to you.',
    traveler_criteria: [
      { id: 'weather', label: 'Comfortable weather', requirement_type: 'PREFERENCE', source_context_paths: ['travel_month'] },
      { id: 'pace', label: 'Relaxed pace', requirement_type: 'HARD', source_context_paths: ['travel_style'] }
    ],
    options: [{
      rank: 1,
      type: 'single',
      destination_id: 'coorg',
      name: 'Coorg',
      summary: 'A compact monsoon escape.',
      evaluations: [
        { criterion_id: 'weather', outcome: 'TRADEOFF', conclusion: 'Expect rain.', details: [{ type: 'facts', facts: [{ label: 'Season', value: 'Monsoon' }] }], tradeoffs: ['Outdoor plans need flexibility.'] },
        { criterion_id: 'pace', outcome: 'MATCH', conclusion: 'Easy to keep relaxed.', details: [{ type: 'bullets', items: ['Short local drives'] }], tradeoffs: [] }
      ],
      other_considerations: ['Start early on weekends.']
    }]
  };
}

const model = context.recommendationViewModel(payload());
assert.equal(model.options[0].evaluations[0].criterion.label, 'Comfortable weather');
assert.equal(model.options[0].evaluations[1].criterion.label, 'Relaxed pace');

const unknown = payload();
unknown.options[0].evaluations[0].criterion_id = 'unknown';
assert.throws(() => context.recommendationViewModel(unknown), /references are invalid/);

const duplicate = payload();
duplicate.options[0].evaluations[1].criterion_id = 'weather';
assert.throws(() => context.recommendationViewModel(duplicate), /references are invalid/);

const incomplete = payload();
incomplete.options[0].evaluations.pop();
assert.throws(() => context.recommendationViewModel(incomplete), /incomplete/);

const noCriteria = payload();
noCriteria.traveler_criteria = [];
assert.throws(() => context.recommendationViewModel(noCriteria), /criteria are missing/);

const escaped = context.recommendationDetailHtml({ type: 'bullets', items: ['<script>alert(1)</script>'] });
assert.equal(escaped.includes('<script>'), false);
assert.match(escaped, /&lt;script&gt;/);

const missingCost = context.recommendationDetailHtml({ type: 'cost_breakdown', currency: 'INR', items: [{ label: 'Stay' }] });
assert.equal(missingCost, '');
assert.equal(missingCost.includes('₹0'), false);

const validCost = context.recommendationDetailHtml({
  type: 'cost_breakdown',
  currency: 'INR',
  items: [{ label: 'Stay', per_person: { minimum: 5000, maximum: 7000 } }],
  per_person_total: { minimum: 5000, maximum: 7000 }
});
assert.match(validCost, /5,000/);
assert.match(validCost, /7,000/);

assert.equal(html.includes('why_ranked_here'), false);
assert.equal(html.includes('decision_summary'), false);
assert.equal(html.includes('best_for'), false);
assert.equal(html.includes('per_person_total||0'), false);
assert.equal((extractFunction('renderRecos') + extractFunction('renderRecommendationDetail')).includes('itinerary'), false);
assert.ok(html.indexOf('preparedMeridianRecommendation(data)') < html.indexOf("applyStateDelta(data.state_delta, 'meridian')"));

console.log('Recommendation rendering tests passed.');
