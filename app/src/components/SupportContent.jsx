// TWM-176: real Self-Led contact/help surface — no TWM-Led upsell language.
// Shared by Dashboard's Support tab (trip-specific framing) and the
// standalone /support page (account-level, reachable with no trip open).
export default function SupportContent({ intro }) {
  return (
    <>
      <section className="support-box">
        <span className="support-label">Questions?</span>
        <p>{intro}</p>
        <button type="button" className="btn btn-primary" onClick={() => alert('This would open a conversation with the TravelWithMe team.')}>Talk to the TravelWithMe team</button>
      </section>
      <section className="support-faq" aria-label="Frequently asked questions">
        <h3>Common questions</h3>
        <details><summary>Can I change my dates after the plan is ready?</summary><p>Yes — head to Itinerary and use the chat there, or message support here with what you'd like to change.</p></details>
        <details><summary>What happens if a place I booked isn't available?</summary><p>Let us know here and we'll help you adjust the plan around it.</p></details>
        <details><summary>Do you book things for me?</summary><p>Not yet — right now TravelWithMe plans your trip and points you to real options to book yourself. Booking-on-your-behalf is on the roadmap.</p></details>
      </section>
    </>
  );
}
