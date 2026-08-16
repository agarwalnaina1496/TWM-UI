import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import { AuthApiError } from '../lib/authApi.js';
import { trackEvent } from '../lib/analytics.js';
import '../styles/auth.css';
import '../styles/details.css';
import '../styles/contextual-auth-modal.css';

// Deep-link support for `/login` (bookmarks, old links, tests seeding auth
// state directly): opens the overlay, then redirects to `/` — there's no
// standalone login page anymore, just the overlay on top of wherever the
// traveler lands.
export function LoginRouteRedirect() {
  const { openLoginModal } = useTrip();
  useEffect(() => { openLoginModal(); }, [openLoginModal]);
  return <Navigate to="/" replace />;
}

// Login as a global overlay (TWM-164), not a routed `/login` page — opened
// from anywhere via useTrip().openLoginModal() and closes back onto exactly
// the screen the traveler was already on.
export default function LoginModal() {
  const { trip, signup, login, continueWithoutLogin, loginModalOpen, closeLoginModal } = useTrip();
  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!loginModalOpen) return;
    dialogRef.current?.querySelector('input')?.focus();
    function onKeyDown(e) {
      if (e.key === 'Escape') closeLoginModal();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [loginModalOpen, closeLoginModal]);

  if (!loginModalOpen) return null;

  // Real signup/login against the Backend (TWM-180) — a failed attempt
  // (duplicate email on signup, wrong credentials on login, or the request
  // itself failing) shows the real error inline and leaves the form open,
  // instead of the prior stub's unconditional success.
  async function handleSubmit() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) return;
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'signup') {
        await signup(trimmedEmail, password);
        trackEvent('signup_completed');
        // No auto-login (TWM-178) — clear the form and switch to the login
        // form so the traveler logs in themselves with the account they
        // just created, instead of silently signing them in.
        setEmail('');
        setPassword('');
        setMode('login');
      } else {
        await login(trimmedEmail, password);
        trackEvent('login_completed');
        closeLoginModal();
      }
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleContinueWithoutLogin() {
    continueWithoutLogin();
    closeLoginModal();
  }

  function switchMode(next) {
    setMode(next);
    setPassword('');
    setResetSent(false);
    setError(null);
  }

  const heading = mode === 'signup' ? 'Sign up to' : mode === 'forgot' ? 'Reset your' : 'Log in to';
  const submitLabel = submitting ? 'Please wait…' : mode === 'signup' ? 'Sign up →' : 'Continue →';

  return (
    <div className="auth-invite-backdrop" onClick={closeLoginModal}>
      <div
        className="auth-invite-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
        ref={dialogRef}
        onClick={e => e.stopPropagation()}
      >
        <button type="button" className="modal-close" aria-label="Close" onClick={closeLoginModal}>×</button>
        <h1 id="login-modal-title">{heading} <em>{mode === 'forgot' ? 'password' : 'continue'}</em></h1>
        {mode !== 'forgot' && trip.plan === 'twm-led' && (
          <p className="lede">We'll need a way to reach you, since a real person coordinates TWM-Led trips.</p>
        )}

        {mode === 'forgot' ? (
          resetSent ? (
            <>
              <p className="auth-reset-note">If an account exists for <b>{email || 'that email'}</b>, a reset link would be sent.</p>
              <span className="btn btn-primary btn-full auth-modal-cta" onClick={() => switchMode('login')}>Back to log in</span>
            </>
          ) : (
            <>
              <div className="field-block">
                <div className="field-title">Email</div>
                <input className="field-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" />
              </div>
              <span className="btn btn-primary btn-full" onClick={() => setResetSent(true)}>Send reset link →</span>
              <p className="auth-switch"><span onClick={() => switchMode('login')}>Back to log in</span></p>
            </>
          )
        ) : (
          <>
            <div className="field-block">
              <div className="field-title">Email</div>
              <input className="field-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" />
            </div>
            <div className="field-block">
              <div className="field-title">Password</div>
              <input
                className="field-input" type="password" value={password}
                onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
              />
            </div>
            {mode === 'login' && (
              <p className="auth-switch auth-switch-right"><span onClick={() => switchMode('forgot')}>Forgot password?</span></p>
            )}
            {error && <div className="price-evidence state-unsafe" role="alert">{error}</div>}
            <span className="btn btn-primary btn-full" onClick={submitting ? undefined : handleSubmit}>
              {submitLabel}
            </span>
            <p className="auth-switch">
              {mode === 'signup'
                ? <>Already have an account? <span onClick={() => switchMode('login')}>Log in</span></>
                : <>New user? <span onClick={() => switchMode('signup')}>Sign up</span></>}
            </p>
            {trip.plan !== 'twm-led' && (
              <>
                <div className="auth-divider">or</div>
                <span className="btn btn-ghost btn-full" onClick={handleContinueWithoutLogin}>Continue without login</span>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
