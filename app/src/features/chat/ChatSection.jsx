import { useTrip } from '../../context/TripContext.jsx';
import FactsPanel from '../../components/FactsPanel.jsx';
import { newIdempotencyKey } from '../../lib/tripApi.js';
import ChatConversation from './ChatConversation.jsx';
import { resumedGreeting } from './chatGreeting.js';
import '../../styles/chat.css';

// The chat section: a conversation with Scout about the current trip, with
// the known-facts panel beside it. Self-contained -- it reads the current
// trip itself, so <ChatSection /> alone is a working chat, wherever it is
// rendered (inside Dashboard Overview, or as the standalone chat page).
//
// Everything below is optional, for a place with more to do around it:
//   layout       'embedded' (default, inline in a page) or 'page' (full screen)
//   top / header page chrome placed before the context bar / before the facts
//   greeting     opening lines for a brand-new conversation (a resumed trip
//                gets a recap of where it left off)
//   onSend, onPlanReady, onSeeDestinations, initialMessage,
//   inputLabelOverride, sendLabelOverride   see ChatConversation
export default function ChatSection({
  layout = 'embedded', top, header, greeting, initialMessage,
  onSend, onPlanReady, onSeeDestinations, inputLabelOverride, sendLabelOverride,
}) {
  const { commandSnapshot: view, sendTripCommand, tripLoadStatus } = useTrip();
  const activeAgent = view?.lifecycle?.active_agent;
  const stage = view?.lifecycle?.stage;
  const awaiting = activeAgent === 'guide' ? view?.plan?.awaiting : view?.matcher?.awaiting;
  const send = onSend ?? (text => sendTripCommand('traveler_message', { message: text, idempotencyKey: newIdempotencyKey() }));

  return (
    <div className={layout === 'page' ? 'chat-page chat-screen' : 'chat-screen embedded-chat-panel'}>
      {top}
      <div className="chat-context-bar" role="status"><span aria-hidden="true">ⓘ</span>Scout is here to help with your trip.</div>
      {header}
      <FactsPanel contextRecap={view?.context_recap} />
      <ChatConversation
        tripLoadStatus={tripLoadStatus}
        activeAgent={activeAgent}
        stage={stage}
        awaiting={awaiting}
        greeting={greeting ?? resumedGreeting(view, { activeAgent, awaiting })}
        initialMessage={initialMessage}
        onSend={send}
        onPlanReady={onPlanReady}
        onSeeDestinations={onSeeDestinations}
        inputLabelOverride={inputLabelOverride}
        sendLabelOverride={sendLabelOverride}
      />
    </div>
  );
}
