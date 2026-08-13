import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initAnalytics, isInternalTraffic, trackEvent, trackFailure } from '../../../src/lib/analytics.js';

function setUrl(search) {
  window.history.replaceState({}, '', `/app/${search}`);
}

describe('analytics (TWM-149)', () => {
  beforeEach(() => {
    localStorage.clear();
    setUrl('');
    delete window.gtag;
    delete window.dataLayer;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does nothing when no GA measurement ID is configured (dev/preview default)', () => {
    initAnalytics();
    expect(window.gtag).toBeUndefined();
    trackEvent('website_visit', { page_path: '/' });
    // No throw, no gtag call — safe no-op.
  });

  it('persists the internal-traffic flag from ?twm_internal=1 and clears it on =0', () => {
    setUrl('?twm_internal=1');
    initAnalytics();
    expect(isInternalTraffic()).toBe(true);
    expect(localStorage.getItem('twm_internal_traffic')).toBe('1');

    setUrl('?twm_internal=0');
    initAnalytics();
    expect(isInternalTraffic()).toBe(false);
    expect(localStorage.getItem('twm_internal_traffic')).toBeNull();
  });

  it('never calls gtag while internal traffic is flagged, even if gtag is loaded', () => {
    localStorage.setItem('twm_internal_traffic', '1');
    window.gtag = vi.fn();
    trackEvent('destination_selected', { selection_source: 'plan_this_trip' });
    expect(window.gtag).not.toHaveBeenCalled();
  });

  it('forwards canonical events to gtag with the environment param attached', () => {
    window.gtag = vi.fn();
    trackEvent('destination_selected', { selection_source: 'plan_this_trip' });
    expect(window.gtag).toHaveBeenCalledWith('event', 'destination_selected', {
      environment: 'prod',
      selection_source: 'plan_this_trip',
    });
  });

  it('categorizes a network failure (no status, TypeError) distinctly from a server error', () => {
    window.gtag = vi.fn();
    trackFailure('plan_builder', new TypeError('Failed to fetch'));
    expect(window.gtag).toHaveBeenCalledWith('event', 'generation_failed', {
      environment: 'prod', stage: 'plan_builder', failure_category: 'network_error',
    });

    window.gtag.mockClear();
    trackFailure('itinerary_generation', { status: 500, message: 'boom' });
    expect(window.gtag).toHaveBeenCalledWith('event', 'generation_failed', {
      environment: 'prod', stage: 'itinerary_generation', failure_category: 'server_error',
    });

    window.gtag.mockClear();
    trackFailure('discovery', { status: 422, message: 'invalid' });
    expect(window.gtag).toHaveBeenCalledWith('event', 'generation_failed', {
      environment: 'prod', stage: 'discovery', failure_category: 'invalid_response',
    });
  });
});
