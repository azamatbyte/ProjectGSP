// Helper to safely convert values to string
// - null or undefined => empty string
// - otherwise => String(value)
function safeString(value) {
  if (value === null || value === undefined) return "";
  try {
    return String(value);
  } catch (e) {
    return "";
  }
}

module.exports = safeString;
