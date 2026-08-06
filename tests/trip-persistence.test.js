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
