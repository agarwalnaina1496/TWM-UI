import { useDestinationsMatching } from '../hooks/useDestinationsMatching.js';
import BackToTrip from '../components/BackToTrip.jsx';
import ScreenHeader from '../components/ui/ScreenHeader.jsx';
import Layout from '../components/Layout.jsx';
import CheckpointOverlay from '../components/destinations/CheckpointOverlay.jsx';
import DestinationsPanel from '../components/destinations/DestinationsPanel.jsx';
import { useTripFromUrl } from '../hooks/useTripFromUrl.js';
import '../styles/destinations.css';

export default function Destinations() {
  useTripFromUrl();
  const state = useDestinationsMatching();

  return (
    <Layout>
      {state.checkpointAwaiting && (
        <CheckpointOverlay
          knownFacts={state.pills}
          message={state.checkpointMessage}
          value={state.checkpointInput}
          onChange={state.setCheckpointInput}
          onSubmit={state.submitCheckpoint}
          busy={state.checkpointBusy}
          error={state.checkpointError}
        />
      )}
      <BackToTrip />
      <ScreenHeader
        eyebrow="Destination matcher"
        title={<>Let's find <em>your</em> place</>}
        lede={
          state.selectedOptionName
            ? `Not ${state.selectedOptionName} after all? Compare your options below and pick a different one.`
            : 'Matching against what you just told me — ranked by how well each fits.'
        }
      />
      {state.pills.length > 0 && <div className="trip-recap">{state.pills.map(p => <span key={p} className="recap-pill">{p}</span>)}</div>}

      <DestinationsPanel {...state} />
    </Layout>
  );
}
