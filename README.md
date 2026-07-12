# TravelWithMe — MVP Frontend

## Agent prompt provenance

Scout and Meridian API responses may include backend-owned prompt metadata:

```json
{
  "agent_meta": {
    "agent": "scout",
    "prompt_version": "1.0.0"
  }
}
```

The UI validates this metadata before persistence. Scout metadata is stored on the corresponding advice artifact, while Meridian metadata is stored on each recommendation payload. Existing localStorage records without metadata remain valid; developer logs and debug output represent them as `unknown/legacy` without writing a fabricated version back to state.

Prompt versions are internal debugging data and are not rendered in the traveler-facing UI. In the browser console, run `getTripPromptProvenance()` for the current trip or `getTripPromptProvenance('trip_id')` for a saved trip. The returned object is copyable and lists Scout advice and Meridian recommendation versions independently. Metadata never controls lifecycle stage, routing, CTA behavior, or resume navigation.
