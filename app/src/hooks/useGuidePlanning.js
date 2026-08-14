import { useState } from 'react';

// Guide now generates places and the day plan together in a single step —
// there is no places-only intermediate state to silently advance through.
// This hook owns the one remaining deterministic step: freezing the plan
// and generating the detailed itinerary.
export function useGuidePlanning(sendTripCommand, navigate) {
  const [generating, setGenerating] = useState(false);

  // True once Guide has produced a complete plan (places + day plan
  // together) — the traveler should land on the unified Plan Builder.
  function planReady(plannerState) {
    const hasPlaces = (plannerState?.places?.length || 0) > 0;
    const hasDayPlan = (plannerState?.day_plan?.length || 0) > 0;
    return hasPlaces && hasDayPlan;
  }

  async function generateItinerary() {
    setGenerating(true);
    try {
      const response = await sendTripCommand('approve_plan');
      if (response.trip.trip_state.planner_state?.frozen_plan) navigate('/dashboard');
      return response;
    } finally {
      setGenerating(false);
    }
  }

  return { planReady, generateItinerary, generating };
}
