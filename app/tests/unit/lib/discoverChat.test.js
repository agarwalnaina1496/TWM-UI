import { describe, it, expect } from 'vitest';
import { buildRecapTurn, buildFactsPanel, didHandoffOccur } from '../../../src/lib/discoverChat.js';

describe('buildRecapTurn', () => {
  it('returns null when there is no persisted context yet — caller shows the cold-open greeting', () => {
    expect(buildRecapTurn({ trip_context: {} })).toBeNull();
    expect(buildRecapTurn({})).toBeNull();
  });

  it('recaps known facts instead of a generic greeting', () => {
    const text = buildRecapTurn({ trip_context: { origin: 'Delhi', travelers: 2 } });
    expect(text).toContain('Picking up where you left off');
    expect(text).toContain('From Delhi');
    expect(text).toContain('2 travelers');
  });

  it('appends what is still needed when a question is awaiting an answer', () => {
    const text = buildRecapTurn({ trip_context: { origin: 'Delhi' } }, { awaiting: 'travel_dates' });
    expect(text).toContain('travel dates');
  });

  it('recaps even with an empty trip_context object as long as some other context exists', () => {
    const text = buildRecapTurn({ trip_context: { origin: 'Delhi' } });
    expect(text).not.toBeNull();
  });
});

describe('buildFactsPanel', () => {
  it('renders only known fields, no placeholder rows for missing ones', () => {
    const panel = buildFactsPanel({ origin: 'Delhi', travelers: 2 });
    expect(panel).toEqual([
      { key: 'origin', label: 'From', value: 'Delhi' },
      { key: 'travelers', label: 'Travelers', value: '2 travelers' },
    ]);
  });

  it('is empty for no context', () => {
    expect(buildFactsPanel({})).toEqual([]);
    expect(buildFactsPanel(undefined)).toEqual([]);
  });

  it('pluralizes duration_days and travelers correctly at 1', () => {
    const panel = buildFactsPanel({ duration_days: 1, travelers: 1 });
    expect(panel).toEqual([
      { key: 'duration_days', label: 'Duration', value: '1 day' },
      { key: 'travelers', label: 'Travelers', value: '1 traveler' },
    ]);
  });
});

describe('didHandoffOccur', () => {
  it('is true only for the exact scout -> meridian transition', () => {
    expect(didHandoffOccur('scout', 'meridian')).toBe(true);
  });

  it('is false for every other transition, including no-op re-renders', () => {
    expect(didHandoffOccur('meridian', 'meridian')).toBe(false);
    expect(didHandoffOccur(null, 'scout')).toBe(false);
    expect(didHandoffOccur('scout', 'guide')).toBe(false);
    expect(didHandoffOccur(undefined, undefined)).toBe(false);
  });
});
