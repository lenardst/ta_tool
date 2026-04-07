/**
 * Today's calendar date as YYYY-MM-DD in America/Los_Angeles (US Pacific, DST-aware).
 * Used for summary stats so "past sessions" match Pacific local dates.
 */
function pacificTodayYmd() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

module.exports = { pacificTodayYmd };
