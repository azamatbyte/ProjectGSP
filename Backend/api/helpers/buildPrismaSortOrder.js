/**
 * Builds a Prisma-compatible orderBy array from sort parameters.
 *
 * @param {string|undefined} sortParam - JSON-encoded array of { field, order } objects from query string
 * @param {string|undefined} sortField - Legacy single sort field
 * @param {string|undefined} sortOrder - Legacy single sort order ("ASC" or "DESC")
 * @param {string[]} allowedFields - Whitelist of allowed field names
 * @param {Object[]} defaultSort - Default Prisma orderBy array, e.g. [{ createdAt: "desc" }]
 * @returns {Object[]} Prisma orderBy array
 */
function buildPrismaSortOrder(sortParam, sortField, sortOrder, allowedFields, defaultSort) {
  let sortFields = [];

  // Try parsing the JSON sort array first
  if (sortParam) {
    try {
      const parsed = JSON.parse(sortParam);
      if (Array.isArray(parsed)) {
        sortFields = parsed;
      }
    } catch (e) {
      // Invalid JSON, ignore
    }
  }

  // Fallback to legacy single field/order params
  if (sortFields.length === 0 && sortField) {
    sortFields = [{ field: sortField, order: sortOrder || "ASC" }];
  }

  // Validate and build orderBy
  const orderBy = sortFields
    .filter((s) => s.field && allowedFields.includes(s.field))
    .map((s) => ({
      [s.field]: s.order?.toUpperCase() === "DESC" ? "desc" : "asc",
    }));

  return orderBy.length > 0 ? orderBy : defaultSort;
}

module.exports = buildPrismaSortOrder;
