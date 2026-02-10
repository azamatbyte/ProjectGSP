/**
 * Compare two date-like values robustly.
 * Returns:
 *  -1 if a < b
 *   0 if a == b (same instant at chosen granularity, or both null/undefined)
 *   1 if a > b
 *
 * Options:
 *  - granularity: 'ms' | 'date'
 *      'ms'   compares exact timestamps (default)
 *      'date' compares only the UTC date (00:00:00)
 */
function compareDates(a, b, options = {}) {
  const granularity = options.granularity || 'ms';

  const toDate = (v) => {
    if (v == null) return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };

  const normalize = (d) => {
    if (!d) return null;
    if (granularity === 'date') {
        // normalize to local midnight instead of UTC midnight so comparisons use server local date
        const nd = new Date(d.getTime());
        nd.setHours(0, 0, 0, 0);
        return nd;
      }
    return d;
  };

  const da = normalize(toDate(a));
  const db = normalize(toDate(b));

  if (!da && !db) return 0; // both null/invalid
  if (!da) return -1; // null is considered smaller than any date
  if (!db) return 1;

  const ta = da.getTime();
  const tb = db.getTime();
  if (ta < tb) return -1;
  if (ta > tb) return 1;
  return 0;
}

module.exports = compareDates;
