// TWM canonical analytics layer (TWM-149). Product code calls trackEvent()
// with TWM's own event names/params (see TWM Analytics Specification,
// linked from TWM-150) — never gtag directly — so swapping the underlying
// provider later only touches this file.
//
// Zero-cost stack: GA4, loaded only when VITE_GA_MEASUREMENT_ID is set
// (production Vercel env only — absent in dev/preview, so those
// environments never send production analytics, per spec Step 8.1/8.2).
//
// Internal/test traffic exclusion (spec Step 8.3): visiting with
// ?twm_internal=1 persists a localStorage flag; while set, no event is
// sent to GA4. ?twm_internal=0 clears it. This is a client-side opt-out,
// not a secret — it only ever suppresses this browser's own outgoing events.

const INTERNAL_TRAFFIC_KEY = 'twm_internal_traffic';

function syncInternalTrafficFlagFromUrl() {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  if (!params.has('twm_internal')) return;
  const value = params.get('twm_internal');
  try {
    if (value === '1') window.localStorage.setItem(INTERNAL_TRAFFIC_KEY, '1');
    else window.localStorage.removeItem(INTERNAL_TRAFFIC_KEY);
  } catch {
    // Storage unavailable (e.g. private mode) — nothing to persist, safe to ignore.
  }
}

export function isInternalTraffic() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(INTERNAL_TRAFFIC_KEY) === '1';
  } catch {
    return false;
  }
}

let gaLoaded = false;

function loadGtag(measurementId) {
  if (gaLoaded || typeof document === 'undefined') return;
  gaLoaded = true;
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  // We fire our own canonical events (website_visit, etc.) instead of
  // GA4's automatic page_view, so the funnel stays defined by TWM's event
  // model rather than raw route changes.
  window.gtag('config', measurementId, { send_page_view: false });
}

// Call once at app boot (main.jsx). No-op outside production (no
// measurement ID configured) or for flagged internal/test traffic.
export function initAnalytics() {
  syncInternalTrafficFlagFromUrl();
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;
  if (!measurementId || isInternalTraffic()) return;
  loadGtag(measurementId);
}

// The single tracking call surface for TWM product code. `params` are
// TWM's own controlled parameter names (see spec Step 4) — never raw
// free-text, PII, or full payloads.
export function trackEvent(eventName, params = {}) {
  if (isInternalTraffic()) return;
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('event', eventName, { environment: 'prod', ...params });
}

// Controlled failure category (spec Step 4.8) — never a raw stack trace or
// full error/response body. `error` is a caught fetch/TripApiError-shaped
// value; TripApiError itself isn't imported here to keep this layer
// provider/caller-agnostic — a bare status/name check is enough.
function failureCategory(error) {
  if (!error) return 'unknown';
  if (typeof error.status === 'number') {
    if (error.status >= 500) return 'server_error';
    if (error.status === 408 || error.status === 504) return 'timeout';
    return 'invalid_response';
  }
  if (error.name === 'TypeError') return 'network_error';
  return 'unknown';
}

// Fires a controlled `generation_failed`-style event for a given funnel
// stage, distinct from user drop-off (spec Step 3.5) — this represents a
// product/system failure, not the traveler simply leaving.
export function trackFailure(stage, error) {
  trackEvent('generation_failed', { stage, failure_category: failureCategory(error) });
}
