<!-- TWM delivery PR. Keep the title `TWM#<issue> - <concise title>` and lead
the description with a `## Tracking` section (Linear link first). -->

## Tracking

- Linear:
- Companion PR(s):

## Summary



## Definition of done

The things `oxlint` and the fitness functions can't catch. Tick each, or say why it doesn't apply.

- [ ] **One home per concern** — this change does not derive a fact that is already derived somewhere else. Rendered trip data comes from a `TripView` / `useQuery` result or a document (the enriched `/itinerary`, the matcher round) — never raw `trip_state` branch paths. Deterministic UI state (stage, selection, recommendation history) is written once, in its lifecycle home.
- [ ] **New invariant → new fitness function** — anything this change must keep true is enforced by a test (`tests/unit/architecture/*`) or an `.oxlintrc.json` rule, not just a code comment. (See `TWM-UI/AGENTS.md` → *Architecture rules (enforced)*.)
- [ ] **Read-path change → a count assertion** — if this touches how data is fetched, a test pins the number of network calls (React Query dedupe, no double-fetch, no re-fetch on a cache hit).
- [ ] **Layer graph holds** — no new `components → hooks`, `lib → react`, or other upward import; `lib/` view-models stay pure. `tests/unit/architecture/layer-graph.test.js` still passes.
- [ ] **No god function, no oversized file** — nothing crossed an `oxlint` cap; the `complexity: off` exempt list did not grow; no file crossed 600 lines.
- [ ] **Deleted, not deprecated** — dead code, unused props, unused query keys, and superseded local-state shapes are removed, not left with a comment.
- [ ] **`AGENTS.md` still accurate** — the *Architecture rules (enforced)* section, the read-boundary allow-list, and the `max-lines-per-function` ratchet list still describe reality after this change.

## Verification

<!-- npm run lint / test / build results, affected user flows, known limitations, rollback -->

## Rollback


