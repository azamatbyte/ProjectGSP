export const YEARS_OPTIONS = [];
const currentYear = new Date().getFullYear();
for (let year = currentYear+1; year >= 1990; year--) {
  YEARS_OPTIONS.push({ value: year.toString(), label: year.toString() });
}
