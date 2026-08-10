import { computeBudget } from '../lib/mockAtlasTrip.js';

const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

export default function TripHero({ atlas, version, travelers = 2, actions = null }) {
  const budget = computeBudget(atlas.cost_items);
  const tripDatesLabel = atlas.start_date || (atlas.scenario_id?.includes('year_end') ? 'Dec – Jan' : 'Flexible dates');

  return (
    <section className="dashboard-hero">
      {actions && <div className="hero-top"><div className="hero-actions">{actions}</div></div>}
      <h1 className="hero-title">Your <em>circuit</em> escape</h1>
      <p className="hero-desc">Built for two who want forts, temples and unhurried travel across four bases — Gwalior, Orchha, Khajuraho and Panna — over fourteen flexible days.</p>
      <div className="hero-stats">
        <div><strong>{version.days.length}</strong><span>Days</span></div>
        <div><strong>{travelers}</strong><span>Travelers</span></div>
        <div><strong>{tripDatesLabel}</strong><span>Trip dates</span></div>
        <div><strong>{money(budget.low)}–{money(budget.high)}</strong><span>Total for {travelers}</span></div>
      </div>
      <div className="hero-why">
        <span className="hero-why-label">Why this route</span>
        <p>Gwalior anchors the arrival gateway from Delhi. Orchha and Khajuraho follow without backtracking, adding riverside forts and temple heritage. Panna closes the loop as a reserve-edge stay before the return leg — the order keeps every transfer moving forward, not in circles.</p>
      </div>
    </section>
  );
}
