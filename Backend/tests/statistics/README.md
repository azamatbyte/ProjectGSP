# Statistics document tests

Run from `Backend`:

```powershell
node --test --test-reporter=spec tests/statistics/*.test.js tests/statistics/reports/*.test.js tests/statistics/monitoring-dashboard/*.test.js
```

The seven endpoint suites and shared lifecycle suite contain 177 passing tests. The tests call the real
controller functions and serialize actual DOCX/XLSX bytes. Prisma is replaced
before controller loading and writes into `Backend/uploads` are captured in
memory. No production database, backup, or report is created by these suites.
Route mounting, token verification and service permissions are tested separately
by the central HTTP suite; weekly authorization inside the controller is also
covered here.

| Endpoint | File | Cases |
| --- | --- | --- |
| POST `/statistics/reportStatements` | `reports/reportStatements.test.js` | 39: response and metadata, all/named/deduplicated workplaces, totals, zero counts, missing inputs, query/write errors, complete document layout |
| POST `/statistics/reportFromForm` | `reports/reportFromForm.test.js` | 10: both form models, eight distinct metrics, subtotals/grand total, empty models, skipped failed form, dates, metadata/error paths, complete document layout |
| POST `/statistics/statisticsByForm` | `reports/statisticsByForm.test.js` | 13: workplace/model filtering, deduplication, exact UTC range and expired cutoff, totals, 400/404/500, complete document layout |
| POST `/statistics/statisticsByYear` | `reports/statisticsByYear.test.js` | 13: multiple years, eight metrics, UTC calendar bounds, selected executors, validation/errors, omitted executor defect, complete document layout |
| POST `/statistics/monitoringByAdmin` | `monitoring-dashboard/monitoringByAdmin.test.js` | 30: active/named/missing operators, 12 months plus separate year count, Tashkent calendar bounds, totals, landscape layout, metadata/file failure |
| POST `/statistics/weeeklyReport` | `monitoring-dashboard/weeeklyReport.test.js` | 18: all/single/multiple operators, inline permission paths, overdue filters, optional fields, empty report, errors, conditional operator column, 48 long Unicode rows and complete document layout |
| POST `/statistics/dashboard_chart_export` | `monitoring-dashboard/exportDashboardChart.test.js` | 36: all four chart keys, YEAR/MONTH, rankings, bigint/zero counts, malformed inputs, each data source's query failures, write/directory failure, actual image bytes and worksheet formatting |
| All six Word endpoints above | `documentLifecycle.test.js` | 18: serialization failure, disk failure and repeated requests for each endpoint; validates metadata ordering, unique filenames and real DOCX bytes |

## Formatting assertions

For Word reports the tests inspect `word/document.xml`, styles and header/footer
relationships. They assert:

- Section count, portrait/landscape dimensions and all seven page margin values
  (top, right, bottom, left, header, footer, gutter).
- Explicit or absent header/footer parts, columns, title page and page breaks.
- Body block order and every title, separator, date line and table paragraph.
- Font size and complex-script size, bold/italic/color, default font inheritance,
  alignment, paragraph spacing, absent indents/tabs/numbering and keep properties.
- Table width, alignment, layout, indentation, grid widths and all six borders.
- Every row's height/repeating/split properties and every cell's width, vertical
  alignment, merges, shading, borders and margin overrides (Word cell padding).
- Actual values and totals as well as styling, including XML-escaped Unicode and
  preserved spaces in the weekly manual-entry column.

DOCX dimensions/spacing are twips; font sizes are half-points; border sizes are
eighths of a point. An absent font or padding value means the document inherits
Word/library defaults, not that its effective padding is zero.

The Excel tests assert sheet name, title/date/period text, merged cells, row
heights, column widths, print margins/orientation, header/footer and view defaults,
table position, numeric data, font/fill/alignment/borders and the PNG package
bytes, A5 anchor and 920×340 pixel size.

## Known behavior recorded by tests

These are characterization tests, not proof that every current behavior is
desirable. Production code was not changed.

- Missing `workplaces` in `reportStatements` returns 500 before validation.
- `reportFromForm` converts dates to Date objects before its truthiness check;
  missing dates reach count queries as Invalid Date.
- `statisticsByYear` checks `years.length` before checking for a missing field.
  Unknown forms produce 500. Omitting `executorId` causes each year's error to
  be swallowed and a successful zero-total document to be generated. This last
  case corrects the older survey's prediction of a 500 response.
- A per-row count failure can omit a form/year/workplace silently.
- Weekly denied access returns 500. No matching registrations produces a valid
  but empty DOCX instead of a no-data response.
- Several reports store table width as `5000%` and contain percentage cell
  widths that do not total 100. The separator border lacks `w:val` because the
  builder supplies `value` instead of `style`.
- All six Word endpoints create report metadata before the file write, so a
  disk failure leaves a row pointing to a missing file. Lifecycle tests cover
  this ordering and lack of rollback for every Word endpoint. Serialization
  failures occur before metadata writes and leave neither rows nor files.
- Chart rows use a contiguous `[null, ...values]` array. Actual data starts at B24
  while styling starts at A24; the last data column has no corresponding table
  style. A dedicated test records exact addresses, so leading blanks are not
  hidden by the value assertions.

## Limits

This is structural OOXML/workbook verification, not Word/Excel visual rendering.
It does not prove pagination, line wrapping, printer output or the effective
font chosen on a machine without an explicit document font. Real database
constraints, SQL execution and concurrent transactions require a separate
disposable integration database. The unused, unrouted
`statisticsController.generateAVR` is not a statistics API endpoint; the mounted
AVR endpoint belongs to the raport router.
