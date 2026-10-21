# RegisterFour document tests

All three generating routes under `/api/v1/registerFour` are covered by 76
controller/serialization tests. Run the entire isolated document suite from
`Backend` with `npm run test:documents`. To run only this router:

```powershell
node --test tests/registerFour/exportTemporaryDataToExcel.test.js tests/registerFour/exportSverkaMain.test.js tests/registerFour/exportSverka.test.js tests/registerFour/exportFailuresAndContent.test.js
```

| Endpoint | Coverage |
| --- | --- |
| `POST /export` | Caller-owned sessions, registration/relative merge and stable registration-number ordering, field fallbacks, all sheet columns/headers/cell formats, required type, no-data responses and failures in each read/serialization/write stage |
| `POST /exportMainSverka` | SESSION/RESERVE/RAPORT, caller filter, status/date selection for registration and registration4, per-row lookup errors, merged headers, every cell's formatting, long Unicode data, serializer/write failures |
| `POST /exportSverka` | Requested executor filter and report ownership, with/without compromise-materials column, strict boolean switch, notes deduplication/visibility, one-sided status lookup failure, complete worksheet formatting, report/link persistence and failure ordering |

These tests generate real XLSX bytes with ExcelJS and reload the workbook.
Assertions include all six print margins (in inches), portrait/landscape,
page scaling/defaults, header/footer and view settings, merges, every column
width, header/data row heights, fonts, borders, fills, alignment, wrapping,
number formats and exact data values. XLSX has no Word paragraph spacing or
Word table-cell padding; those checks belong to the DOCX suites.

Long Unicode, multiline and XML-special-character values survive the package
round trip. Values beginning `=` remain string cells rather than formulas.
Prisma is replaced before importing controllers, upload writes are captured
in memory, and time is frozen. No real database or uploads are changed.
Authentication and mounted-router contracts are covered separately under
`tests/routes`.

## Known behavior and limits

- `/export` accepts any nonempty type string. A truthy non-string type throws
  before its `try` block, so the controller rejects without a JSON response.
- A missing registration can appear as `Найден` (found), because null results
  share the same branch as records without a status. A main Sverka lookup error
  always appears in column H even when its normal status belongs in G.
- Sverka data rows have fixed 20-point heights. The notes column wraps, but
  long values do not increase row height. Tests preserve this behavior and
  do not establish that text is visible in Excel or on printed pages.
- `/exportSverka` writes the file before report/link inserts. Failed inserts
  leave a captured artifact and can leave a report without a link; no rollback
  is performed. Serialization/write errors occur before metadata inserts.
- These tests inspect workbook structure and fake persistence calls. They do
  not execute PostgreSQL constraints, render Excel, verify pagination or prove
  all possible input combinations or branches.
