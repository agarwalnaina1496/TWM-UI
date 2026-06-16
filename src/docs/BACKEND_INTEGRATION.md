# Backend Integration Guide

How to connect the real `/trip-matcher` API when it's ready.

## What to change (exactly 3 places)

1. Set `VITE_API_BASE_URL` in `.env.local`
2. Set `USE_MOCK = false` in `src/constants/index.ts`
3. Done — no other changes required

## Service layer

`src/services/api/tripMatcher.ts` exports `postTripMatcher(request)`.
When `USE_MOCK = true` it returns a hardcoded response; otherwise it POSTs to `{API_BASE_URL}/trip-matcher`.
