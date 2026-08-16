const assert = require('node:assert/strict');

process.env.TWM_BASE_URL = 'https://travelwithme-dev.onrender.com';
const authProxy = require('../api/auth-proxy');

let upstreamRequest;
function mockFetch(status, { setCookie, body = '{}' } = {}) {
  global.fetch = async (url, options) => {
    upstreamRequest = { url: String(url), options };
    return {
      status,
      headers: {
        get: name => ({
          'content-type': 'application/json',
          ...(setCookie ? { 'set-cookie': setCookie } : {}),
        })[name.toLowerCase()] || null,
        getSetCookie: () => (setCookie ? [setCookie] : []),
      },
      text: async () => body,
    };
  };
}

function mockResponse() {
  const headers = new Map();
  return {
    headers,
    statusCode: null,
    body: null,
    setHeader: (name, value) => headers.set(name, value),
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
    json(body) { this.body = body; return this; },
  };
}

(async () => {
  // POST /api/auth/login forwards to /auth/login, forwards the request
  // cookie upstream, and relays the Set-Cookie (the JWT cookie) back.
  mockFetch(200, { setCookie: 'twm_auth=opaque; Path=/; HttpOnly; Secure; SameSite=lax', body: '{"id":"u1","email":"traveler@example.com","claimed_trip_count":0}' });
  const loginResponse = mockResponse();
  await authProxy({
    method: 'POST',
    query: { path: 'login' },
    headers: { cookie: 'twm_guest=existing', 'content-type': 'application/json' },
    body: { email: 'traveler@example.com', password: 'hunter22!!' },
  }, loginResponse);

  assert.equal(upstreamRequest.url, 'https://travelwithme-dev.onrender.com/auth/login');
  assert.equal(upstreamRequest.options.method, 'POST');
  assert.equal(upstreamRequest.options.headers.Cookie, 'twm_guest=existing');
  assert.equal(upstreamRequest.options.body, JSON.stringify({ email: 'traveler@example.com', password: 'hunter22!!' }));
  assert.equal(loginResponse.statusCode, 200);
  assert.deepEqual(loginResponse.headers.get('Set-Cookie'), ['twm_auth=opaque; Path=/; HttpOnly; Secure; SameSite=lax']);
  assert.equal(loginResponse.headers.get('Cache-Control'), 'no-store');

  // GET /api/auth/me forwards to /auth/me with no body.
  mockFetch(200, { body: '{"id":"u1","email":"traveler@example.com"}' });
  const meResponse = mockResponse();
  await authProxy({ method: 'GET', query: { path: 'me' }, headers: { cookie: 'twm_auth=opaque' } }, meResponse);

  assert.equal(upstreamRequest.url, 'https://travelwithme-dev.onrender.com/auth/me');
  assert.equal(upstreamRequest.options.body, undefined);
  assert.equal(meResponse.statusCode, 200);

  // A non-GET/POST method is rejected before ever reaching upstream.
  const rejected = mockResponse();
  await authProxy({ method: 'DELETE', query: { path: 'me' }, headers: {} }, rejected);
  assert.equal(rejected.statusCode, 405);

  // An upstream failure (network error, DNS, etc.) surfaces as a clean 502,
  // not an unhandled exception.
  global.fetch = async () => { throw new Error('network unreachable'); };
  const failed = mockResponse();
  await authProxy({ method: 'POST', query: { path: 'login' }, headers: {}, body: {} }, failed);
  assert.equal(failed.statusCode, 502);

  console.log('Auth proxy tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
