# Travel With Me UI

This repository owns frontend behavior, UI state, local persistence, stage-driven navigation, CTA mapping, and backend integration. Follow the workspace-level `AGENTS.md` in addition to these repository-specific rules.

## Scope and issue naming

- Prefix every Linear implementation-story title for this repository with `[UI]`.
- Use the prefix only in Linear. Do not add `[UI]` to branch names, commit messages, or pull-request titles unless the user explicitly requests it.
- Keep UI work in this repository. Coordinate separate `[BE]` work when the requirement changes an API, prompt response, or shared state contract.
- Avoid unrelated visual, state-management, or formatting changes in the same branch or pull request.

## Product intent and discovery

- The user's explicit decisions in the active discovery define intended product behavior.
- Treat UI code, backend behavior, tests, and documentation as evidence of current behavior. Surface conflicts and ask the user to decide before finalizing scope.
- For API or conversational-flow changes, inspect the corresponding backend schema, normalization, and agent response behavior before editing the UI.

## State, stages, and resume behavior

- Keep per-turn agent intent separate from lifecycle stage.
- Treat UI-owned writes such as stage transitions, deterministic option selection, and stored recommendation history as explicit product behavior; do not change them incidentally while rendering or restoring a screen.
- Keep context existence detection separate from context-chip presentation. Hidden or non-display state may still be meaningful saved context.
- Resume behavior must be derived from the complete saved trip state, including relevant advisor, matcher, planner, and UI state, without silently resetting or regressing lifecycle stage.
- Review/reopen actions must not mutate stage or selection merely to reconstruct presentation state.
- Consider backward compatibility for existing localStorage records whenever the persisted shape or interpretation changes.

## Backend integration and provenance

- Send only the approved phase slice to each backend endpoint and deep-merge only fields owned by the responding component.
- Keep frontend handling aligned with backend response schemas and business-status semantics.
- When agent-version metadata is available, preserve it with the relevant saved advice or recommendation output and expose it in approved debugging surfaces.
- Do not infer prompt provenance from response content; use deterministic metadata returned by the backend.

## Documentation

- Documentation updates are mandatory for every implementation story.
- Include affected CTA mappings, stage transitions, resume behavior, persisted-state shape, and API integration behavior in the story scope, acceptance criteria, and verification plan.
- Keep product behavior and shared-contract docs in `TWM_Docs/`, including product architecture, TripState/stages, CTA mappings, resume behavior, and shared API/user flows.
- Backend technical and operational subjects such as prompt versioning, FastAPI internals, n8n, EC2, and deployment/runtime setup belong in `TravelWithMe/`, not `TWM_Docs/` or this repository.
- A UI story is not complete while its documented behavior or contract is stale.

## Verification

- Run syntax/build checks and focused manual verification for each changed user flow.
- For state-driven behavior, test fresh and resumed trips across relevant stages, including empty, advisor-only, matcher, recommended, matched, and planning states as applicable.
- Verify CTA label, destination screen, stage preservation, localStorage result, and refresh/resume behavior together.
- For API integration changes, test success, expected business failures, and infrastructure failures without corrupting saved state.
- Report UI checks, documentation verification, compatibility risks, and rollback instructions separately from backend results.

## Git delivery

- Use a UI-specific branch and pull request.
- Stage only intended files in a dirty worktree.
- Do not commit, push, open, or merge a pull request without the explicit gate required by the workspace instructions.
- An explicitly authorized `AGENTS.md` process-configuration update does not need a Linear story, but all requested Git delivery gates still apply.
- A request to address PR review comments authorizes brief replies and resolution of verified addressed threads unless the user says otherwise.
