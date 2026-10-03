import { useLocation } from 'react-router-dom';
import { usePlanBuilder } from '../hooks/usePlanBuilder.js';
import BackToTrip from '../components/BackToTrip.jsx';
import ScreenHeader from '../components/ui/ScreenHeader.jsx';
import PlanBuilderPanel from '../components/planBuilder/PlanBuilderPanel.jsx';
import '../styles/preview.css';

// The single unified Plan Builder screen for both entry paths (known
// destination and discover). Guide generates places and the day plan
// together in one step — there is no separate approve-places screen at any
// point, and this screen is the real destination for both paths (the
// known-destination path used to bypass it entirely and land on /dashboard).
//
// TWM-190: reached only once Guide has produced a day_plan — the still-
// gating conversation lives on ScoutChat.jsx / the embedded chat panel, not
// a second chat implementation here.
export default function TripPreview() {
  const location = useLocation();
  // A Guide message carried over from the chat turn that completed the plan
  // (JourneyEntry/ScoutChat navigate here with it in location.state, since
  // this component mounting fresh would otherwise lose it).
  const planBuilder = usePlanBuilder({ embedded: false, guideMessage: location.state?.guideMessage });
  const { reversing, bootStatus, plan, summary } = planBuilder;
  const ready = !reversing && bootStatus === 'ready' && plan;

  return (
    <main className="wrap plan-builder">
      {!reversing && <BackToTrip />}
      {ready && (
        <ScreenHeader
          eyebrow="✦ Scout"
          title={<>{summary.destinationLabel || 'Your trip'} <em>| {summary.durationDays} days</em></>}
          lede="Shape the places and day pace together. Dates can stay open until you book."
        />
      )}
      <PlanBuilderPanel {...planBuilder} />
    </main>
  );
}
