# Backend Integration Guide

How to connect the real `/trip-matcher` API when it's ready.

---

## What to change (exactly 3 places)

### 1. Set the API base URL

In your `.env.local` file (create it at project root):

```env
VITE_API_BASE_URL=https://api.yourdomain.com
```

Or for local development:

```env
VITE_API_BASE_URL=http://localhost:8000
```

### 2. Flip the mock flag

In `src/constants/index.ts`:

```ts
// Before
export const USE_MOCK = true

// After
export const USE_MOCK = false
```

### 3. Done

That's it. No component, hook, or page needs to change.

---

## How the service layer works

`src/services/api/tripMatcher.ts` exports one function:

```ts
postTripMatcher(request: TripMatcherRequest): Promise<TripMatcherResponse>
```

When `USE_MOCK = true`, it returns a hardcoded response after a simulated delay.
When `USE_MOCK = false`, it calls:

```
POST {API_BASE_URL}/trip-matcher
Content-Type: application/json

{ "message": "..." }
```

---

## Expected API contract

### Request

```json
{ "message": "3 girls from Bangalore. September. Budget around 30k." }
```

### Response

```json
{
  "message": "Based on what you've told me, I think Coorg and Munnar would be a great fit.",
  "trip_state": {
    "status": "active"
  },
  "recommendations": [
    { "id": "coorg_karnataka", "title": "Coorg" },
    { "id": "munnar_kerala",   "title": "Munnar" }
  ]
}
```

If the backend response shape changes, update `src/types/api.types.ts` and the
service function — nothing else needs to change.

---

## Error handling

The service throws a typed `ApiError` on non-2xx responses.
`useTripMatcher` catches this and exposes `{ error: string }` to the UI.
The component renders an error state — no changes needed there either.

---

## CORS

If running the frontend on a different origin than the API, ensure the backend
returns the correct `Access-Control-Allow-Origin` headers.
For local dev, you can also proxy through Vite — add to `vite.config.ts`:

```ts
server: {
  proxy: {
    '/trip-matcher': 'http://localhost:8000'
  }
}
```
