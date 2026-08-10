import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTrip } from '../context/TripContext.jsx';
import { safeRecommendationViewModel } from '../lib/recommendationViewModel.js';
import '../styles/destinations.css';

const BUDGET_LABEL = { budget: 'Under ₹30k', mid: '₹30k–70k', premium: '₹70k+', flexible: 'Flexible budget' };
const STYLE_LABEL = { relaxed: 'Relaxed pace', packed: 'Packed days', nature: 'Nature-first', food: 'Food & culture-led' };

const OUTCOME_ICON = { MATCH: '✓', TRADEOFF: '⚠', MISMATCH: '✕' };

// Fake-backend: stands in for a real Meridian/Matcher recommendation call.
// Shaped to mirror Meridian's real contract — a shared traveler_criteria catalog
// joined to each option's evaluations by criterion_id, with a details union
// (bullets/facts/cost_breakdown) and tradeoffs/other_considerations — so the
// real-integration swap in TWM-104 is close to drop-in.
function fakeMatchResults(trip, referenceOptionId = null) {
  const styleNote = {
    packed: 'Plenty to pack into busy days',
    nature: 'Nature-first, matches what you picked',
    food: 'Strong food & culture scene',
    relaxed: 'Matches the relaxed, slower pace you picked',
  }[trip.style] || 'Matches the pace you picked';

  const budgetNote = {
    budget: 'Fits comfortably under ₹30,000',
    premium: 'Room to go premium at ₹70,000+',
    mid: 'Fits well within ₹30,000–70,000',
    flexible: 'Works across a flexible budget',
  }[trip.budget] || 'Works across a flexible budget';

  const result = {
    status: 'SUCCESS',
    state_delta: { trip_context: {}, matcher_state: {} },
    message: 'Ranked by fit, with every trade-off called out.',
    trip_type: 'mixed',
    traveler_criteria: [
      { id: 'style', label: 'Trip style', requirement_type: 'PREFERENCE', source_context_paths: ['travel_style.pace'] },
      { id: 'budget', label: 'Budget', requirement_type: 'HARD', source_context_paths: ['budget'] },
      { id: 'travel-time', label: 'Travel time', requirement_type: 'PREFERENCE', source_context_paths: ['travel_preferences.duration'] },
    ],
    options: [
      {
        rank: 1,
        type: 'single',
        name: 'Pondicherry',
        destination_id: 'pondicherry',
        summary: 'Best overall fit for a relaxed, food-forward trip within budget.',
        evaluations: [
          {
            criterion_id: 'style',
            outcome: 'MATCH',
            conclusion: styleNote,
            details: [{ type: 'bullets', items: ['French Quarter cafes and slow beach mornings', 'No long transfers between stops'] }],
          },
          {
            criterion_id: 'budget',
            outcome: 'MATCH',
            conclusion: budgetNote,
            details: [{ type: 'cost_breakdown', currency: 'INR', items: [
              { label: 'Stay + activities', per_person: { minimum: 6000, maximum: 9000 } },
              { label: 'Local transport', per_person: { minimum: 800, maximum: 1200 } },
            ] }],
          },
          {
            criterion_id: 'travel-time',
            outcome: 'MATCH',
            conclusion: 'Short flight + drive from most South Indian cities.',
            details: [{ type: 'facts', facts: [{ label: 'Nearest airport', value: 'Chennai, ~3h drive' }] }],
          },
        ],
        other_considerations: ['Weekend crowds can be heavy near the beach promenade'],
      },
      {
        rank: 2,
        type: 'circuit',
        name: 'Kochi + Alleppey',
        circuit_id: 'kochi-alleppey',
        summary: 'Backwaters + heritage town circuit — a slightly tighter budget fit.',
        evaluations: [
          {
            criterion_id: 'style',
            outcome: 'MATCH',
            conclusion: 'Backwaters + heritage town covers both a relaxed pace and a food & culture scene.',
            details: [{ type: 'bullets', items: ['Houseboat overnight on the backwaters', 'Fort Kochi heritage walk and cafes'] }],
          },
          {
            criterion_id: 'budget',
            outcome: 'TRADEOFF',
            conclusion: 'A houseboat night pushes the daily average up, but it still stays workable.',
            details: [{ type: 'cost_breakdown', currency: 'INR', items: [
              { label: 'Houseboat night', per_person: { minimum: 3500, maximum: 5000 } },
              { label: 'Kochi stay + activities', per_person: { minimum: 4000, maximum: 6000 } },
            ] }],
            tradeoffs: ['Tighter than a single-base stay — ~₹3,000/person more than Pondicherry'],
          },
          {
            criterion_id: 'travel-time',
            outcome: 'MATCH',
            conclusion: 'Direct flight into Kochi, short road transfer to Alleppey.',
            details: [{ type: 'facts', facts: [{ label: 'Kochi → Alleppey transfer', value: '~90 min by road' }] }],
          },
        ],
        other_considerations: ['Two check-ins to manage', 'Backwater cruise timing is weather-dependent'],
      },
      {
        rank: 3,
        type: 'single',
        name: 'Munnar, Kerala',
        destination_id: 'munnar',
        summary: 'Tea-garden hills, best for a slower trip — further to reach.',
        evaluations: [
          {
            criterion_id: 'style',
            outcome: 'MATCH',
            conclusion: 'Tea gardens and misty hills suit a slower trip.',
            details: [{ type: 'bullets', items: ['Eravikulam National Park', 'Tea Museum + estate walks'] }],
          },
          {
            criterion_id: 'budget',
            outcome: 'MATCH',
            conclusion: budgetNote,
            details: [{ type: 'cost_breakdown', currency: 'INR', items: [{ label: 'Stay + activities', per_person: { minimum: 5500, maximum: 8000 } }] }],
          },
          {
            criterion_id: 'travel-time',
            outcome: 'MISMATCH',
            conclusion: 'Nearest airport is noticeably further than the other two options.',
            details: [{ type: 'facts', facts: [{ label: 'Nearest airport', value: 'Kochi, ~3.5h by road' }] }],
            tradeoffs: ['~3.5h road transfer vs under an hour for the other options'],
          },
        ],
        other_considerations: [],
      },
    ],
  };

  if (!referenceOptionId) return result;
  const reference = result.options.find(option => (option.destination_id || option.circuit_id) === referenceOptionId);
  return {
    ...result,
    message: `Refreshed around ${reference.name}, while keeping your existing preferences.`,
    options: [reference, ...result.options.filter(option => (option.destination_id || option.circuit_id) !== referenceOptionId)].map((option, index) => ({ ...option, rank: index + 1 })),
  };
}

const PROTOTYPE_METADATA = {
  pondicherry: { places: null, estimated_per_person: [8200, 11200], access_summary: 'Chennai airport + ~3h road transfer', price_preview: [
    { state: 'current', total: [16800, 22200], source: 'Prototype provider mix', checkedAt: 'Just now' },
    { state: 'stale', total: [16100, 21900], source: 'Prototype provider mix', checkedAt: 'Checked 3 days ago' },
  ] },
  'kochi-alleppey': { places: ['Kochi', 'Alleppey'], estimated_per_person: [11500, 15800], access_summary: 'Kochi airport + ~90 min road transfer', price_preview: [
    { state: 'partial', total: [23500, 30200], source: 'Prototype stays + transport sources', checkedAt: 'Just now', note: 'Houseboat availability was not returned.' },
    { state: 'unavailable', source: 'Prototype provider mix', checkedAt: 'Just now', note: 'No safe price result is available.' },
  ] },
  munnar: { places: null, estimated_per_person: [9000, 12600], access_summary: 'Kochi airport + ~3.5h road transfer', price_preview: [
    { state: 'unsafe', source: 'Malformed prototype response', checkedAt: 'Just now', note: 'The result was hidden because it could not be validated safely.' },
  ] },
};

function matchViewModel(trip, referenceOptionId = null) {
  return safeRecommendationViewModel(fakeMatchResults(trip, referenceOptionId), PROTOTYPE_METADATA);
}

function optionLabel(option) {
  return option.type === 'circuit' ? `${option.prototype.places.join(' + ')} circuit` : 'Single destination';
}

function criterionLabel(travelerCriteria, criterionId) {
  return travelerCriteria.find(c => c.id === criterionId)?.label || criterionId;
}

function DetailBlock({ detail }) {
  if (detail.type === 'bullets') {
    return (
      <div className="detail-tags">
        {detail.items.map(item => <span key={item} className="detail-tag">{item}</span>)}
      </div>
    );
  }
  if (detail.type === 'facts') {
    return (
      <div className="detail-facts">
        {detail.facts.map(f => (
          <div key={f.label} className="detail-fact">
            <span className="detail-fact-label">{f.label}</span>
            <span className="detail-fact-value">{f.value}</span>
          </div>
        ))}
      </div>
    );
  }
  if (detail.type === 'cost_breakdown') {
    const currency = detail.currency === 'INR' ? '₹' : detail.currency;
    return (
      <table className="detail-cost-table">
        <thead>
          <tr><th>Item</th><th>Per person</th></tr>
        </thead>
        <tbody>
          {detail.items.map(item => (
            <tr key={item.label}>
              <td>{item.label}</td>
              <td>{currency}{item.per_person.minimum.toLocaleString('en-IN')}–{item.per_person.maximum.toLocaleString('en-IN')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return null;
}

function moneyRange(range) {
  return `₹${range[0].toLocaleString('en-IN')}–₹${range[1].toLocaleString('en-IN')}`;
}

function PriceEvidence({ evidence }) {
  if (!evidence) {
    return <div className="price-evidence state-not-checked"><strong>Not checked</strong><span>Use Check prices to preview the final action state.</span></div>;
  }

  const label = {
    current: 'Verified/current mock',
    stale: 'Stale mock result',
    partial: 'Partial mock result',
    unavailable: 'Price unavailable',
    unsafe: 'Unsafe result hidden',
  }[evidence.state];

  return (
    <div className={`price-evidence state-${evidence.state}`} role="status">
      <strong>{label}</strong>
      {evidence.total && <span className="checked-total">{moneyRange(evidence.total)} total for the party</span>}
      <span>{evidence.source} · {evidence.checkedAt}</span>
      {evidence.note && <span>{evidence.note}</span>}
      <small>Prototype only — not a live quote or availability guarantee.</small>
    </div>
  );
}

export default function Destinations() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { trip, updateTrip } = useTrip();
  const nextMode = params.get('next') || 'preview'; // 'preview' or 'none'

  const [thinking, setThinking] = useState(true);
  const [match, setMatch] = useState(null);
  const [matchError, setMatchError] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [priceSteps, setPriceSteps] = useState({});

  useEffect(() => {
    const t = setTimeout(() => {
      const result = matchViewModel(trip);
      setMatch(result.data);
      setMatchError(result.error);
      setThinking(false);
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pills = [];
  if (trip.origin) pills.push('From ' + trip.origin);
  pills.push(BUDGET_LABEL[trip.budget] || 'Flexible budget', STYLE_LABEL[trip.style] || 'Relaxed pace', `${trip.travelers} ${trip.travelers === 1 ? 'traveler' : 'travelers'}`);
  if (trip.month !== 'flexible') pills.push(trip.month);

  function toOption(option) {
    return { type: option.type, name: option.name, places: option.prototype.places };
  }

  function planThis(option) {
    updateTrip({ destination: toOption(option) });
    navigate('/trip-preview');
  }

  function moreLikeThis(option) {
    const result = matchViewModel(trip, option.key);
    setMatch(result.data);
    setMatchError(result.error);
    setOpenId(null);
    setPriceSteps({});
  }

  function checkPrices(option) {
    setPriceSteps(previous => ({
      ...previous,
      [option.key]: ((previous[option.key] ?? -1) + 1) % option.prototype.price_preview.length,
    }));
  }

  return (
    <div className="wrap">
      <span className="eyebrow">Destination matcher</span>
      <h1>Let's find <em>your</em> place</h1>
      <p className="lede">Matching against what you just told me — ranked by how well each fits.</p>
      <div className="trip-recap">{pills.map(p => <span key={p} className="recap-pill">{p}</span>)}</div>

      {thinking && (
        <div className="think"><span className="dot-flash"></span><span className="dot-flash"></span><span className="dot-flash"></span> Matching destinations to your answers…</div>
      )}

      {!thinking && matchError && (
        <div className="price-evidence state-unsafe" role="alert">
          <strong>Recommendations unavailable</strong>
          <span>We could not validate the recommendation response safely. Please try again.</span>
        </div>
      )}

      {!thinking && match && (
        <div>
          <h2 className="section-title">A few that fit well</h2>
          <p className="lede">{match.message}</p>
          {match.options.map((d, i) => {
            const isBest = i === 0;
            const isOpen = openId === d.key;
            const priceStep = priceSteps[d.key];
            const priceEvidence = priceStep === undefined ? null : d.prototype.price_preview[priceStep];
            const totalEstimate = d.prototype.estimated_per_person.map(value => value * (trip.travelers || 1));
            return (
              <div key={d.key} className={`dest-card${isBest ? ' best' : ''}`}>
                {isBest && <span className="pick-badge">Our pick</span>}
                <div className="dest-name">{d.name}</div>
                <div className="dest-tag">{optionLabel(d)}</div>
                <p className="dest-summary">{d.summary}</p>
                <div className="decision-facts">
                  <span><strong>{moneyRange(totalEstimate)}</strong> estimated total for {trip.travelers || 1}</span>
                  <span>{d.prototype.access_summary}</span>
                </div>
                <div className="estimate-qualifier">Qualified planning estimate · based on mock assumptions · not checked prices</div>
                <div className="criteria-list">
                  {d.evaluations.map(ev => (
                    <span key={ev.criterion_id} className={`criteria-pill outcome-${ev.outcome.toLowerCase()}`}>
                      {OUTCOME_ICON[ev.outcome]} {criterionLabel(match.criteria, ev.criterion_id)}
                    </span>
                  ))}
                  {d.other_considerations.length > 0 && (
                    <span
                      className="criteria-pill outcome-more"
                      title={d.other_considerations.join(' · ')}
                    >
                      +{d.other_considerations.length} other consideration{d.other_considerations.length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                <button type="button" className="reason-toggle" onClick={() => setOpenId(isOpen ? null : d.key)}>
                  Why this one <span>{isOpen ? '▴' : '▾'}</span>
                </button>
                {isOpen && (
                  <div className="reason-body open">
                    {d.evaluations.map(ev => (
                      <div key={ev.criterion_id} className="eval-block">
                        <div className="eval-head">
                          <span className={`criteria-pill outcome-${ev.outcome.toLowerCase()}`}>{OUTCOME_ICON[ev.outcome]} {criterionLabel(match.criteria, ev.criterion_id)}</span>
                          <span className="eval-conclusion">{ev.conclusion}</span>
                        </div>
                        {ev.details.map((detail, di) => <DetailBlock key={di} detail={detail} />)}
                        {ev.tradeoffs?.map(t => <div key={t} className="eval-tradeoff">⚠ {t}</div>)}
                      </div>
                    ))}
                    {d.other_considerations.length > 0 && (
                      <div className="other-considerations">
                        <div className="other-considerations-title">Other considerations</div>
                        <div className="detail-tags">
                          {d.other_considerations.map(o => <span key={o} className="detail-tag">{o}</span>)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <PriceEvidence evidence={priceEvidence} />
                <div className="dest-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => moreLikeThis(d)}>✨ More like this</button>
                  <button type="button" className="btn btn-ghost" onClick={() => checkPrices(d)}>{priceEvidence ? 'Refresh mock prices' : 'Check prices'}</button>
                  {nextMode === 'preview'
                    ? <span className="btn btn-primary" onClick={() => planThis(d)}>Plan this trip →</span>
                    : <Link className="btn btn-primary" to="/trip-preview" onClick={() => updateTrip({ destination: toOption(d) })}>Want to plan this? →</Link>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
