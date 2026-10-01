import '../../styles/destinations.css';

// TWM-234: the "matched" resting state's own panel -- choosing a destination
// and planning it are two separate traveler actions, so matched gets its own
// self-sufficient screen (destination name + Plan this trip / Compare other
// destinations), driven only by `selectedOption` (always present on a
// matched trip, straight off `lifecycle.selected_option`). Never gated on
// the full recommendations round loading -- that's a nice-to-have grid for
// browsing alternatives (OptionsCompare embeds this same panel above it when
// that round is available), not a precondition for a matched trip to be
// usable.
export default function MatchedDestinationPanel({
  selectedOptionName, planThis, planningId, compareOtherDestinations, unselecting,
}) {
  return (
    <div className="destination-picked">
      <p className="destination-picked-label">Your pick</p>
      <p className="destination-picked-name">{selectedOptionName}</p>
      <div className="destination-picked-actions">
        <button type="button" className="btn btn-pick-plan" onClick={planThis} disabled={planningId != null}>
          Plan this trip →
        </button>
        <button type="button" className="btn btn-ghost" onClick={compareOtherDestinations} disabled={unselecting}>
          Compare other destinations
        </button>
      </div>
    </div>
  );
}
