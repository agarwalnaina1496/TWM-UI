# TWM Frontend — Architecture

## Overview

This is the MVP frontend for TravelWithMe (TWM), Phase 1: Trip Matcher.
It is built as a **production-minded skeleton** — structured so a frontend
engineer can extend it without restructuring.

---

## Folder Structure

```
src/
├── components/          Component library — each folder = one component
│   ├── Layout/          App shell: header, page wrapper
│   ├── TripInput/       Free-text input + submit (today: form, future: chat)
│   ├── TripResponse/    Renders API response: message + recommendations
│   ├── TripCard/        Single saved-trip card
│   └── TripList/        "Your Trips" section — list of TripCards
│
├── pages/
│   └── Home/            Composes all components into the landing page
│
├── services/
│   ├── api/
│   │   └── tripMatcher.ts    POST /trip-matcher (mock today, real tomorrow)
│   └── storage/
│       └── tripStorage.ts    LocalStorage CRUD for saved trips
│
├── types/
│   ├── api.types.ts     Request / response shapes
│   └── trip.types.ts    Trip card data model
│
├── hooks/
│   ├── useTripMatcher.ts    Wraps API call + loading/error state
│   └── useTripStorage.ts    Wraps localStorage CRUD
│
├── constants/index.ts   USE_MOCK flag, API URL, endpoint paths, keys
├── utils/formatters.ts  Date formatting, ID generation, string helpers
├── styles/global.css    Design tokens + CSS reset
└── docs/                This file + BACKEND_INTEGRATION.md
```

---

## Data Flow

```
User types in TripInput
        ↓
useTripMatcher.submit(message)
        ↓
services/api/tripMatcher.ts  ← mock or real, controlled by USE_MOCK
        ↓
TripMatcherResponse { message, trip_state, recommendations }
        ↓
useTripStorage.saveTrip(trip)  ← persists to localStorage
        ↓
TripResponse renders message + recommendation cards
TripList reflects updated trip list
```

---

## The Mock → Real Switch

See `constants/index.ts`:

```ts
export const USE_MOCK = true   // ← flip to false for live API
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
```

The service layer (`services/api/tripMatcher.ts`) reads these values.
No component or hook ever touches `USE_MOCK` directly.

---

## Evolution Path: Form → Chat

`TripInput` is intentionally decoupled from the page layout.
When the product moves to multi-turn conversation:

1. Replace `TripInput` with a `ChatInterface` component
2. `useTripMatcher` gets a `messages` array instead of a single `message`
3. `TripResponse` becomes a `MessageBubble` list
4. Everything else — `TripList`, `TripCard`, storage, types, constants — is unchanged

This is the primary extensibility contract of this architecture.

---

## Conventions

- Components never import from `services/` directly — they go through hooks
- Hooks never import from `pages/` — one-directional dependency graph
- All API shapes are typed in `types/api.types.ts` — no inline type definitions in components
- CSS Modules per component — no global class pollution
