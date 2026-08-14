import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
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
  const { trip, login, continueWithoutLogin, loginModalOpen, closeLoginModal } = useTrip();
  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'forgot'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetSent, setResetSent] = useState(false);
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

  function continueNext() {
    login({ name: name.trim() || 'Traveler', email: email.trim() });
    closeLoginModal();
  }

  function handleContinueWithoutLogin() {
    continueWithoutLogin();
    closeLoginModal();
  }

  function switchMode(next) {
    setMode(next);
    setPassword('');
    setResetSent(false);
  }

  const heading = mode === 'signup' ? 'Sign up to' : mode === 'forgot' ? 'Reset your' : 'Log in to';

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
              <p style={{ fontSize: 13, color: 'var(--tm)', textAlign: 'center' }}>If an account exists for <b>{email || 'that email'}</b>, a reset link would be sent.</p>
              <span className="btn btn-primary btn-full" onClick={() => switchMode('login')} style={{ marginTop: 14 }}>Back to log in</span>
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
            {mode === 'signup' && (
              <div className="field-block">
                <div className="field-title">Name</div>
                <input className="field-input" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
              </div>
            )}
            <div className="field-block">
              <div className="field-title">Email</div>
              <input className="field-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" />
            </div>
            <div className="field-block">
              <div className="field-title">Password</div>
              <input className="field-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            {mode === 'login' && (
              <p className="auth-switch" style={{ textAlign: 'right', marginTop: -6 }}><span onClick={() => switchMode('forgot')}>Forgot password?</span></p>
            )}
            <span className="btn btn-primary btn-full" onClick={continueNext}>{mode === 'signup' ? 'Sign up →' : 'Continue →'}</span>
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
