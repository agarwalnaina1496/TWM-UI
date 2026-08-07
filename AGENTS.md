# Travel With Me UI

This repository owns frontend behavior, UI state, local persistence, stage-driven navigation, CTA mapping, and backend integration. Follow the workspace-level `AGENTS.md` in addition to these repository-specific rules.

## Scope and issue naming

- Prefix every Linear implementation-story title for this repository with `[UI]`.
- Use the prefix only in Linear. Do not add `[UI]` to branch names, commit messages, or pull-request titles unless the user explicitly requests it.
- Keep UI work in this repository. Coordinate separate `[BE]` work when the requirement changes an API, prompt response, or shared state contract.
- Avoid unrelated visual, state-management, or formatting changes in the same branch or pull request.

## Product intent and discovery

- This product is currently pre-MVP. Do not add legacy localStorage compatibility, migrations, fallback state shapes, or rollout layers unless the user explicitly requests them; implement the current approved canonical UI/state behavior directly.
- For API or conversational-flow changes, inspect the corresponding backend schema, normalization, and agent response behavior before editing the UI.

## State, stages, and resume behavior

- Keep per-turn agent intent separate from lifecycle stage.
- Treat UI-owned writes such as stage transitions, deterministic option selection, and stored recommendation history as explicit product behavior; do not change them incidentally while rendering or restoring a screen.
- Keep context existence detection separate from context-chip presentation. Hidden or non-display state may still be meaningful saved context.
- Resume behavior must be derived from the complete saved trip state, including relevant advisor, matcher, planner, and UI state, without silently resetting or regressing lifecycle stage.
- Review/reopen actions must not mutate stage or selection merely to reconstruct presentation state.
- Do not preserve superseded localStorage records or state interpretations by default during pre-MVP development.

## Backend integration and provenance

- Send only the approved phase slice to each backend endpoint and deep-merge only fields owned by the responding component.
- Keep frontend handling aligned with backend response schemas and business-status semantics.
- When agent-version metadata is available, preserve it with the relevant saved advice or recommendation output and expose it in approved debugging surfaces.
- Do not infer prompt provenance from response content; use deterministic metadata returned by the backend.

## Documentation

- Keep product behavior and shared-contract docs in `TWM_Docs/`, including product architecture, TripState/stages, CTA mappings, resume behavior, and shared API/user flows.
- Backend technical and operational subjects such as prompt versioning, FastAPI internals, n8n, EC2, and deployment/runtime setup belong in `TravelWithMe/`, not `TWM_Docs/` or this repository.

## Verification

- Run syntax/build checks and focused manual verification for each changed user flow.
- For state-driven behavior, test fresh and resumed trips across relevant stages, including empty, advisor-only, matcher, recommended, matched, and planning states as applicable.
- Verify CTA label, destination screen, stage preservation, localStorage result, and refresh/resume behavior together.
- For API integration changes, test success, expected business failures, and infrastructure failures without corrupting saved state.
- Report UI checks, affected documentation verification, known limitations, and rollback instructions separately from Backend results.

## Git delivery

- Use a UI-specific branch and pull request.
- Stage only intended files in a dirty worktree.

<!-- twm-codex-basekit: START -->
## Travel With Me workspace delivery rules

The Travel With Me product is split across independent repositories:

- `TravelWithMe/`: Backend APIs, agents, schemas, prompts, workflows, and server-side business logic.
- `TWM-UI/`: Frontend behavior, UI state, persistence, and Backend integration.
- `TWM_Docs/`: Canonical product behavior and shared-contract documentation.

### Repository boundaries

- Preserve every repository's independent Git history.
- Keep branches, commits, verification results, and pull requests separate by repository.
- Modify only repositories with a proven implementation or documentation delta.
- Avoid unrelated refactors, formatting churn, compatibility layers, and migration paths.
- Treat the product as pre-MVP unless the user explicitly decides otherwise.

### Product intent

- Treat the user's confirmed decisions in active discovery as the authority for intended behavior.
- Use code, prompts, tests, workflows, and documentation as evidence of current behavior, not as authority over a conflicting confirmed decision.
- Surface conflicts or material ambiguity before finalizing scope.
- Record confirmed decisions in the proposed work breakdown and approved Linear issues.

### Mandatory delivery workflow

1. Begin with read-only discovery across every potentially affected repository.
2. Assess Backend, UI, product documentation, and n8n as distinct delivery surfaces. Mark each in scope, out of scope, no change required, or requiring further investigation.
3. Prove a current-versus-required delta before proposing an implementation child story.
4. Present a consolidated work breakdown before creating or updating Linear issues.
5. Wait for explicit approval before writing Linear issues.
6. Wait for explicit selection or approval of a Linear implementation story before editing files.
7. Before editing, confirm the story, repositories, acceptance criteria, and branch plan.
8. Before the first commit, create and switch to a non-default delivery branch in each affected repository. Never commit or push directly to a default branch unless the user explicitly authorizes that exact exception; general approval to "commit and push" does not authorize default-branch delivery.
9. Implement only approved scope. Return to planning for material expansion or an unapproved contract change.
10. Run repository-specific verification and present diffs, results, limitations, and rollback instructions.
11. Wait for separate explicit approvals for commit, push, pull-request creation, and merge.

### Linear structure

- Apply the `Feature` label to a parent capability or delivery container.
- Structure implementation children around dependency-ordered delivery increments, not around repository count alone. Start with prerequisite contract or foundation work, followed by coordinated implementation, end-to-end integration, and documentation where each increment has a proven delta.
- Use separate repository-prefixed children when work is independently implementable or reviewable, or when one piece must block another.
- When Backend and UI tasks are inseparable parts of one useful increment, keep them in one cross-repository story with separate repository-specific task checklists and a combined `[BE][UI]` title prefix. Retain separate branches, commits, verification results, and pull requests per repository.
- Do not create child stories merely to mirror repositories or task groups. Keep checklist tasks inside the story that owns the delivery increment and order them by prerequisite.
- Encode the approved delivery sequence with Linear blocker relationships.
- Prefix implementation-story titles with `[BE]`, `[UI]`, `[BE][UI]`, or `[DOCS]` for the corresponding product repository scope.
- Use `[BASEKIT]` for this independently versioned Codex Basekit.
- Do not add repository prefixes to branches, commits, or pull-request titles unless explicitly requested.
- Create children only for proven changes; record `no change required` on the parent for satisfied surfaces.
- Include problem and outcome, scope, out-of-scope items, affected repositories, acceptance criteria, contract impact, dependencies, verification, and rollback.
- Keep parent Feature descriptions concise and avoid duplicating child task lists, implementation hierarchy, or story-reference catalogs already represented by Linear parent and blocker relationships.
- Prefer one `[DOCS]` child for a capability's canonical product and shared-contract documentation after the behavior is verified, unless documentation is an earlier independent blocker.
- Do not add a standalone Risks section while the product is pre-launch; place concrete constraints with the relevant scope, dependency, or verification item.

### Contracts and coordination

- Treat approved Backend request and response schemas as the implementation source of truth.
- Inspect both Backend and UI for API or user-flow changes.
- Define shared request and response contracts before implementation.
- Record whether coordinated work is independent or blocked, and include deployment ordering only when concretely required.
- Do not add legacy compatibility or rollout layers unless explicitly requested.

### Documentation routing

- Keep canonical product behavior and shared contracts in `TWM_Docs/`.
- Keep Backend technical and operational documentation in `TravelWithMe/`, including prompts, n8n, FastAPI internals, runtime configuration, deployment, and troubleshooting.
- Do not duplicate Backend-only operational documentation in `TWM_Docs/`.
- Require documentation changes only for affected product behavior, user-facing flows, shared contracts, prompt behavior, state ownership, architecture, or material operational workflows.

### Verification and Git delivery

- Run relevant tests, linters, type checks, builds, and focused manual verification in every modified repository.
- Verify affected documentation matches implemented behavior.
- Stage only intended files in dirty worktrees.
- Keep commits small, traceable to the approved Linear story, and easy to revert.
- Title every TWM delivery pull request exactly `TWM#<issue-number> - <concise title>`, using the primary Linear issue number and no repository prefix.
- Start every TWM delivery pull-request description with a `## Tracking` section. Put the primary Linear issue link first, followed by companion pull requests or follow-on tracking links when applicable; place summary, acceptance-criteria coverage, verification, coordination, and rollback after Tracking.
- Keep pull-request metadata truthful when editing an open or merged pull request; remove stale scope, test, prompt-version, or deployment claims.
- Never merge a pull request without explicit user approval.
- After a pull request is merged, verify the merge and clean up its exact delivery branch completely: delete the remote branch, remove any linked worktree created for that branch, delete the local branch, and prune stale worktree metadata. Never delete a default branch, protected branch, unmerged branch, branch referenced by an open pull request, or a branch or worktree with commits or uncommitted work not contained in the merged PR. Before removing a linked worktree, verify its resolved path, confirm it is clean, and confirm it belongs to the exact merged-PR branch; never force removal or discard worktree changes. If GitHub already deleted the remote branch automatically or no linked worktree exists, verify that it is absent.

# Travel With Me UI

This repository owns frontend behavior, UI state, local persistence, stage-driven navigation, CTA mapping, and Backend integration.

## Scope and discovery

- Use `[UI]` only in Linear implementation-story titles.
- Inspect corresponding Backend schemas, normalization, and agent response behavior before changing an API or conversational flow.
- Keep unrelated visual, state-management, and formatting changes out of the same branch.

## State, stages, and resume behavior

- Keep per-turn agent intent separate from lifecycle stage.
- Treat stage transitions, deterministic selection, and stored recommendation history as explicit UI-owned behavior.
- Keep context-existence detection separate from context-chip presentation.
- Derive resume behavior from the complete saved trip state without resetting or regressing lifecycle stage.
- Do not mutate stage or selection merely to reconstruct a review or reopen presentation.
- Do not preserve superseded localStorage records or state interpretations by default.

## Backend integration and provenance

- Send only the approved phase slice to each Backend endpoint.
- Deep-merge only fields owned by the responding component.
- Align frontend handling with Backend response schemas and business-status semantics.
- Preserve deterministic agent-version metadata with relevant saved output when available.
- Do not infer prompt provenance from response content.

## Documentation and verification

- Keep product architecture, TripState, stages, CTA mappings, resume behavior, and shared API flows in `TWM_Docs/`.
- Keep prompt versioning, FastAPI internals, n8n, EC2, and runtime setup in `TravelWithMe/`.
- Run syntax or build checks and focused manual verification for every changed user flow.
- For state-driven behavior, test fresh and resumed trips across all relevant lifecycle states.
- Verify CTA label, destination, stage preservation, localStorage result, and refresh or resume behavior together.
- For API integration, test success, expected business failures, and infrastructure failures without corrupting saved state.
- Report UI checks, documentation verification, limitations, and rollback separately from Backend results.

## Git delivery

- Use a UI-specific branch and pull request.
- Stage only intended files in a dirty worktree.
<!-- twm-codex-basekit: END -->
