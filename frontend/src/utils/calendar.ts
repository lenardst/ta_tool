/** Local calendar date as YYYY-MM-DD (not UTC). */
export function localISODate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** True when `date` (YYYY-MM-DD) is strictly before today's local date. */
export function isPastSessionDate(date: string | null | undefined): boolean {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return date < localISODate();
}
