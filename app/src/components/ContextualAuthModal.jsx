import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import '../styles/contextual-auth-modal.css';

// Reusable contextual authentication invitation (TWM-140). Renders only when
// a traveler requests a capability that benefits from an account — never as
// an unsolicited interruption. Login opens only after "Log in and sync" is
// explicitly chosen; dismiss/"Continue without login" keeps the traveler on
// the originating screen with their anonymous trip state intact.
export default function ContextualAuthModal({ open, onClose, benefit, guestNote, onContinueWithoutLogin }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { setPendingReturnTo } = useTrip();
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.querySelector('button')?.focus();
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function handleLoginAndSync() {
    setPendingReturnTo(location.pathname);
    navigate('/login');
  }

  function handleContinueWithoutLogin() {
    onContinueWithoutLogin?.();
    onClose();
  }

  return (
    <div className="auth-invite-backdrop" onClick={onClose}>
      <div
        className="auth-invite-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-invite-title"
        ref={dialogRef}
        onClick={e => e.stopPropagation()}
      >
        <h2 id="auth-invite-title">{benefit}</h2>
        {guestNote && <p className="auth-invite-note">{guestNote}</p>}
        <div className="auth-invite-actions">
          <button type="button" className="btn btn-primary btn-full" onClick={handleLoginAndSync}>Log in and sync</button>
          <button type="button" className="btn btn-ghost btn-full" onClick={handleContinueWithoutLogin}>Continue without login</button>
        </div>
      </div>
    </div>
  );
}
