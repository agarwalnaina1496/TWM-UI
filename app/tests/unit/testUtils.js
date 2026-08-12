import { useEffect } from 'react';
import { useTrip } from '../../src/context/TripContext.jsx';

// Seeds TripContext's in-memory auth state via its own login/continueWithoutLogin
// API. TripContext no longer persists auth to localStorage, so a test that
// needs a pre-authenticated session must seed it through the context itself —
// mount this once, inside a TripProvider, above the component under test.
export function SeedAuth({ auth, children }) {
  const { login, continueWithoutLogin } = useTrip();
  useEffect(() => {
    if (auth?.loggedIn) login({ name: auth.name, email: auth.email });
    else continueWithoutLogin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return children;
}
