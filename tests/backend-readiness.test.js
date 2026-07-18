const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function extractFunction(name) {
  const asyncStart = html.indexOf(`async function ${name}(`);
  const start = asyncStart === -1 ? html.indexOf(`function ${name}(`) : asyncStart;
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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

(async () => {
  const storage = new Map();
  const elements = new Map();
  const typing = {};
  const inner = {
    insertBefore(row) {
      elements.set(row.id, row);
      row.remove = () => elements.delete(row.id);
    }
  };
  elements.set('chatInner', inner);
  elements.set('typingRow', typing);

  let now = 1_000_000;
  let fetchCalls = 0;
  let nextFetch = deferred();
  let timerCallback = null;
  const context = vm.createContext({
    API: { health: 'https://backend.test/health' },
    BACKEND_ACTIVITY_KEY: 'backend-activity',
    BACKEND_IDLE_MS: 14 * 60 * 1000,
    READINESS_STATUS_DELAY_MS: 1200,
    Date: { now: () => now },
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value)
    },
    fetch: () => {
      fetchCalls += 1;
      return nextFetch.promise;
    },
    document: {
      getElementById: id => elements.get(id) ?? null,
      createElement: () => ({ id: null, className: '', innerHTML: '' })
    },
    setTimeout: callback => {
      timerCallback = callback;
      return 1;
    },
    clearTimeout: () => { timerCallback = null; },
    scrollChat: () => {}
  });
  vm.runInContext('let backendReadinessPromise = null; let readinessStatusTimer = null;', context);
  [
    'lastBackendActivityAt',
    'markBackendActivity',
    'backendNeedsReadiness',
    'apiResponseError',
    'prepareBackendForChat',
    'clearReadinessStatus',
    'showReadinessStatus',
    'waitForBackendReadinessForTurn'
  ].forEach(name => vm.runInContext(extractFunction(name), context));

  assert.equal(fetchCalls, 0, 'Loading readiness code must not contact the Backend');
  assert.equal(context.backendNeedsReadiness(now), true);

  const first = context.prepareBackendForChat();
  const duplicate = context.prepareBackendForChat();
  assert.strictEqual(first, duplicate);
  assert.equal(fetchCalls, 1, 'Concurrent chat intent must share one readiness request');

  const waitingTurn = context.waitForBackendReadinessForTurn();
  assert.equal(fetchCalls, 1);
  assert.equal(typeof timerCallback, 'function');
  timerCallback();
  assert.ok(elements.get('backend-readiness-status'));

  nextFetch.resolve({ ok: true, status: 200 });
  await waitingTurn;
  assert.equal(elements.has('backend-readiness-status'), false);
  assert.equal(context.backendNeedsReadiness(now), false);

  now += 14 * 60 * 1000 - 1;
  assert.equal(context.backendNeedsReadiness(now), false);
  now += 1;
  assert.equal(context.backendNeedsReadiness(now), true);

  nextFetch = deferred();
  const failed = context.waitForBackendReadinessForTurn();
  timerCallback();
  assert.ok(elements.get('backend-readiness-status'));
  nextFetch.reject(new Error('offline'));
  await assert.rejects(failed, /offline/);
  assert.equal(elements.has('backend-readiness-status'), false);

  nextFetch = deferred();
  const recovered = context.prepareBackendForChat();
  assert.equal(fetchCalls, 3, 'A failed readiness request must allow a later recovery attempt');
  nextFetch.resolve({ ok: true, status: 200 });
  await recovered;

  assert.match(extractFunction('callScout'), /markBackendActivity\(\)/);
  assert.match(extractFunction('callMeridian'), /markBackendActivity\(\)/);
  const sendStart = html.indexOf('async function sendActiveAgentMessage(');
  const sendEnd = html.indexOf('function turnFailurePresentation(', sendStart);
  const sendSource = html.slice(sendStart, sendEnd);
  assert.ok(sendSource.indexOf('await waitForBackendReadinessForTurn()') < sendSource.indexOf('dispatchActiveAgentTurn(msg)'));
  assert.equal(sendSource.includes("appendMsg('user'"), false);
  assert.match(extractFunction('handleSend'), /waitForReadiness:\s*true/);
  assert.match(html, /addEventListener\('focus', warmBackendOnChatIntent\)/);
  assert.match(html, /addEventListener\('input'/);
  assert.equal(html.includes('setInterval('), false);

  console.log('Backend readiness tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
