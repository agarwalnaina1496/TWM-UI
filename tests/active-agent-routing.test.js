const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

assert.match(html, /async function sendTripCommand\(command,/);
assert.match(html, /const command = message == null \? 'continue' : 'traveler_message'/);
assert.match(html, /sendTripCommand\(command, \{ message, idempotencyKey \}\)/);
assert.match(html, /const superseded = tripId !== currentTripId;[\s\S]*return \{ \.\.\.result, superseded \}/);
assert.match(html, /if \(!result\.superseded\) presentCommandOutcome\(result\)/);
assert.doesNotMatch(html, /Active trip changed during command execution/);
assert.match(html, /function tagCommandError\(error, tripId\)[\s\S]*error\.tripId = tripId;[\s\S]*error\.superseded = tripId !== currentTripId/);
assert.match(html, /catch \(refreshError\)[\s\S]*throw tagCommandError\(refreshError, tripId\)/);
assert.match(html, /if \(err\.superseded\) return \{ ok: false, error: err, superseded: true \}/);
assert.match(html, /tripId: err\.tripId \|\| currentTripId/);
assert.match(html, /tripId: error\.tripId \|\| currentTripId/);
assert.match(html, /if \(tripId !== currentTripId\) return \{ ok: false, superseded: true \}/);
assert.match(html, /if \(result\.superseded\)[\s\S]*pendingRetryTurn\?\.tripId === tripId/);
assert.doesNotMatch(html, /function (?:callScout|callMeridian|callGuide|setActiveAgent)\b/);
assert.doesNotMatch(html, /API\.(?:scout|meridian|guide)/);
assert.doesNotMatch(html, /tripState\.active_agent\s*=/);

console.log('Backend-owned active-agent routing tests passed.');
