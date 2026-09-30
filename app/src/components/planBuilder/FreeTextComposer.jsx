import { useState } from 'react';

// Shared by the chat drawer — a plain free-text message to Guide.
export default function FreeTextComposer({ onSubmit, placeholder, pending }) {
  const [value, setValue] = useState('');

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    setValue('');
    onSubmit(trimmed);
  }

  return (
    <>
      <input
        aria-label="Message Scout"
        value={value}
        disabled={pending}
        placeholder={placeholder}
        onChange={event => setValue(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter') submit(); }}
      />
      <button type="button" className="btn btn-primary" disabled={pending || !value.trim()} onClick={submit}>Send</button>
    </>
  );
}
