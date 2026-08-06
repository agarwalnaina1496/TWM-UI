const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const proxy = fs.readFileSync(path.join(root, 'api', 'trip-proxy.js'), 'utf8');

assert.match(html, /trips:\s*'\/api\/trips'/);
assert.match(html, /credentials:\s*'include'/);
assert.match(html, /expected_version:\s*record\.version/);
assert.match(html, /tripApi\(`\/\$\{tripId\}\/commands`/);
assert.match(html, /tripApi\(`\/\$\{id\}\/ui-state`/);
assert.match(html, /idempotency_key:\s*idempotencyKey/);
assert.match(html, /kind:\s*'command'[\s\S]*idempotencyKey[\s\S]*onSuccess/);
assert.match(html, /retry\.kind === 'command'[\s\S]*sendDeterministicCommand\(retry\.command, retry\)/);
assert.match(html, /pendingRetryTurn\.command === 'select_destination'[\s\S]*pendingRetryTurn\.idempotencyKey/);
assert.match(html, /async function handleTripConflict[\s\S]*currentRecos = latestRecommendation\(\)[\s\S]*renderRecos\(currentRecos\)/);
assert.match(html, /textarea id="userInput" aria-label="Message Scout"/);
assert.match(html, /button class="send-btn"[^>]*aria-label="Send message"/);
assert.match(html, /typing-row" id="typingRow" role="status" aria-live="polite"/);
assert.match(html, /<button class="home-mod" type="button"/);
const homeButtonContent = html.match(/<button class="home-mod"[^>]*>([\s\S]*?)<\/button>/)?.[1] || '';
assert.doesNotMatch(homeButtonContent, /<\/?(?:div|h2|p)\b/);
assert.doesNotMatch(html, /<a class="brand" onclick=/);
assert.match(html, /<button class="plans-skip" type="button"/);
assert.match(html, /function clearChat\(\)[\s\S]*setSendDisabled\(busy\)/);
assert.doesNotMatch(html, /method:\s*'PUT'/);
assert.doesNotMatch(html, /body:\s*JSON\.stringify\(\{[^}]*trip_state/s);
assert.match(html, /planner_state[\s\S]*guide_session/);
assert.equal(html.includes('twm_trips_v1'), false);
assert.equal(html.includes('UI_STATE_KEY'), false);
assert.equal(html.includes('STATE_KEY'), false);
assert.equal(html.includes('title="Delete"'), false);

assert.deepEqual(vercel.rewrites, [
  { source: '/api/trips', destination: '/api/trip-proxy' },
  { source: '/api/trips/:path*', destination: '/api/trip-proxy?path=:path*' },
]);
assert.match(proxy, /process\.env\.TWM_BASE_URL/);
assert.match(proxy, /headers\.Cookie = req\.headers\.cookie/);
assert.match(proxy, /res\.setHeader\('Set-Cookie', setCookies\)/);
assert.match(proxy, /Cache-Control', 'no-store'/);

console.log('Trip persistence tests passed.');
