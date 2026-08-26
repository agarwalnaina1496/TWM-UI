// TWM-176: real Self-Led contact/help surface — no TWM-Led upsell language.
// Shared by Dashboard's Support tab (trip-specific framing) and the
// standalone /support page (account-level, reachable with no trip open).
// TWM-198: the "Talk to the TravelWithMe team" CTA was alert-only fake —
// no real contact channel exists yet (no support email, no live chat).
// Hidden rather than replaced with an invented address, per this
// product's own no-fake-interaction principle; FAQ copy no longer
// promises a "message support here" action that doesn't exist.
export default function SupportContent({ intro }) {
  return (
    <>
      <section className="support-box">
        <span className="support-label">Questions?</span>
        <p>{intro}</p>
      </section>
      <section className="support-faq" aria-label="Frequently asked questions">
        <h3>Common questions</h3>
        <details><summary>Can I change my dates after the plan is ready?</summary><p>Yes — head to Itinerary and use the chat there to ask for changes.</p></details>
        <details><summary>What happens if a place I booked isn't available?</summary><p>Head to Itinerary and let the chat there know what's changed — it'll help you adjust the plan around it.</p></details>
        <details><summary>Do you book things for me?</summary><p>Not yet — right now TravelWithMe plans your trip and points you to real options to book yourself. Booking-on-your-behalf is on the roadmap.</p></details>
      </section>
    </>
  );
}
