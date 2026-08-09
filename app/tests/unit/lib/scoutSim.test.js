import { describe, it, expect } from 'vitest';
import { classify, findDestination, extractFields, adviceReplyFor } from '../../../src/lib/scoutSim.js';

describe('scoutSim.classify', () => {
  it('classifies a safety/weather question as advice', () => {
    expect(classify('Is Ladakh safe in December?')).toBe('advice');
  });

  it('classifies a named destination with plan intent as decided', () => {
    expect(classify('Plan my trip to Coorg')).toBe('decided');
  });

  it('classifies an undecided, discovery-seeking message as discover_only', () => {
    expect(classify('Not sure where to go, suggest something')).toBe('discover_only');
  });

  it('classifies a bare destination mention as decided', () => {
    expect(classify('Thinking about Goa')).toBe('decided');
  });
});

describe('scoutSim.findDestination', () => {
  it('finds a known destination inside free text', () => {
    expect(findDestination('I love Manali in winter')).toBe('Manali');
  });

  it('returns null when no known destination is present', () => {
    expect(findDestination('Somewhere quiet and cheap')).toBeNull();
  });
});

describe('scoutSim.extractFields', () => {
  it('extracts budget, traveler count, and style from free text', () => {
    const fields = extractFields('2 people, mid range budget, relaxing pace');
    expect(fields).toEqual({ budget: 'mid', travelers: 2, style: 'relaxing' });
  });

  it('extracts destination, month, and origin together', () => {
    const fields = extractFields('Plan my trip to Goa from Bengaluru in December');
    expect(fields.destination).toBe('Goa');
    expect(fields.month).toBe('December');
    expect(fields.origin).toBe('Bengaluru');
  });

  it('returns an empty object when nothing recognizable is present', () => {
    expect(extractFields('hello there')).toEqual({});
  });
});

describe('scoutSim.adviceReplyFor', () => {
  it('returns the Ladakh-specific reply and suggests Ladakh', () => {
    const reply = adviceReplyFor('Is Ladakh safe right now?');
    expect(reply.suggestDestination).toBe('Ladakh');
    expect(reply.message).toMatch(/Ladakh/);
  });

  it('falls back to the default reply for other destinations', () => {
    const reply = adviceReplyFor('What is the best time to visit Goa?');
    expect(reply.suggestDestination).toBeNull();
  });
});
