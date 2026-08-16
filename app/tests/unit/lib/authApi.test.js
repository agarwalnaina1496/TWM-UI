import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthApiError, fetchCurrentUser, login, logout, signup } from '../../../src/lib/authApi.js';

function mockJsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('signup', () => {
  it('POSTs to /api/auth/signup and returns the parsed body', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(201, { id: 'u1', email: 'traveler@example.com', claimed_trip_count: 2 }));

    const result = await signup('traveler@example.com', 'hunter22!!');

    expect(global.fetch).toHaveBeenCalledWith('/api/auth/signup', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ email: 'traveler@example.com', password: 'hunter22!!' }),
    }));
    expect(result).toEqual({ id: 'u1', email: 'traveler@example.com', claimed_trip_count: 2 });
  });

  it('throws AuthApiError with the backend detail on a duplicate email', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(409, { detail: 'Email is already registered.' }));

    await expect(signup('traveler@example.com', 'hunter22!!')).rejects.toMatchObject({
      name: 'AuthApiError',
      message: 'Email is already registered.',
      status: 409,
    });
  });
});

describe('login', () => {
  it('throws AuthApiError on wrong credentials', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(401, { detail: 'Incorrect email or password.' }));

    await expect(login('traveler@example.com', 'wrong')).rejects.toBeInstanceOf(AuthApiError);
  });
});

describe('fetchCurrentUser', () => {
  it('returns the user for a valid session', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(200, { id: 'u1', email: 'traveler@example.com' }));

    await expect(fetchCurrentUser()).resolves.toEqual({ id: 'u1', email: 'traveler@example.com' });
  });

  it('returns null (not a thrown error) for an unauthenticated 401', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(401, { detail: 'Not authenticated.' }));

    await expect(fetchCurrentUser()).resolves.toBeNull();
  });

  it('still throws for a non-401 failure (e.g. a 502 from the proxy)', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(502, { detail: 'Account authentication is temporarily unavailable.' }));

    await expect(fetchCurrentUser()).rejects.toBeInstanceOf(AuthApiError);
  });
});

describe('logout', () => {
  it('POSTs to /api/auth/logout', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => ({}) });

    await logout();

    expect(global.fetch).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }));
  });
});
