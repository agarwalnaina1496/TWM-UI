import CheckpointOverlay from './CheckpointOverlay.jsx';
import { useYourPick } from './useYourPick.js';
import '../../styles/feedback.css';
import './your-pick.css';

// The "Your pick" section: the destination the traveler chose, and the two
// ways forward -- plan it, or look at other destinations. Fully
// self-contained like DestinationsSection: it reads the current trip itself,
// owns its commands and the one-more-detail checkpoint that planning can ask
// for, and carries its own styling. Render it with <YourPickSection />;
// pass `onPlanStarted` only if the place it lives needs to navigate once
// planning has started.
export default function YourPickSection({ onPlanStarted }) {
  const pick = useYourPick({ onPlanStarted });
  return (
    <>
      {pick.checkpointAwaiting && (
        <CheckpointOverlay
          knownFacts={pick.pills}
          message={pick.checkpointMessage}
          value={pick.checkpointInput}
          onChange={pick.setCheckpointInput}
          onSubmit={pick.submitCheckpoint}
          busy={pick.checkpointBusy}
          error={pick.checkpointError}
        />
      )}
      <div className="destination-picked">
        <p className="destination-picked-label">Your pick</p>
        <p className="destination-picked-name">{pick.selectedOptionName}</p>
        <div className="destination-picked-actions">
          <button type="button" className="btn btn-pick-plan" onClick={pick.planThis} disabled={pick.planning}>
            Plan this trip →
          </button>
          <button type="button" className="btn btn-ghost" onClick={pick.compareOtherDestinations} disabled={pick.unselecting}>
            Compare other destinations
          </button>
        </div>
        {pick.error && <div className="price-evidence state-unsafe" role="alert">{pick.error}</div>}
      </div>
    </>
  );
}
