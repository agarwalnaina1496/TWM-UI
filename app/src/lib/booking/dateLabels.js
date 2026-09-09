// TWM-228: date-label helpers for the booking drawers. All parse from the
// split parts and build a local-time Date, so a viewer west of UTC never
// sees a stored date shifted back a day (`new Date("2026-09-26")` is UTC
// midnight and `toLocaleDateString` would render it as the 25th in the
// Americas).

// "2026-10" -> "October 2026"
export function monthLabel(yyyymm) {
  if (!yyyymm) return null;
  const [year, month] = String(yyyymm).split('-').map(Number);
  if (!year || !month) return String(yyyymm);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

// "2026-09-26" -> "Sep 26"
export function dayLabel(iso) {
  if (!iso) return null;
  const [year, month, day] = String(iso).split('-').map(Number);
  if (!year || !month || !day) return String(iso);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Today as an ISO date in the viewer's own timezone (not UTC).
export function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
