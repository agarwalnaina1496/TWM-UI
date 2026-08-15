const PACE_LEVEL = { relaxed: 1, balanced: 2, packed: 3 };

// TWM-174: pace shown as a density meter, not a text badge — three bars,
// filled up to the day's pace level, so relaxed/balanced/packed reads as a
// visual intensity rather than another label to parse.
export default function PaceMeter({ pace }) {
  const level = PACE_LEVEL[pace] ?? 0;
  return (
    <span className="pace-meter" role="img" aria-label={`Pace: ${pace}`}>
      {[1, 2, 3].map(bar => (
        <span key={bar} className={`pace-meter-bar${bar <= level ? ' filled' : ''}`} />
      ))}
      <span className="pace-meter-label">{pace}</span>
    </span>
  );
}
