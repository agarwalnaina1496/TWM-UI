import { describe, expect, it } from 'vitest';
import { approveGuidePlan, createInitialGuidePlan, executeGuideRevision, GUIDE_SCENARIO_ID } from '../../../src/lib/mockGuidePlan.js';

const revise = (plan, command) => executeGuideRevision(plan, { ...command, expected_revision: plan.revision });

describe('mock Guide Plan Builder contract', () => {
  it('creates the duration-only golden Madhya Pradesh allocation', () => {
    const plan = createInitialGuidePlan({ destination: { id: 'gwalior-orchha-khajuraho-panna', name: 'Madhya Pradesh Heritage and Nature' }, tripContext: { original_traveler_request: 'verbatim request' } });
    expect(plan.scenario_id).toBe(GUIDE_SCENARIO_ID);
    expect(plan.start_date).toBeNull();
    expect(plan.summary.duration_days).toBe(14);
    expect(plan.day_blocks.map(block => [block.stop, block.days])).toEqual([['Gwalior', 3], ['Orchha', 3], ['Khajuraho', 4], ['Panna', 3], ['Departure buffer', 1]]);
    expect(plan.traveler_context.original_traveler_request).toBe('verbatim request');
  });

  it('recalculates, warns on route changes, and undo restores the prior revision', () => {
    const initial = createInitialGuidePlan();
    const duration = revise(initial, { type: 'SET_BLOCK_DAYS', block_id: 'gwalior', value: 4 }).plan;
    expect(duration.summary.duration_days).toBe(15);
    const reordered = revise(duration, { type: 'MOVE_BLOCK', block_id: 'orchha', direction: -1 }).plan;
    expect(reordered.route_warning).toMatch(/Route order changed/);
    const undone = revise(reordered, { type: 'UNDO' }).plan;
    expect(undone.day_blocks[0].stop).toBe('Gwalior');
    expect(undone.summary.duration_days).toBe(15);
  });

  it('supports dated plans without requiring dates and rejects stale revisions', () => {
    const initial = createInitialGuidePlan();
    const dated = revise(initial, { type: 'SET_START_DATE', value: '2026-12-20' }).plan;
    expect(dated.end_date).toBe('2027-01-02');
    const stale = executeGuideRevision(dated, { type: 'SET_PACE', value: 'Slower', expected_revision: 1 });
    expect(stale.status).toBe('STALE_REVISION');
    expect(stale.authoritative_plan.revision).toBe(dated.revision);
  });

  it('adds, removes and reorders places and rejects invalid revisions', () => {
    let plan = createInitialGuidePlan();
    plan = revise(plan, { type: 'ADD_PLACE', block_id: 'gwalior', value: '<img src=x onerror=alert(1)>' }).plan;
    expect(plan.day_blocks[0].places.at(-1)).toBe('<img src=x onerror=alert(1)>');
    plan = revise(plan, { type: 'MOVE_PLACE', block_id: 'gwalior', index: 3, direction: -1 }).plan;
    expect(plan.day_blocks[0].places[2]).toBe('<img src=x onerror=alert(1)>');
    plan = revise(plan, { type: 'REMOVE_PLACE', block_id: 'gwalior', index: 2 }).plan;
    expect(plan.day_blocks[0].places).not.toContain('<img src=x onerror=alert(1)>');
    expect(revise(plan, { type: 'SET_BLOCK_DAYS', block_id: 'gwalior', value: 0 }).status).toBe('INVALID_REVISION');
  });

  it('freezes a real-shaped PLAN_APPROVED handoff', () => {
    const approved = approveGuidePlan(createInitialGuidePlan({ tripContext: { weather_preference: 'pleasant, moderate weather' } }));
    expect(approved.status).toBe('PLAN_APPROVED');
    expect(approved.snapshot).toMatchObject({ status: 'PLAN_APPROVED', start_date: null, summary: { duration_days: 14 }, traveler_context: { weather_preference: 'pleasant, moderate weather' } });
    expect(Object.isFrozen(approved.snapshot)).toBe(true);
    expect(Object.isFrozen(approved.snapshot.day_blocks)).toBe(true);
    expect(Object.isFrozen(approved.snapshot.traveler_context)).toBe(true);
  });
});
