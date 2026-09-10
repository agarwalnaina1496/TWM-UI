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

// "2026-09-26" -> "Fri, 26 Sep" (weekday + day + month, no year).
export function weekdayDayLabel(iso) {
  if (!iso) return null;
  const [year, month, day] = String(iso).split('-').map(Number);
  if (!year || !month || !day) return String(iso);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

// A check-in -> check-out span: "Fri, 26 Sep → Sun, 28 Sep 2026". The year
// rides on the check-out only. Falls back to a single label when one end is
// missing.
export function rangeLabel(checkinIso, checkoutIso) {
  const start = weekdayDayLabel(checkinIso);
  if (!checkoutIso) return start;
  const [y, m, d] = String(checkoutIso).split('-').map(Number);
  const end = (y && m && d)
    ? new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : String(checkoutIso);
  return start ? `${start} → ${end}` : end;
}

// Whole nights between two ISO dates (0 when either is missing or invalid).
export function nightsBetween(checkinIso, checkoutIso) {
  if (!checkinIso || !checkoutIso) return 0;
  const [ay, am, ad] = String(checkinIso).split('-').map(Number);
  const [by, bm, bd] = String(checkoutIso).split('-').map(Number);
  if (!ay || !by) return 0;
  const ms = new Date(by, bm - 1, bd) - new Date(ay, am - 1, ad);
  return ms > 0 ? Math.round(ms / 86400000) : 0;
}

// One day after an ISO date, as ISO — the minimum a check-out can be.
export function nextDayIso(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return null;
  const next = new Date(y, m - 1, d + 1);
  const mm = String(next.getMonth() + 1).padStart(2, '0');
  const dd = String(next.getDate()).padStart(2, '0');
  return `${next.getFullYear()}-${mm}-${dd}`;
}

// Today as an ISO date in the viewer's own timezone (not UTC).
export function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
