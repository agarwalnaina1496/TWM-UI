// TWM-198: a trip title can arrive from Backend/agent-generated content
// already containing a literal HTML entity (e.g. "Kerala &amp; Backwaters")
// rather than the character it represents -- React's {expr} interpolation
// renders a string exactly as given, it never decodes entities the way a
// browser parsing raw HTML would. Decodes the handful of entities that
// realistically show up in trip-title text; anything else is left as-is
// rather than guessed at.
const HTML_ENTITY_PATTERN = /&amp;|&lt;|&gt;|&quot;|&#39;|&apos;/g;
const HTML_ENTITY_MAP = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'",
};

export function decodeHtmlEntities(text) {
  if (typeof text !== 'string' || !text.includes('&')) return text;
  return text.replace(HTML_ENTITY_PATTERN, entity => HTML_ENTITY_MAP[entity]);
}
