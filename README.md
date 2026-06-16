# TravelWithMe — MVP Frontend

Minimal but production-minded React frontend for TWM Phase 1: Trip Matcher.

## Stack

- **React 19** + **TypeScript 6**
- **Vite 6** — dev server and build tool
- **CSS Modules** — scoped styles, no external CSS library
- **DM Serif Display / DM Sans** — typography

## Getting Started

```bash
npm install
npm run dev        # starts at http://localhost:5173
npm run build      # type-check + production build
npm run type-check # TypeScript check only
```

## Connecting the real API

See `src/docs/BACKEND_INTEGRATION.md`.
Short version: flip `USE_MOCK = false` in `src/constants/index.ts` and set `VITE_API_BASE_URL` in `.env.local`.

## Architecture

See `src/docs/ARCHITECTURE.md` for folder structure, data flow, and the evolution path from form → chat.
