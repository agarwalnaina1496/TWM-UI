const AUTH_PATH = '/api/auth';

export class AuthApiError extends Error {
  constructor(message, { status, payload } = {}) {
    super(message);
    this.name = 'AuthApiError';
    this.status = status;
    this.payload = payload;
  }
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${AUTH_PATH}${path}`, {
      credentials: 'include',
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
  } catch (fetchError) {
    throw new AuthApiError(fetchError.message || 'Account request failed.', { status: 0 });
  }
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AuthApiError(payload?.detail?.message || payload?.detail || 'Account request failed.', {
      status: response.status,
      payload,
    });
  }
  return payload;
}

export async function signup(email, password) {
  return request('/signup', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export async function login(email, password) {
  return request('/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}

// Returns the current user, or null when unauthenticated (401) — callers
// treat that as the routine "not logged in" case, not an error.
export async function fetchCurrentUser() {
  try {
    return await request('/me');
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 401) return null;
    throw error;
  }
}

export async function logout() {
  await request('/logout', { method: 'POST' });
}
