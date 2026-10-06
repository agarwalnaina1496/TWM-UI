import { useLocation, useNavigate } from 'react-router-dom';
import BackToTrip from '../components/BackToTrip.jsx';
import ScreenHeader from '../components/ui/ScreenHeader.jsx';
import PlanBuilderSection from '../features/plan-builder/PlanBuilderSection.jsx';

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
  const navigate = useNavigate();

  return (
    <main className="wrap plan-builder">
      <PlanBuilderSection
        // A Guide message carried over from the chat turn that completed the
        // plan (ScoutChat navigates here with it in location.state, since
        // this component mounting fresh would otherwise lose it).
        guideMessage={location.state?.guideMessage}
        navigateTo={(path, opts) => (opts ? navigate(path, opts) : navigate(path))}
        chrome={({ reversing, ready, summary }) => (
          <>
            {!reversing && <BackToTrip />}
            {ready && (
              <ScreenHeader
                eyebrow="✦ Scout"
                title={<>{summary.destinationLabel || 'Your trip'} <em>| {summary.durationDays} days</em></>}
                lede="Shape the places and day pace together. Dates can stay open until you book."
              />
            )}
          </>
        )}
      />
    </main>
  );
}
