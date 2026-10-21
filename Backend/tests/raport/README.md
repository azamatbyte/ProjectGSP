# Raport document regression tests

Run from `Backend`:

```powershell
npm run test:documents
```

The suite invokes real controller handlers and the real `docx` serializer.
Prisma is replaced before controller loading, conclusion settings are served
from memory, generated upload writes are captured, and dates are fixed to
15 January 2026. No application server, credentials, database, real report
inserts, or production upload writes are needed. Router/authentication checks
are separate from these controller tests.

## Endpoint and layout coverage

| POST route under `/api/v1/raport` | Real generated layouts |
| --- | --- |
| `/create` | One-person and multiple-person conclusions |
| `/createSP` | Combined type1/type2 Talabnoma, type6 ND1, type7 ND2 |
| `/generateOPRaport` | ND1 and ND2 registration/relative lists |
| `/createAVR` | AVR form; multiple-template composition; relative fallback |
| `/createUPK` | UPK form; multiple-template composition; relative fallback |
| `/createMalumotnoma` | Malumotnoma form; multiple-template composition; relative fallback |
| `/generateMalumotnomaList` | Registration/relative list and session fallback |
| `/dcreateRelativeList` | Combined type1/type2 lists, session fallback, relative-only data |
| `/createQuerySgb` | SGB query, addressee and signer variations |
| `/createQueryGsbp` | GSBP query, addressee and signer variations |

`GET /raport/download` checks required query fields, newest report lookup,
stored-link response, missing report, and database failure.

Fourteen fixed layouts have readable JSON and raw `word/document.xml`
baselines in `layouts/`. Each is asserted independently for:

- Every section: A4 dimensions, portrait orientation, top/right/bottom/left
  margins, header/footer distances, gutter, section properties and referenced
  header/footer contents (including intentional absence).
- Every paragraph: alignment, spacing before/after and between lines,
  indentation, tabs, borders, keep/page-break properties and run order.
- Every text run: exact Unicode text, fonts, font sizes, bold, italic,
  underline, colors, explicit breaks and other parsed properties.
- Every table, including nested tables: widths, layout, grid, borders, cell
  padding, row properties, merges, shading, vertical alignment, paragraph
  formatting and content.
- All style definitions and defaults, settings, document block ordering, and
  raw document XML attributes beyond the semantic inspector's vocabulary.
- Valid OOXML package entries, one captured file, link/file-name agreement,
  report/link persistence, and registration updates for conclusions.

Additional cases exercise invalid dates, missing signers/templates/persons,
DB insert failures, ordered sessions, multiple-template composition, missing
OP source, and long Unicode text containing XML metacharacters. Query helpers
cover exact signer padding, first-signer addressee ordering, blank fields,
template fallback, and relative-link errors.

`coreVariants.test.js` additionally covers missing/unreadable conclusion
configuration, exact registration transitions and audit records, first-signer
selection, legacy type2 psycho templates, OP company selection, empty explicit
OP results, Malumotnoma refusal and unknown signers, AVR/UPK request fields,
and default dates. Each core generator is exercised with serialization,
report-link insertion, and disk-write failures. These checks inspect the
response and whether each persistence stage was reached.

## Baseline meaning and known defects

These are characterization tests of the current implementation, not an
approved visual specification. They detect changes to its emitted content and
formatting; they do not establish that every current layout is desirable.
There is no Word/LibreOffice rendering or pagination verification, and no
claim of 100% branch coverage for the 20,000-line controller. Long-text tests
check correct escaping and preserved page settings, not visual overflow.

Known behavior is named explicitly in tests:

- `/create` with no matching registration returns 500 while reading
  `regNumber`; registration updates use asynchronous `forEach`. The test
  helper drains the event loop to inspect these updates, which does not prove
  they finish before the real HTTP response.
- OP automatic selection with a missing registration returns 500 while
  reading `model`.
- AVR accepts `additional_information`, but its rendering is commented out,
  so the submitted value is absent from the generated document.
- Core generators create report and link records before writing the file.
  Disk errors therefore leave records, and link insertion errors leave an
  orphan report. Tests characterize this ordering without changing it.
- Relative-list accepts invalid dates and prints `NaNг.`; no matching
  templates still yields 200 and an empty DOCX. A relative-only list creates
  a report without a registration link.
- Query generation can attempt to connect a relative as a registration,
  leaving an orphan report if the link insert fails. A null signer rank can
  print the literal `null`.
- Some templates omit explicit font/padding values; absence is part of the
  baseline and means Word defaults apply. Existing percentage-width values
  such as `5000%` are recorded as emitted, not corrected by the tests.

Do not blindly regenerate baselines after a failure. First inspect the
specific formatting or content difference. For an intentional approved
change, regenerate explicitly and review every JSON/XML diff:

```powershell
node tests/raport/update-layout-fixtures.js --write
```

Normal test runs never update their expected values.
