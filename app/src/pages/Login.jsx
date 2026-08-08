import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import '../styles/auth.css';
import '../styles/details.css';

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { trip, login } = useTrip();
  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'forgot'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetSent, setResetSent] = useState(false);

  function continueNext() {
    login({ name: name.trim() || 'Traveler', email: email.trim() });
    navigate(searchParams.get('next') || '/');
  }

  function continueAsGuest() {
    login({ name: 'Guest', email: '' });
    navigate(searchParams.get('next') || '/');
  }

  function switchMode(next) {
    setMode(next);
    setPassword('');
    setResetSent(false);
  }

  const heading = mode === 'signup' ? 'Sign up to' : mode === 'forgot' ? 'Reset your' : 'Log in to';

  return (
    <div className="wrap">
      <h1>{heading} <em>{mode === 'forgot' ? 'password' : 'continue'}</em></h1>
      {mode !== 'forgot' && trip.plan === 'twm-led' && (
        <p className="lede">We'll need a way to reach you, since a real person coordinates TWM-Led trips.</p>
      )}

      <div className="auth-card">
        {mode === 'forgot' ? (
          resetSent ? (
            <>
              <p style={{ fontSize: 13, color: 'var(--tm)', textAlign: 'center' }}>If an account exists for <b>{email || 'that email'}</b>, a reset link would be sent (prototype — nothing is actually sent).</p>
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
                <span className="btn btn-ghost btn-full" onClick={continueAsGuest}>Continue as guest</span>
              </>
            )}
          </>
        )}
        <p style={{ fontSize: 11, color: 'var(--tm)', textAlign: 'center', marginTop: 10 }}>Prototype — nothing is actually sent or stored.</p>
      </div>
    </div>
  );
}
