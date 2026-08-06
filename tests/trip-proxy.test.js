const assert = require('node:assert/strict');

process.env.TWM_BASE_URL = 'https://travelwithme-dev.onrender.com';
const tripProxy = require('../api/trip-proxy');

let upstreamRequest;
global.fetch = async (url, options) => {
  upstreamRequest = { url: String(url), options };
  return {
    status: 200,
    headers: {
      get: name => ({
        'content-type': 'application/json',
        'set-cookie': 'twm_guest=opaque; Path=/; HttpOnly; Secure; SameSite=lax',
      })[name.toLowerCase()] || null,
      getSetCookie: () => ['twm_guest=opaque; Path=/; HttpOnly; Secure; SameSite=lax'],
    },
    text: async () => '{"trips":[]}',
  };
};

const responseHeaders = new Map();
const response = {
  statusCode: null,
  body: null,
  setHeader: (name, value) => responseHeaders.set(name, value),
  status(code) { this.statusCode = code; return this; },
  send(body) { this.body = body; return this; },
  json(body) { this.body = body; return this; },
};

(async () => {
  await tripProxy({
    method: 'GET',
    query: { path: 'trip-id' },
    headers: { cookie: 'twm_guest=existing' },
  }, response);

  assert.equal(upstreamRequest.url, 'https://travelwithme-dev.onrender.com/trips/trip-id');
  assert.equal(upstreamRequest.options.headers.Cookie, 'twm_guest=existing');
  assert.equal(response.statusCode, 200);
  assert.equal(response.body, '{"trips":[]}');
  assert.deepEqual(responseHeaders.get('Set-Cookie'), [
    'twm_guest=opaque; Path=/; HttpOnly; Secure; SameSite=lax',
  ]);
  assert.equal(responseHeaders.get('Cache-Control'), 'no-store');

  console.log('Trip proxy tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
