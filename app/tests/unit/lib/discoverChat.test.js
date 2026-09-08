import { describe, it, expect } from 'vitest';
import { buildRecapTurn, didHandoffOccur } from '../../../src/lib/discoverChat.js';

// TWM-220: buildRecapTurn takes a `TripView` — composed context_recap +
// matcher.last_message.
function recap(entries) {
  return Object.entries(entries).map(([key, value]) => ({ key, label: key, value }));
}
function view({ context = {}, lastMessage } = {}) {
  return { context_recap: recap(context), matcher: { last_message: lastMessage ?? null } };
}

describe('buildRecapTurn', () => {
  it('returns null when there is no context yet — caller shows the cold-open', () => {
    expect(buildRecapTurn(view({}))).toBeNull();
    expect(buildRecapTurn({})).toBeNull();
  });

  it('recaps known facts instead of a generic greeting', () => {
    const text = buildRecapTurn(view({ context: { origin_city: 'Delhi', num_travelers: '2 people' } }));
    expect(text).toContain('Picking up where you left off');
    expect(text).toContain('From Delhi');
    expect(text).toContain('2 people');
  });

  it('appends what is still needed when a question is awaiting', () => {
    const text = buildRecapTurn(view({ context: { origin_city: 'Delhi' } }), { awaiting: 'travel_dates' });
    expect(text).toContain('travel dates');
  });

  it('prefers the real last exchange (matcher.last_message) over the synthesized recap', () => {
    const text = buildRecapTurn(view({ context: { origin_city: 'Delhi' }, lastMessage: 'Got it — Delhi. How many days?' }));
    expect(text).toBe('Got it — Delhi. How many days?');
    expect(text).not.toContain('Picking up where you left off');
  });

  it('falls back to the synthesized recap when no real last message was saved', () => {
    expect(buildRecapTurn(view({ context: { origin_city: 'Delhi' } }))).toContain('Picking up where you left off');
  });

  it('ignores a blank last_message and falls back', () => {
    expect(buildRecapTurn(view({ context: { origin_city: 'Delhi' }, lastMessage: '   ' }))).toContain('Picking up where you left off');
  });
});

describe('didHandoffOccur', () => {
  it('is true for the scout -> meridian and scout -> guide transitions', () => {
    expect(didHandoffOccur('scout', 'meridian')).toBe(true);
    expect(didHandoffOccur('scout', 'guide')).toBe(true);
  });

  it('is false for every other transition', () => {
    expect(didHandoffOccur('meridian', 'meridian')).toBe(false);
    expect(didHandoffOccur('guide', 'guide')).toBe(false);
    expect(didHandoffOccur(null, 'scout')).toBe(false);
    expect(didHandoffOccur('meridian', 'guide')).toBe(false);
    expect(didHandoffOccur(undefined, undefined)).toBe(false);
  });
});
