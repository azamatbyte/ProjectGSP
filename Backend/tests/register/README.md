# Global search export tests

Run from `Backend`:

```powershell
node --test --test-reporter=spec tests/register/*.test.js
```

The 52 tests cover `POST /api/v1/register/globalSearchExport`, the register
router's document-generating endpoint. They invoke the real controller and
ExcelJS serializer, reload its XLSX bytes, and inspect actual values and styles.
Prisma is replaced before controller loading; uploads are captured in memory.
No real database or generated upload is needed.

`globalSearchExport.test.js` covers the response contract, filename construction,
executor lookup, empty results and query failures; query filtering, escaping,
date ranges and sort selection; and the complete 22-column worksheet. Formatting
checks include all six print margins, orientation/page setup defaults, merged
title, frozen panes, fonts, borders, fills, wrapping, alignment, row heights,
column widths, date/number types, and intentional absence of headers/footers and
images. These XLSX files have print margins; Word cell padding does not apply.

`exportBoundaries.test.js` adds serialization failure, each invalid stored date
field, null request bodies, formula-like literal strings and leading-zero
identifiers, and 80 long multiline Unicode records. Every stress-test row retains
its values and border/wrapping properties, with the original print margins and
40-character column-width cap. It also composes the actual register router,
JWT and permission middleware, real controller and HTTP response: missing tokens
and insufficient roles are rejected before export, while a superAdmin receives
a readable XLSX attachment with correct content length.

## Known behavior and limits

- Cyrillic executor names currently produce an invalid `Content-Disposition`
  header and a 500 response; that JSON error retains the XLSX content type set
  before the header failure. Existing HTTP tests record the defect.
- A malformed non-empty stored date aborts the entire export with 500; it does
  not fall back to the birth year or skip the bad row.
- Missing/null request bodies export all results. Queries are unpaginated.
- Missing completion status is labeled completed, matching the current helper.
- SQL text is asserted but not executed against PostgreSQL. These tests cannot
  establish real database query semantics or constraints.
- Styles and package bytes are verified, not rendered Excel pagination or
  automatic row-height behavior. Long-content tests do not prove visual fit.

No production behavior is changed by these tests. Run the complete document
suite with `npm run test:documents` to include the shared authorization matrix
and other document routers.
