import { useState } from 'react';

// Once Guide owns the trip, the pre-itinerary conversation (places,
// preferences, duration, clarifications) all happens in chat — this hook
// owns the two deterministic steps that used to live on the separate Plan
// Builder screen: silently advancing places -> a day plan once every
// necessary input is known, and generating the detailed itinerary.
export function useGuidePlanning(sendTripCommand, navigate) {
  const [generating, setGenerating] = useState(false);

  // Call after any response where Guide owns the trip, passing
  // trip_state.planner_state. Returns the approve_places response when it
  // silently advanced the plan, otherwise null — callers append its message
  // onto the chat log when present.
  async function maybeAdvancePlaces(plannerState) {
    const hasPlaces = (plannerState?.places?.length || 0) > 0;
    const hasDayPlan = (plannerState?.day_plan?.length || 0) > 0;
    const awaiting = plannerState?.conversation_context?.awaiting;
    if (!hasPlaces || hasDayPlan || awaiting) return null;
    return sendTripCommand('approve_places');
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

  return { maybeAdvancePlaces, generateItinerary, generating };
}
