export default function ErrorBanner({ message, actionLabel, onAction }) {
  return (
    <div className="price-evidence state-unsafe" role="alert">
      {message}
      {actionLabel && onAction && (
        <button type="button" className="btn btn-ghost" onClick={onAction}>{actionLabel}</button>
      )}
    </div>
  );
}
