# Backup document tests

Run from `Backend`: `node --test tests/auth/*.test.js`.

The two generating endpoints in the auth router are covered. Other auth and
restore endpoints are outside the document-generation scope. These are controller
integration tests: real CSV serialization, encryption, ZIP writing and extraction
run; Prisma and `pg_dump` are replaced before importing the controller. All files
are synthetic and confined to a fresh temporary sandbox. No real database dump
or restore occurs. Test files need process isolation (the Node test runner default)
because the application imports dependencies at module load time.

The suite has 66 passing tests on Windows, including real Express transport
checks for CSV ZIP, inline JSON, and PostgreSQL ZIP responses. These verify
content length, headers, decrypted transferred bytes, ISO date serialization,
Unicode, and removal of temporary files after the transfer callback.

| Endpoint | Artifact and behavior covered |
| --- | --- |
| `POST /api/v1/auth/backup` | All 23 model column orders, every fixture cell, UTF-8, CSV quoting and multiline values, dates/nulls/booleans/JSON, batch boundaries, empty models, encrypted ZIP entries, password header and rejection, response metadata, cleanup, invalid formats, JSON mode, database/archive/transfer errors, temp directory fallback |
| `POST /api/v1/auth/backup-pg` | Mocked process arguments and decoded credentials, binary override and `.exe` resolution, real encrypted ZIP containing synthetic SQL, unsupported setting removal, preservation of other SQL bytes, attachment/password headers, cleanup, invalid connection configuration, process/archive/transfer failures, missing output, unwritable temp directory |

Word page margins, cell padding, paragraph spacing and fonts do not apply to CSV,
SQL or ZIP. Those assertions belong to the raport and statistics DOCX suites.
Most failure cases use response doubles; three transport cases use Express over
a private named pipe (Unix socket on other platforms). These do not substitute
for router authorization coverage in `../routes/documentRoutes.test.js` or
running PostgreSQL `pg_dump` against a disposable integration database.

## Known defects recorded by characterization assertions

- CSV export leaves previously written CSVs after a database read fails.
- Archive failure leaves the output stream open. Tests close it to avoid leaking
  descriptors. On CSV export, its close handler attempts to send the already
  deleted ZIP after the error response; the response double records this attempt.
- `exportPgDump` resolves its temporary directory before its `try`, so an
  unwritable directory rejects without a JSON error response.
- Empty tables have no CSV entry; the archive omits them rather than including
  header-only CSVs. JSON mode preserves all raw model fields, including fields
  that are excluded from the explicit CSV schema.
- A cleanup failure can leave a CSV or SQL file after a successful response.
  Tests inject a sharing violation on one file and verify cleanup continues for
  the other files. CSV cleanup logs the failure; SQL cleanup silently ignores it.
- ZIP uses the application's current ZipCrypto (`zip20`) configuration. Testing
  that configuration documents behavior, not a security endorsement.

No production behavior is changed by these tests. Passwords used in assertions
are generated during the test; fixed connection credentials are synthetic.
