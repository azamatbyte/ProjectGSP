# Document-generating APIs: which ones return the FILE and which return a LINK

Survey date: 2026-10-21. Backend: `Backend/`, all paths are under `/api/v1`.

**Automated regression tests (2026-10-21):** the survey below is the original
live-probe record. Repeatable isolated tests now cover all 23 listed generators,
Word formatting including page margins and table/cell padding, Excel formatting,
backups, router authorization and downloads. Run `npm run test:documents` from
`Backend`. See [the endpoint coverage and test guide](Backend/tests/README.md)
for exact scope, known defects and limits. The tests use synthetic data and do
not repeat the database mutations described in the original survey. Later
characterization corrects two survey assumptions: backup CSV defines 23 models,
and omitted `executorId` in `statisticsByYear` can yield a zero-total document
instead of 500. The pending conclusion stub remains unimplemented.

**How this was tested:** the app was booted in-process on a named pipe. Auth used a JWT signed with the local `.env` secret, so there was no `/auth/signin` call. Each generator was called, and every link it returned was followed and the file checked (magic bytes `504b0304` = docx/xlsx). No source code was changed.

## Rule of thumb

- **LINK (almost everything).** The generator writes `Backend/uploads/<uuid>.<ext>` and replies with JSON:
  `{"code":200,"message":"...","link":"<SERVER_URL>/api/v1/download/<uuid>.<ext>"}`.
  - The `res.download(...)` code in these generators is commented out.
  - The URL is built from `SERVER_URL` in `.env`, not from the request host.
- **FILE (only 3 endpoints, plus the download route itself).** The bytes come back in the response with `Content-Disposition: attachment`.
- **`GET /api/v1/download/<file>`** is the static mount over `Backend/uploads` (`app/registerRoutes.js`). This is what every LINK points to.
  - `?newFileName=X` renames the download and keeps the original extension.
  - ⚠️ It has **no auth check**: anyone who has the URL can download the file.

## Master list

| # | Method | Path | Controller | Format | Delivery | Creates DB rows | Tested |
|---|---|---|---|---|---|---|---|
| 1 | POST | /register/globalSearchExport | registerController.globalSearchExport | .xlsx (ExcelJS) | **FILE** | – | ✅ 200, 9 KB xlsx |
| 2 | POST | /auth/backup | registerController.exportData | .zip of CSVs (password-protected), or inline JSON if `format:"json"` | **FILE** (password in `X-Backup-Password` header) | – | ⚠️ code only (full DB dump) |
| 3 | POST | /auth/backup-pg | registerController.exportPgDump | .zip of pg_dump SQL (password-protected) | **FILE** (password in `X-Backup-Password` header) | – | ⚠️ code only (full DB dump) |
| 4 | POST | /raport/create | raportController.generateReport | .docx (conclusion) | **LINK** | raport + raportLink, **and updates registrations** | ⚠️ only the 400 path (success path changes registration status) |
| 5 | POST | /raport/createSP | generateSP | .docx | **LINK** | raport + raportLink | ✅ |
| 6 | POST | /raport/generateOPRaport | generateOPRaport | .docx | **LINK** | raport + raportLink | ✅ |
| 7 | POST | /raport/createAVR | generateAVR | .docx | **LINK** | raport + raportLink | ✅ |
| 8 | POST | /raport/createUPK | generateUPK | .docx | **LINK** | raport + raportLink | ✅ |
| 9 | POST | /raport/createMalumotnoma | generateMalumotnoma | .docx | **LINK** | raport + raportLink | ✅ (no view in the UI calls it) |
| 10 | POST | /raport/generateMalumotnomaList | generateMalumotnomaList | .docx | **LINK** | raport + raportLink | ✅ |
| 11 | POST | /raport/dcreateRelativeList | generateRelativeList | .docx | **LINK** | raport + raportLink | ✅ |
| 12 | POST | /raport/createQuerySgb | generateQuerySgb | .docx | **LINK** | raport + raportLink | ✅ |
| 13 | POST | /raport/createQueryGsbp | generateQueryGsbp | .docx | **LINK** | raport + raportLink | ✅ |
| 14 | POST | /registerFour/export | registerFourController.exportTemporaryDataToExcel | .xlsx | **LINK** | – | ✅ |
| 15 | POST | /registerFour/exportMainSverka | exportSverkaMain | .xlsx | **LINK** | – | ✅ |
| 16 | POST | /registerFour/exportSverka | exportSverka | .xlsx | **LINK** | raport + raportLink | ✅ |
| 17 | POST | /statistics/reportStatements | statisticsController.reportStatements | .docx | **LINK** | raport + raportLink | ✅ |
| 18 | POST | /statistics/reportFromForm | reportFromForm | .docx | **LINK** | raport + raportLink | ✅ |
| 19 | POST | /statistics/statisticsByForm | statisticsByForm | .docx | **LINK** | raport + raportLink | ✅ |
| 20 | POST | /statistics/statisticsByYear | statisticsByYear | .docx | **LINK** | raport + raportLink | ✅ |
| 21 | POST | /statistics/monitoringByAdmin | monitoringByAdmin | .docx | **LINK** | raport only | ✅ |
| 22 | POST | /statistics/weeeklyReport | weeeklyReport | .docx | **LINK** | raport + raportLink | ✅ |
| 23 | POST | /statistics/dashboard_chart_export | exportDashboardChart | .xlsx (embeds the chart image) | **LINK** | – | ✅ |

### Related routes that do not generate a document

- `GET /raport/download` (downloadRaport) looks up an existing `raportLink` by `registrationId` and `code` and returns `data.link`.
- `POST /upload` stores an uploaded file and returns a `link`.
- `GET /upload/list` returns `file_link` URLs.
- `POST /conclusion/genreate_conclusion` is a stub. It always returns `{"message":"genreate_conclusion is pending implementation"}`.
- `statisticsController.generateAVR` is a docx generator with no route. `/raport/createAVR` uses the raportController function of the same name.
- None of these routers produce documents: migration, signList, logs, sessions, service, form, relative, workPlace, relationdgr, initiator, status, health. `message.js` is commented out and never mounted.

### Side issues found (not fixed, code untouched)

- `/api/v1/download/*` needs no auth, so anyone with a link URL can download the document.
- `/raport/create` updates registrations in an `async forEach` without awaiting it. If no ID resolves to a registration, it throws a TypeError and returns 500.
- `generateMalumotnomaList` and `generateRelativeList` sign with **every** signList row when `signListIds` is left out. In `generateMalumotnomaList` the executor, initiator and regNumber always come out empty.
- `createQuerySgb` and `createQueryGsbp` accept a relative id but always connect it as a registration. From reading the code, this would most likely return a 500 and leave behind a `raport` row with no link.
- `statistics/reportStatements` without `workplaces`, and `statisticsByYear` without `executorId`, return 500 instead of 400.
- `weeeklyReport` refuses access with a 500 "Access denied" instead of a 401/403.
- `formOverdueTrend` is defined twice in statisticsController.

### Test leftovers (data, not code)

Testing created 20 files in `Backend/uploads/` and 16 test `raport` rows (raport A 2, raport B 5, raport C 2, registerFour 1, statistics 6), plus their `raportLink` rows. All are linked to registration `35d603b1-…` (regNumber 1708-19) or not linked to any registration. The exact IDs are in the per-router sections below. No registration rows were changed.

---

# Per-router details (from the sub-agent reports)

## Raport router (part A): `/api/v1/raport/create`, `/createSP`, `/generateOPRaport`, `/download` + static `/api/v1/download`

Router: `Backend/api/router/raport.js` (mounted at `/api/v1/raport`), controller: `Backend/api/controllers/raportController.js`.
All four routes use `verifyToken` (header `x-access-token`, JWT) + `permissionCheck("admin")` (role `admin`; `superAdmin` always passes; others get 406, unknown/inactive user 401).

### Summary

| Method | Path | Controller | Output format | Delivery | Tested status |
|---|---|---|---|---|---|
| POST | /api/v1/raport/create | `generateReport` (l.832) | .docx (`docx` lib, built in code) | **LINK** (`link`) | Only the validation path was tested (400). The success path was **not run** because it changes registration rows (see notes). |
| POST | /api/v1/raport/createSP | `generateSP` (l.1965) | .docx (`docx` lib) | **LINK** (`link`) | 200 JSON; the link returned 200 docx (`PK\x03\x04`, 9929 B) |
| POST | /api/v1/raport/generateOPRaport | `generateOPRaport` (l.2361) | .docx (`docx` lib) | **LINK** (`link`) | 200 JSON; the link returned 200 docx (`PK\x03\x04`, 10536 B) |
| GET | /api/v1/raport/download | `downloadRaport` (l.1748) | none (lookup only) | **LINK** (`data.link`) | 200 JSON with the existing link; 400 when `code` is missing |
| GET | /api/v1/download/<file> | static, `app/registerRoutes.js` | serves whatever is in `uploads/` | **FILE** (attachment) | 200 docx with `Content-Disposition: attachment` |

None of the four raport endpoints sends file bytes. Each one writes the file to `Backend/uploads/<uuidv4>.docx`, then returns JSON with an absolute URL `SERVER_URL + "/api/v1/download/" + fileName`. `SERVER_URL` comes from `.env` and is `http://localhost:8080` here, so the URL does not depend on the request host. The `res.download(...)` code in each generator is commented out. Only the static `/api/v1/download` mount sends the actual bytes.

### POST /raport/create — `generateReport` (conclusion / "Заключение")
- Body: `{ type: "SESSION"|"RESERVE"|"RAPORT" (required), signListIds: [signListId,...] (required, non-empty; the first one is used as "head"), ids?: [registrationId,...], name?: "Заключение" }`. If `ids` is empty, the IDs come from `session` rows where `{type, adminId: currentUser}`.
- Example: `{"type":"RAPORT","ids":["<registrationId>"],"signListIds":["<signListId>"],"name":"Заключение"}`
- Builds: a conclusion (`generateConclusionDocx` / `generateConclusionDocxF4`, l.3987/4450). Both are pure `docx` (`Document` + `Packer.toBuffer`); there is no template file. The `"ф-4 заключение.docx"` argument is an unused name. Header texts come from `readConclusions()` (the conclusion named "Conclusion"; 404 if it is missing).
- Disk: `uploads/<uuid>.docx`.
- DB writes: creates a `raport` row (`link` = URL) and a `raportLink` row (code = name, connected to the registrations, plus `regNumber` for registration_four). **It also updates every registration**: `accessStatus` PROVERKA→CONCLUSION, `completeStatus`=WAITING, `expired`=null, `expiredDate`=null, `conclusionRegNum`="<regNumber> ф-<form_reg>". It writes `registrationLog` rows for these changes. The updates run in a fire-and-forget `forEach(async ...)`, so they are not awaited before the response.
- Response: `200 {"code":200,"message":"Document generated and saved successfully","link":"http://localhost:8080/api/v1/download/<uuid>.docx"}`.
- Tested: `{"type":"INVALID"}` → `400 {"message":"Invalid session type"}`. I did not run the success path, because it clears `expired` and changes the access status of real registrations, which counts as a data update. The response shape above comes from reading the code. Separate issue: if no ID resolves to a registration, `data_registration[0].regNumber` throws a TypeError and the endpoint returns 500.
- Frontend: `RaportService.create` → `raport/create` exists, but no view calls it.

### POST /raport/createSP — `generateSP` (Talabnoma / psycho raport for one registration)
- Body: `{ id: registrationId (required), name?: "type123"|"type6"|"type7" (default "type 1,type 2,type 3"), signListIds: [...], raport_data?: date }`. With type6/type7 it builds `generatePsychoRaport` (ND1/ND2 codes). With any other name it builds `generateTalabnoma` (requirement letters) for every raport type whose link matches type1/type2/type3. Page breaks are added between documents.
- Example (tested): `{"id":"35d603b1-946d-42df-b565-100c98f0750c","name":"type123","signListIds":["2d7e6b86-d7a0-4d74-adef-9a3bff49d8d9"]}`
- Disk: `uploads/<uuid>.docx`. DB: creates a `raport` row and a `raportLink` row (code = name, connected to registration `id`). No registration updates.
- Response (tested): `200 application/json` `{"code":200,"message":"Document generated and saved successfully","link":"http://localhost:8080/api/v1/download/639d140d-2dfb-4a06-882b-352abdeb6003.docx"}`.
- Link followed: `200`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, magic `504b0304`, text starts "МВД (ТРЕБОВАНИЕ) …".
- Errors: 404 when the registration, signListIds, raport type or matching template is missing; 400 when `raport_data` is invalid.
- Frontend (`RegisterInfo/RaportSP.js` `generateReport`) opens `response.data.link + "?newFileName=" + filename + "_" + regNumber`.

### POST /raport/generateOPRaport — `generateOPRaport` (ND1/ND2 psycho raport list)
- Body: `{ id: registrationId (required), name: "type6"|"type7", ids?: [registration/relative ids], signListIds: [...], raport_data?: date }`. If `ids` is empty: for model `registration` it uses the registration plus its relatives; otherwise it uses all registrations with the same `form_reg`. It builds `generatePsychoRaportList` (l.13201) once per matching psycho raport type. If `name` is not type6/type7, there are no documents and the endpoint returns 404.
- Example (tested): `{"id":"35d603b1-946d-42df-b565-100c98f0750c","name":"type6","ids":[],"signListIds":["2d7e6b86-d7a0-4d74-adef-9a3bff49d8d9"]}`
- Disk: `uploads/<uuid>.docx`. DB: creates a `raport` row and a `raportLink` row (code = name, **not** connected to any registration). If `id` is not found, `registration.model` throws and the endpoint returns 500.
- Response (tested): `200` JSON `{"code":200,"message":"Document generated and saved successfully","link":"http://localhost:8080/api/v1/download/f817c39d-5507-4650-9996-e88d6ab88f5f.docx"}`. Link followed: 200 docx, magic `504b0304`, text starts "ГОСУДАРСТВЕННАЯ СЛУЖБА БЕЗОПАСНОСТИ … 1708-19 21 октября 2026 г …".
- Frontend: `RegisterInfo/GeneralField.js` opens `response.data.link + "?newFileName=ND1,_ND2"`.

### GET /raport/download — `downloadRaport` (lookup only, generates nothing)
- Query: `registrationId` and `code` (both required, otherwise 400). It finds the newest `raportLink` with that `code` that is connected to the registration and returns the stored `raport.link`.
- Example (tested): `GET /api/v1/raport/download?registrationId=35d603b1-946d-42df-b565-100c98f0750c&code=type123` → `200 {"code":200,"message":"Raport retrieved successfully","data":{"link":"http://localhost:8080/api/v1/download/639d140d-….docx","name":"type123"}}`. Without `code` → `400 "Registration ID and code are required"`. No match → 404 "Raport not found".
- Delivery: LINK in `data.link`, despite the endpoint's name. Frontend: `RaportService.downloadRapport(id, conclusionRegNum)`.

### Static `/api/v1/download` (app/registerRoutes.js l.40-87)
- Mounted after `/api/v1` apiRouter. It is `express.static(Backend/uploads)`, preceded by middleware that sets `Content-Disposition: attachment; filename="<ascii fallback>"; filename*=UTF-8''<encoded>`, plus `Cache-Control: public, max-age=300`. The `/api/v1` no-store middleware skips this path.
- `?newFileName=X` replaces the download name. Path parts and any extension in X are removed, the characters `\/:*?"<>|` become `_`, and the **original file's extension is kept** (e.g. `?newFileName=SP_1708-19` → `SP_1708-19.docx`). Without the parameter, the stored UUID name is used.
- **No authentication**: no `verifyToken`, so anyone who has the UUID URL can download the file.
- Tested: `GET /api/v1/download/639d…docx?newFileName=SP_1708-19` → 200, docx content-type, `attachment; filename="SP_1708-19.docx"; filename*=UTF-8''SP_1708-19.docx`. Side effect: a missing file returns 404 JSON, but the response still carries `Content-Disposition: attachment; filename="does-not-exist.docx"`, because the header is set before static runs.

### Artifacts created by this testing
- Files: `Backend/uploads/639d140d-2dfb-4a06-882b-352abdeb6003.docx` (createSP) and `Backend/uploads/f817c39d-5507-4650-9996-e88d6ab88f5f.docx` (generateOPRaport). Other new files in uploads/ during this window came from parallel probes, not from this section.
- DB: 2 `raport` rows (name `type123` and `type6`, executor = superadmin, link = the URLs above) and 2 `raportLink` rows (code `type123` connected to registration `35d603b1-946d-42df-b565-100c98f0750c`; code `type6` not connected). No registration rows were modified.
- Local copies: `scratchpad/out/raportA_sp.docx`, `scratchpad/out/raportA_op.docx`; bodies in `scratchpad/bodies/raportA_*.json`.


---

## Raport router (part B): AVR / UPK / Malumotnoma / Malumotnoma list / Relative list

Router: `api/router/raport.js` (mounted at `/api/v1/raport`). Controller: `api/controllers/raportController.js`.
All five use `verifyToken` + `permissionCheck("admin")`. Tested as superadmin via the in-process named-pipe harness on 2026-10-21.

| Method | Path | Controller | Output format | Delivery | Tested status |
|---|---|---|---|---|---|
| POST | `/api/v1/raport/createAVR` | `generateAVR` (l.2885) | .docx (`docx` lib, `Packer.toBuffer`) | **LINK** (JSON `link`) | 200, link to a working .docx (8995 B, `504b0304`) |
| POST | `/api/v1/raport/createUPK` | `generateUPK` (l.3168) | .docx (`docx`) | **LINK** | 200, .docx 9270 B, `504b0304` |
| POST | `/api/v1/raport/createMalumotnoma` | `generateMalumotnoma` (l.3421) | .docx (`docx`) | **LINK** | 200, .docx 9562 B, `504b0304` |
| POST | `/api/v1/raport/generateMalumotnomaList` | `generateMalumotnomaList` (l.2642) | .docx (`docx`) | **LINK** | 200, .docx 8585 B, `504b0304` |
| POST | `/api/v1/raport/dcreateRelativeList` | `generateRelativeList` (l.3715) | .docx (`docx`) | **LINK** | 200, .docx 9048 B, `504b0304` |

### What they share

- **No file template.** Each one builds the Word document in code with the `docx` npm package (`Document`/`Paragraph`/`Table`, created by the local `generateAVR`, `generateUPK`, `generateMalumotnoma`, `generateMalumotnomaListFunc` and `generateMVD_SGB_USParray` builders). The text (organization, requested_organization, notes, signed_fio/position) comes from `raportType` rows. AVR, UPK and Malumotnoma pick them with `selectRaportTypesByCodeOrFallback({code, name})`: code ILIKE, then link/name/code ILIKE on `name`, then link `type2`/`type1`, then all types. Malumotnoma list and Relative list use `getRaportTypesByLinksRaw(["type1","type2","type3"])`. When several raport types match, all of them are joined into one .docx with `buildCombinedDocument`.
- **On disk:** `Backend/uploads/<uuidv4>.docx` (`path.join(__dirname,"../../uploads", ...)`, written with `fs.writeFileSync`).
- **DB writes on every successful call:** 1 `raport` row (`name`, `executorId=req.userId`, `link`, `notes:""`) and 1 `raportLink` row (`code=name`, `raportId`, connected to the registration). Only `generateMalumotnomaList` fills `raportLink.regNumber`. `generateRelativeList` creates the `raportLink` only if the ids include at least one `registration` (it connects just the first one).
- **Response (identical for all 5):**
  ```json
  {"code":200,"message":"Document generated and saved successfully",
   "link":"http://localhost:8080/api/v1/download/<uuid>.docx"}
  ```
  The `link` is `SERVER_URL` (from `.env`, here `http://localhost:8080`) + `/api/v1/download/<file>`. The response never contains the file bytes; old `res.download(...)` code is still there but commented out.
- **Following the link:** `GET /api/v1/download/<uuid>.docx[?newFileName=X]` is served by `express.static(uploads)` in `app/registerRoutes.js`, with no auth. It returned 200 for all five, with `content-type: application/vnd.openxmlformats-officedocument.wordprocessingml.document` and `content-disposition: attachment; filename="X.docx"; filename*=UTF-8''X.docx` (`newFileName` renames the file; the frontend always adds it). Magic bytes `504b0304` (zip/OOXML). The text extracted from each file matched the document type, e.g. "АВР СГБ Республики Узбекистан…", "УПК ПВ (ТРЕБОВАНИЕ)…".
- **Frontend:** `frontedn_v2/src/services/RaportService.js`. Every caller reads `response.data.link`, appends `?newFileName=…`, and clicks a temporary `<a download>`.

### Per-endpoint notes

**POST /raport/createAVR** (`generateAVR`). Used by `RaportService.exportSpecialAVR` from `RegisterInfo/RaportSP.js` (type4 modal).
Body: `id` (registration or relatives id, required, otherwise 404 "data not found"), `signListIds` (non-empty array, required, otherwise 404), plus optional `code` (frontend sends `"avr"`), `name` (default `"AVR"`, saved as `raport.name`), `nationality`, `residence`, `passport`, `travel`, `additional_information`, `raport_data` (date, default now; an invalid date gives 400).
```json
{"id":"35d603b1-946d-42df-b565-100c98f0750c","name":"type4","code":"avr",
 "signListIds":["2d7e6b86-d7a0-4d74-adef-9a3bff49d8d9"],
 "nationality":"узбек","residence":"г. Ташкент","passport":"AA1234567","travel":"нет","additional_information":"нет"}
```
Tested: 200, link `.../download/f8ac0157-b2c8-480a-8791-4be7ae4f0257.docx`.

**POST /raport/createUPK** (`generateUPK`). Used by `RaportService.exportSpecialUPK` from `RaportSP.js` (type5 modal).
Body: `id`, `signListIds` (both required, as for AVR), plus `code` (`"upk"`), `name` (default `"AVR"`), `passport`, `residence`, `time_period`, `raport_data`.
```json
{"id":"35d603b1-946d-42df-b565-100c98f0750c","name":"type5","code":"upk",
 "signListIds":["2d7e6b86-d7a0-4d74-adef-9a3bff49d8d9"],
 "passport":"AA1234567","residence":"г. Ташкент","time_period":"2020-2025"}
```
Tested: 200, link `.../download/2875732d-194b-4396-a20f-3c225a569077.docx`.

**POST /raport/createMalumotnoma** (`generateMalumotnoma`). `RaportService.exportSpecialMalumotnoma` exists, but no view calls it: the UI's Malumotnoma button uses `generateMalumotnomaList` instead.
Body: `id`, `signListIds` (both required; ids that do not exist are dropped, and if none are left the result is 404 "signList not found"), plus `name` (saved as `raport.name`; `"type8"` switches the title to the refusal notice, "уведомление об ОТКАЗЕ"), `code`, `raport_data`. It uses `regEndDate` and `form_reg` from the registration.
```json
{"id":"35d603b1-946d-42df-b565-100c98f0750c","name":"type10","code":"type10",
 "signListIds":["2d7e6b86-d7a0-4d74-adef-9a3bff49d8d9"]}
```
Tested: 200, link `.../download/b3154535-9a21-4fd8-b08f-a1a5bd792fae.docx`.

**POST /raport/generateMalumotnomaList** (`generateMalumotnomaList`). Used by `RaportService.exportSpecialMalumotnomaList` from `RaportSP.js` and from the cart / reserve / conclusion list views.
Body: `ids` (array of registration/relatives ids). If it is empty, the ids come from the caller's `session` rows with `type` (SESSION / RESERVE / RAPORT). Plus `signListIds`, `name` (`"type8"` gives the refusal title, default `"type 1,type 2,type 3"`), `raport_data`. The handler ignores `code`. It returns 404 if no records are found or if `signListIds` is `[]`.
```json
{"type":"RAPORT","ids":["35d603b1-946d-42df-b565-100c98f0750c"],"name":"type10","code":"type10",
 "signListIds":["2d7e6b86-d7a0-4d74-adef-9a3bff49d8d9"]}
```
Tested: 200, link `.../download/2035e657-12b7-4a3a-99ca-c0eb16d96c0a.docx`. `raportLink.regNumber` was set to `1708-19`.

**POST /raport/dcreateRelativeList** (`generateRelativeList`). Used by `RaportService.createRelativeList` from `RegisterInfo/GeneralField.js` and the cart / reserve / conclusion list views. It produces the MVD/SGB batch request list (one table section each for the type1 and type2 raport types; the type3 branch is disabled with `&& false`).
Body: `ids` (must be an array, otherwise 400; if empty, the ids come from the caller's sessions of `type`, default `"SESSION"`), `signListIds`, `name` (default `"type11"`), `raport_data`.
```json
{"ids":["35d603b1-946d-42df-b565-100c98f0750c"],"type":"SESSION",
 "signListIds":["2d7e6b86-d7a0-4d74-adef-9a3bff49d8d9"]}
```
Tested: 200, link `.../download/e19a41de-61b8-4174-aadb-7c7cf1acb334.docx`.

### Side observations (not changed)

- In `generateMalumotnomaList` and `generateRelativeList`, an omitted `signListIds` is not rejected (only `[]` is). Prisma then treats `{in: undefined}` as no filter, so the document is signed by all `signList` rows.
- In `generateMalumotnomaList`, `data` is an array, so `executor`, `initiator` and `regNumber` (taken from `data?.executor` etc.) always end up empty.
- `generateAVR` and `generateMalumotnoma` do not select `executor.phone`, so `executor_phone` is always empty. `generateUPK` does select it.
- Download links are unauthenticated static URLs containing `SERVER_URL`, so they are only valid where that host is reachable.

### Created by this testing (left in place)

Files in `Backend/uploads/`:
- `f8ac0157-b2c8-480a-8791-4be7ae4f0257.docx` (AVR)
- `2875732d-194b-4396-a20f-3c225a569077.docx` (UPK)
- `b3154535-9a21-4fd8-b08f-a1a5bd792fae.docx` (Malumotnoma)
- `2035e657-12b7-4a3a-99ca-c0eb16d96c0a.docx` (Malumotnoma list)
- `e19a41de-61b8-4174-aadb-7c7cf1acb334.docx` (Relative list)

DB `raport` rows (name): `efeda2a8-ae5c-4367-b62d-8b67fb5c8af0` (type4), `b63cf7c8-37cb-44e4-8152-c1bef6aec1a0` (type5), `154a14ee-cfb7-4993-be38-670a36b80bd2` (type10), `b244cc41-7ec7-4260-b3b8-4c9338572798` (type10), `d7776031-ea55-401c-9f4d-b77613341b3d` (type11).
DB `raportLink` rows: `d8ef79bf-0a65-4f70-95e7-6fb0a7dc9b32`, `7c9548de-071c-4794-bfbb-760a2ea33654`, `cc2bcdb5-0c07-4230-ae3a-aa278b500bb5`, `a82c1e56-4471-4ca5-9262-1d1c1b320dbe`, `3a4a2901-c307-4f1b-9f2e-da3fb4e8f0c6`. All are linked to registration `35d603b1-946d-42df-b565-100c98f0750c` (regNumber 1708-19).
Scratchpad only: the downloaded copies `out/rb_*.docx`, the request bodies `bodies/b_*.json`, and the read-only helpers `count_b.js` and `links_b.js`.


---

## Raport router, part C: query documents (СГБ / ГСБП) and the other raport routes

Router: `api/router/raport.js`, mounted at `/api/v1/raport`. Controller: `api/controllers/raportController.js`.
Every route below uses `verifyToken` + `permissionCheck("admin")`, so it needs an `x-access-token` JWT for an admin or a superAdmin.

### Summary

| Method | Path | Controller | Output format | Delivery | Tested status |
|---|---|---|---|---|---|
| POST | /api/v1/raport/createQuerySgb | generateQuerySgb → generateDedicatedQueryRaportSGB(…, "type9") | .docx (`docx` lib, built in code, no template file) | **LINK** (JSON `link`) | 200 JSON; link gave 200 docx, magic `504b0304` |
| POST | /api/v1/raport/createQueryGsbp | generateQueryGsbp → generateDedicatedQueryRaportGSBP(…, "type8") | .docx (`docx` lib, built in code, no template file) | **LINK** (JSON `link`) | 200 JSON; link gave 200 docx, magic `504b0304` |

### POST /raport/createQuerySgb ("ЗАПРОС СГБ", raport name `type9`)

- **Request body:** `{ "id": "<registration id>", "signListIds": ["<signList id>", ...] }`. The frontend sends this from `RaportSP.js` → `RaportService.exportQuerySgb`.
  - If `signListIds` is empty or missing, it returns 404 `signListIds not found`.
  - If no sign-list row matches, it returns 404 `signList not found`.
  - If `id` matches neither a registration nor a relative, it returns 404 `data not found`.
- **Tested with:** `{"id":"35d603b1-946d-42df-b565-100c98f0750c","signListIds":["2d7e6b86-d7a0-4d74-adef-9a3bff49d8d9"]}`
- **How the document is built:**
  - The source data comes from `prisma.registration`. If no registration matches, it falls back to `prisma.relatives`.
  - The raport type is chosen by `selectRaportTypesByCodeOrFallback({code:"type9"})`.
  - The signers come from `signList` and are split into a header signer and agreed signers.
  - For model `registration4`, relatives' notes are added to the text.
  - `generateQueryDocxSgbDedicated()` (line ~4868) returns the sections, then `Packer.toBuffer(new Document(...))` produces the file.
  - The result is a Russian "запрос" letter: header `xx-1`, the «Секретно» stamp, the addressee, the subject's details and the signer blocks.
- **File on disk:** `Backend/uploads/<uuidv4>.docx`, written with `fs.writeFileSync`.
- **DB rows:** one `raport` row (`name:"type9"`, `executorId` = the caller, `link` = the download URL) and one `raportLink` row (`code:"ЗАПРОС СГБ"`, connected to `registrations: {id}`).
- **Delivery = LINK.** Response: `200 application/json`, `{"code":200,"message":"Document generated and saved successfully","link":"http://localhost:8080/api/v1/download/<uuid>.docx"}`. The host part is `SERVER_URL` from `.env`.
- **Following the link:** `GET /api/v1/download/<uuid>.docx` returned 200 with these headers:
  - `content-type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`
  - `content-disposition: attachment; filename="<uuid>.docx"; filename*=UTF-8''<uuid>.docx`
  - The file was 8273 bytes and started with `504b0304`.
  - The extracted text contains the subject «Ашуров Тохир Тилаволдиевич…».
- **How the download works:** `/api/v1/download` is plain `express.static(uploads)` in `app/registerRoutes.js`. It has no `verifyToken`. Adding `?newFileName=X` renames the attachment to `X.docx`, and the frontend uses this as `?newFileName=ЗАПРОС СГБ_<regNumber>`.

### POST /raport/createQueryGsbp ("ЗАПРОС ГСБП", raport name `type8`)

- This works the same way as createQuerySgb, with three differences:
  - The generator is `generateQueryDocxGsbpDedicated()` (line ~5157).
  - The raport type code is `type8`.
  - The `raportLink.code` is `"ЗАПРОС ГСБП"`.
- **Request body:** the same as above. Frontend: `RaportService.exportQueryGsbp`.
- **Delivery = LINK.** It returns the same JSON shape (`link` field).
- **Tested result:** 200 JSON. Following the link with `?newFileName=test` returned 200 with the docx content-type and `content-disposition: attachment; filename="test.docx"; filename*=UTF-8''test.docx`. The file was 8441 bytes, magic `504b0304`.

**Possible issue in both generators (found by reading the code, not tested):**
- The handler accepts a relative id as `id`, because it falls back to `prisma.relatives`.
- But `raportLink.create` always runs `registrations: { connect: { id } }`, so a relative id should make that connect fail and return a 500.
- The `raport` row is created before that step, so it would be left without a link row, and no file would be written.

### Raport routes that do not generate documents

None of these call `Packer` or `fs.write*`, and none return a file:

- **GET /raport/list** (`listRaports`, query `pageNumber`, `pageSize`, `name`): returns JSON with paginated `raports[]`, and each one includes its stored `link` URL. Tested: 200.
- **POST /raport/listExecutor** (`listRaportsExecutor`, query `pageNumber`/`pageSize`/`registrationId`, body filters): returns JSON with paginated `raportLink` rows. Tested `?pageNumber=1&pageSize=1` with `{}`: 200.
- **GET /raport/get?id=<raportLink id>** (`getRaportById`): returns JSON with the `raportLink` and its `raport`, including `raport.link`. It is a stored link only and generates nothing. Tested: 200.
- **POST /raport/update** (`updateRaport`): writes to the DB only. It updates the `raport` name/link/notes and sets `raportLink.adminCheck`/`operator`. For `name:"Заключение"` with `compr_info`, it also updates `registration.conclusion_compr`, relative notes and the logs. It **does not regenerate a file**: `link` is just a URL the client supplies. Not called (it writes data).
- **POST /raport/updateLinkStatus** (`updateRaportLinkStatus`): updates the `raportLink` display/adminCheck/operator/discuss flags in the DB. Not called (it writes data).
- **POST /raport/searchRelativesByRaportId** (`searchRelativesByRaportId`, body `{id:<raportLink id>, search?, limit?}`): returns a JSON list of relatives. Tested: 200.
- **POST /raport/type/list** (`getRaportTypeList`, query pagination, body `{searchQuery?}`): returns JSON. Tested: 200.
- **GET /raport/type/get/:id** (`getRaportTypeById`): returns JSON. Tested with `caf5a283-87b6-46ce-8767-190c5987d357`: 200.
- **POST /raport/type/create** (`createRaportType`) and **POST /raport/type/update/:id** (`updateRaportType`): create or update a `raportTypes` row in the DB only. Their `link` field is a type key such as `"type3"`, not a file. Not called (they write data).

### What my testing created

- **Files in `Backend/uploads/`:**
  - `877973cd-d099-473d-bbfe-e2625bbf3209.docx` (createQuerySgb)
  - `267673d5-b0aa-43d3-94dd-fef91af06904.docx` (createQueryGsbp)
- **DB rows in `raport`:**
  - `104003d2-7037-44d3-af5b-011e4d032bbc` (type9)
  - `b7d1abe7-c5ba-4964-aeee-de93b6abfc04` (type8)
  - executorId = superadmin `354dca94-…`
- **DB rows in `raportLink`:**
  - `a0f6eb1a-4935-4bd4-93aa-322f9f43690b` (ЗАПРОС СГБ)
  - `d78b0e8e-139c-4c40-81ce-57f57e3267d7` (ЗАПРОС ГСБП)
  - Both are linked to registration `35d603b1-946d-42df-b565-100c98f0750c` (regNumber 1708-19).
- **Scratchpad only:**
  - `out/rc_querysgb.docx`, `out/rc_querygsbp.docx`
  - `bodies/rc_query.json`, `bodies/rc_reglist.json`
  - `rc_rows.js`, `rc_rows2.js` (read-only Prisma lookups)


---

## registerFour (`/api/v1/registerFour`, `api/router/registartionFour.js` -> `api/controllers/registerFourController.js`)

All three document endpoints build an **.xlsx with ExcelJS**, write it to `Backend/uploads/<uuid>.xlsx` (`workbook.xlsx.writeFile('./uploads/...')`) and return **JSON with a `link`** (`${SERVER_URL}/api/v1/download/<uuid>.xlsx`). None of them stream the file. The bytes come from the shared `GET /api/v1/download/<file>` route, which returns `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` with `Content-Disposition: attachment` (the `?newFileName=` query sets the download name; the frontend appends `?newFileName=Сверка...`).

| Method | Path | Controller | Output format | Delivery | Tested status |
|---|---|---|---|---|---|
| POST | /api/v1/registerFour/export | exportTemporaryDataToExcel | .xlsx (ExcelJS), sheet "Temporary Data" | LINK (`link`) | 200 JSON link (as admin01); download 200, xlsx, magic `504b0304`, 6849 B |
| POST | /api/v1/registerFour/exportMainSverka | exportSverkaMain | .xlsx (ExcelJS), sheet "Сверка" | LINK (`link`) | 200 JSON link for SESSION and RESERVE (as admin01); downloads 200, xlsx, `504b0304`, 7408 B / 7257 B |
| POST | /api/v1/registerFour/exportSverka | exportSverka | .xlsx (ExcelJS), sheet "Сверка" (+ col I "Компрматериалы" if `komprMaterials:true`) | LINK (`link`) + DB raport row | 200 JSON link; download 200, xlsx, `504b0304`, 7379 B |

Response shape (all three on success):
```json
{ "code": 200, "message": "Excel file exported successfully",
  "link": "http://localhost:8080/api/v1/download/<uuid>.xlsx" }
```

Auth for all routes in this router: `verifyToken` + `permissionCheck("admin")` (superAdmin always passes). Token goes in the `x-access-token` header.

### POST /registerFour/export — exportTemporaryDataToExcel
- Body: `{ "type": "SESSION" }`. `type` is required (400 "type is required" if missing). Frontend (cart-list, reserve-list) sends `{ type: SESSION_TYPES.SESSION }`.
- Data: `session` rows where `type` matches and `adminId = req.userId` (the caller). Their `registrationId`s are looked up in `registration` and `relatives`, merged and sorted by regNumber.
- Columns: t_raqam, qayd_raqam, familiya, ism, sharif, t_sana (birth year), t_joy.
- Errors: 404 "No sessions found for the given type" when the caller has no sessions of that type (this is what superadmin gets: it has 0 sessions); 404 "No data found".
- DB writes: none. File: `uploads/<uuid>.xlsx`.

### POST /registerFour/exportMainSverka — exportSverkaMain
- Body: `{ "type": "SESSION" }`. `type` must be one of `SESSION | RESERVE | RAPORT` (400 "Invalid session type" otherwise). Frontend (cart-list, reserve-list, conclusion-list) sends `{ type: SESSION_TYPES.SESSION }`.
- Data: `session` rows for `type` and `adminId = req.userId`, plus a lookup of the linked `registration` records. Builds the "Сверка" layout (title, time/date, Допуск/отказ header, bordered rows, landscape).
- Errors: 404 "No data found" when the caller has no sessions of that type.
- DB writes: none. File: `uploads/<uuid>.xlsx`.

### POST /registerFour/exportSverka — exportSverka
- Body: `{ "executorId": "<admin uuid>", "komprMaterials": true }`. `executorId` is required (400 "Ids is required"). `komprMaterials === true` adds column I with de-duplicated kompromat notes. The frontend (registrationFour-list) also spreads its `...search` filters into the body, but the controller ignores them.
- Data: `temporaryData` rows where `executorId` = the body value (not req.userId), ordered by `order`, plus a lookup of the matching `registration` records.
- Errors: 404 "No data found" when that executor has no temporaryData.
- **DB writes:** creates a `raport` row (`name:"sverka"`, `executorId`, `link`) and a `raportLink` row (`raportId`, `display:true`), so the Сверка shows up in the raport list. File: `uploads/<uuid>.xlsx`.
- Delivery is still LINK (the same URL that is stored in `raport.link`).

### Other routes in this router (from the code): none generates a document
`upload-excel` reads an uploaded xlsx (`xlsx.readFile` + `sheet_to_json`) and deletes it afterwards. It parses files and does not generate any. `upload-excel-progress/:jobId`, `upload-excel-cancel/:jobId`, `list`, `getIdsOfList`, `get/:id`, `migrate/:id`, `save/:id`, `deploy`, `update/:id`, `updateKompromat`, `actionFast/:id`, `delete`, `deleteAllTemporaryDataByFilter` and `upload-manual` return JSON or change data. None of them uses ExcelJS, `writeFile` or `/download/` links. (The only `ExcelJS.Workbook`/`writeFile` uses in the controller are at lines ~2020, ~2086 and ~2491, which are the three exports above.) The mutating routes were not called.

### Testing notes
- Harness: `probe.js`. Git Bash needs `MSYS_NO_PATHCONV=1`, because otherwise `/api/v1/...` gets rewritten into a Windows path and fails with ERR_UNESCAPED_CHARACTERS.
- As `superadmin`: export gave 404 (no sessions), exportMainSverka gave 404, and exportSverka with superadmin's own id gave 404 (no temporaryData). The validation 400s were confirmed for all three.
- Success paths ran with `PROBE_USER=admin01` (id `0fec0feb-9b1b-4107-a3cb-99a2f76eecba`, role superAdmin). This user owns 3 SESSION, 2 RESERVE and 2 RAPORT sessions and 1 temporaryData row.

### Artifacts created by this testing
- Files in `Backend/uploads/`: `d4e08cb5-384f-4e04-a388-5a4ee0bf1fb5.xlsx` (export SESSION), `1bd7bb2c-fbc4-432f-bb5f-e5003cf6eceb.xlsx` (exportMainSverka SESSION), `0a751aad-6b80-405f-b7ba-a506da587a74.xlsx` (exportMainSverka RESERVE), `26bd346e-e997-4aa5-9ddc-dc3738a08c86.xlsx` (exportSverka).
- DB rows (from exportSverka): `raport` id `8325298c-b989-4cc4-bb3f-a0ca210e1f5f` (name "sverka", executorId admin01, link ending `26bd346e-...xlsx`) and `raportLink` id `33041441-e4f3-4cb1-8b98-95fed0c89422`.
- Downloaded copies in `scratchpad/out/r4-*.xlsx`.
- (`uploads/f8ac0157-b2c8-480a-8791-4be7ae4f0257.docx` appeared during the same window. It was not produced by these calls, which only made xlsx files, so it probably came from a parallel probe.)


---

## Register (`/api/v1/register`) and Conclusion (`/api/v1/conclusion`)

| Method | Path | Controller | Output format | Delivery | Tested status |
|---|---|---|---|---|---|
| POST | /api/v1/register/globalSearchExport | registerController.globalSearchExport | .xlsx (ExcelJS) | **FILE** (buffer in response, `attachment`) | 200, xlsx, 9323 B, magic `504b0304`; 404 JSON when no rows match |
| POST | /api/v1/conclusion/genreate_conclusion | conclusionController.genreate_conclusion | none (stub) | n/a (no document; JSON message) | 200 `{"message":"genreate_conclusion is pending implementation"}` |

No other register or conclusion route builds a document (checked from the code, see below).

### POST /api/v1/register/globalSearchExport
- **Controller:** `exports.globalSearchExport`, `Backend/api/controllers/registerController.js:3160-3448`.
- **Auth:** `verifyToken` + `permissionCheck("superAdmin")`. All other register routes need only `admin`.
- **Body:** the same filter object as `/register/globalSearch`: `firstName`, `lastName`, `fatherName`, `birthPlace`, `workPlace`, `regNumber`, `form_reg`, `pinfl`, `passport`, `notes`, `residence`, `accessStatus`, `completeStatus`, `model`, `or_tab`, `executorId`, `position`, `recordNumber`, `conclusionRegNum`, date ranges (`birth_date_start/end`, `register_date_start/end`, `register_end_date_start/end`). Each field has an `<field>Status` boolean, and `true` excludes the matches. Sorting uses `sortField` + `sortOrder` or `sortFields`. No query params. `regNumber` is an exact match (lower/trim). With `{}` the endpoint exports everything that matches, so always pass a filter.
- **Minimal working example:** `{"regNumber":"1708-19","regNumberStatus":false}`
- **What it builds:** an ExcelJS workbook with one sheet named "Поиск", created in memory. There is no template. Row 1 is the title "Выгрузка глобального поиска" (merged A1:V1). Rows 2-3 hold the executor's full name and the Tashkent timestamp. Row 4 holds 22 headers (№, Рег номер, Ф, Даты СП, Степень родства, Ф.И.О., ... Обновлено). Data rows start at row 5 (registration + relatives, from `buildSearchExportQuery` via `$queryRawUnsafe`). It also freezes the header rows, adds thin borders and auto-fits the columns.
- **Disk / DB:** nothing is written to disk (`workbook.xlsx.writeBuffer()`). No DB row is created (it only reads `admin` for the executor name, then runs the raw SELECT).
- **Delivery = FILE.** `res.status(200).send(Buffer)` with
  - `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - `Content-Disposition: attachment; filename="global_search_export_<YYYY-MM-DD_HH-mm-ss>_<ExecutorName>.xlsx"`
  - Errors come back as JSON: 404 `{"code":404,"message":"No data found for export"}`, 401 if the executor is not found, 500 `{code,message,error}`.
  - The frontend (`RegistrationService.exportGlobalSearch` -> `Request.postRequestBlob`) reads the response as a blob and takes the filename from `content-disposition` (`search-list/index.js:1155-1178`).
- **Tested:** 200, `content-length: 9323`, filename `global_search_export_2026-10-21_09-37-08_Admin_Super.xlsx`, magic `504b03040a000000`. ExcelJS opens it: sheet "Поиск", 17 rows (4 header rows + 13 data rows for reg 1708-19). A non-matching `regNumber` returns 404 JSON.

### POST /api/v1/conclusion/genreate_conclusion
- **Controller:** `exports.genreate_conclusion`, `Backend/api/controllers/conclusionController.js` (end of file). Auth: `verifyToken` + `permissionCheck("admin")`.
- **It is a stub.** It ignores the request and always returns `200 {"message":"genreate_conclusion is pending implementation"}`. It builds no document, writes no file and creates no DB row. The frontend never calls it (`ConclusionService.js` only uses list/create/get/update).
- **Example body:** `{}` (ignored).
- **Tested:** 200 with the JSON above.

### Other routes (code review, no document generation)
- **register:** `create`, `get/:id`, `getProverka/:id`, `list`, `update/:id`, `updateregnumber/:id`, `checkregnumber`, `findByNames`, `findByNamesTrgm`, `logs`, `logGetById/:logId`, `globalSearch`, `globalSearchCount`, `getByIds`, `delete/:id`, `updateStatusAll` are all JSON CRUD/search. The file-producing functions `exportData` (zip, `res.sendFile`, `X-Backup-Password` header) and `exportPgDump` (zip of pg_dump) live in `registerController.js`. They are **not** on the register router: they are mounted in `api/router/auth.js` as `POST /auth/backup` and `POST /auth/backup-pg` (superAdmin), so they belong to the auth section.
- **conclusion:** `create`, `list`, `get/:id`, `update` are CRUD over the JSON file `Backend/api/temp/conclusions.json`, not Prisma. They store conclusion template text (title, to_organization, executor, boss, first_input, second_input) and generate no document. `GET /conclusion/list` was tested: 200, 1 record (id `5e11cebc-925b-497b-8bc9-6a5075d79194`).

### Artifacts created by testing
- Repo: none. `api/temp/conclusions.json` stayed 735 B and `git status` is clean. No DB rows were created (all calls were read-only).
- Scratchpad: `out/gse_1708-19.xlsx` (9323 B).

Note: the probe needs `MSYS_NO_PATHCONV=1` under Git Bash. Without it, MSYS rewrites `/api/...` args that have no `?` into `C:/Program Files/Git/api/...` and the probe fails with ERR_UNESCAPED_CHARACTERS.


---

## Statistics (`/api/v1/statistics`, router `api/router/statistcs.js`, controller `api/controllers/statisticsController.js`)

Every route is `POST`. Seven routes build a document. **All seven return a LINK and none return the file itself.** Each one writes the file to `Backend/uploads/<uuid>.<ext>` and replies with JSON:

```json
{ "code": 200, "message": "Document generated and saved successfully", "link": "http://localhost:8080/api/v1/download/<uuid>.docx" }
```

The link is `SERVER_URL` (from `.env`) + `/api/v1/download/<file>`. That path is a static mount in `app/registerRoutes.js` over `uploads/`. It needs no auth, sends `Content-Disposition: attachment`, and accepts an optional `?newFileName=<name>` that renames the download (the extension is kept). The frontend appends `?newFileName=` and clicks a hidden `<a>`.

| Method | Path | Controller | Output format | Delivery | Tested status |
|---|---|---|---|---|---|
| POST | /statistics/reportStatements | reportStatements | .docx (docx `Packer.toBuffer`) | LINK | 200 JSON; link GET 200, docx, `504b0304`, 8547 B |
| POST | /statistics/reportFromForm | reportFromForm | .docx (docx) | LINK | 200 JSON; link GET 200, docx, `504b0304`, 8331 B |
| POST | /statistics/statisticsByForm | statisticsByForm | .docx (docx) | LINK | 200 JSON; link GET 200, docx, `504b0304`, 8307 B |
| POST | /statistics/statisticsByYear | statisticsByYear | .docx (docx) | LINK | 200 JSON; link GET 200, docx, `504b0304`, 8252 B |
| POST | /statistics/monitoringByAdmin | monitoringByAdmin | .docx (docx) | LINK | 200 JSON; link GET 200, docx, `504b0304`, 8375 B |
| POST | /statistics/weeeklyReport | weeeklyReport | .docx (docx) | LINK | 200 JSON; link GET 200, docx, `504b0304`, 8590 B |
| POST | /statistics/dashboard_chart_export | exportDashboardChart | .xlsx (ExcelJS, embeds the PNG/JPEG chart image) | LINK | 200 JSON; link GET 200, xlsx, `504b0304`, 9058 B (contains `xl/media/image1.png`) |

Download response headers (the same for every file, only the type changes):
- docx: `content-type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `content-disposition: attachment; filename="<uuid>.docx"; filename*=UTF-8''<uuid>.docx`
- xlsx: `content-type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, with the same disposition pattern

**Auth:** every route needs `verifyToken`. All except `weeeklyReport` also need `checkAdminAccess(3)`. That check passes when `role === 'superAdmin'` or when the admin has an `adminServiceAccess` for the service with code 3; otherwise it returns 401. `weeeklyReport` has no `checkAdminAccess` and checks access inline instead. A non-superAdmin passes only if they have exactly one `AdminServiceAccess` for the service named "Статистика", or if `admins[0]` is their own id. Otherwise the route returns **500** `{"code":500,"message":"Access denied"}`.

**DB side effects:** the six docx routes each `prisma.raport.create` a row: `executorId` = caller, `link` = the URL, `name`/`notes` as listed below. Five of them also `prisma.raportLink.create` a row with `{raportId, code, delete: true, display: false}`; `monitoringByAdmin` creates only the `raport` row. The DB rows are written **before** `fs.writeFileSync`, so if the write fails, a `raport` row is left pointing at a missing file. `dashboard_chart_export` creates **no DB row**; it only writes the file (`workbook.xlsx.writeFile`) and creates `uploads/` if it is missing. Nothing ever deletes these files.

### Per-endpoint notes (minimal working bodies; all were tested with these)

**reportStatements**: "отчет по ведомствам". Counts per workplace (open/close/KM/access/eliminated/OTK-1) plus a total row. raport.name = `отчет по ведомствам`, notes = `test`, raportLink.code = `test`.
```json
{"workplaces":["all"],"startDate":"2024-01-01T00:00:00.000Z","endDate":"2026-12-31T23:59:59.999Z"}
```
`workplaces` is an array of workplace names, or `["all"]` for every distinct `registration.workplace`. The code calls `workplaces.includes()` before validating the field, so a missing `workplaces` gives a 500 TypeError, not a 400. `form_reg_req` is hardcoded to "registration".

**reportFromForm**: "Отчет по формам СП". Counts for every active form (`registration` and `registration4` types). raport.name = `Отчет по формам (Р, О,У) спецпроверок (dd.mm.yyyy - dd.mm.yyyy)`.
```json
{"startDate":"2024-01-01T00:00:00.000Z","endDate":"2026-12-31T23:59:59.999Z"}
```

**statisticsByForm**: "Сверка по ведомствам, по формам". Per-workplace counts for one model. raport.name = `Отчет по формам (<form_reg_req>) спецпроверок (за выбранный период времениу):`.
```json
{"workplaces":["all"],"startDate":"2024-01-01T00:00:00.000Z","endDate":"2026-12-31T23:59:59.999Z","form_reg_req":"registration"}
```
`form_reg_req` defaults to "registration"; the frontend sends a model value.

**statisticsByYear**: "Статистика по годам". Per-year counts for the chosen forms. raport.name = `Отчет по формам (Р, О) спецпроверок (за выбранный период времениу):`.
```json
{"years":["2024","2025"],"forms":["Р","О"],"executorId":["all"]}
```
`executorId` is required in practice (an array of admin ids or `["all"]`); without it, `executorId.includes` throws a 500. An unknown form name gives a 500 "Invalid form".

**monitoringByAdmin**: "Мониторинг работы операторов". Monthly breakdown per executor for one year. raport.name = `Мониторинг по формам спецпроверок (за выбранный период времениу):`, notes = `test`. **No raportLink row.**
```json
{"years":"2024","forms":["Р","О"],"executors":["all"]}
```
`years` is a single year that goes through `parseInt`, not an array. `executors` takes `["all"]` (every active admin) or a list of ids; unknown ids are skipped.

**weeeklyReport**: "Анализ работы операторов" / "Недельный отчет". Per-admin overdue analysis. raport.name = `Недельный отчет по спецпроверкам`, notes = `test`, raportLink.code = `Weeekly Report`.
```json
{"forms":["Р","О"],"startDate":"2024-01-01T00:00:00.000Z","endDate":"2026-12-31T23:59:59.999Z","admins":["all"]}
```
It is called from two frontend views (`statistics/.../weekly_analysis_operator.js` and `weekly_analysis/.../monitoring_work_operators.js`).

**dashboard_chart_export**: the dashboard's "export chart to Excel". The sheet has the title, the export date and the period in rows 1-3, the chart image at A5, and the data table from row 24. The data comes from the same queries as the JSON chart routes.
```json
{"chartKey":"counted_records","title":"Test chart","periodLabel":"3 years",
 "imageDataUrl":"data:image/png;base64,<base64 png/jpeg>",
 "filters":{"x_axis":"YEAR","month":18,"year":3}}
```
- `chartKey` must be one of `counted_records`, `form_overdue_trend`, `top_otk1_registration`, `top_otk1_registration4`.
- `title` and `periodLabel` are required non-empty strings.
- `filters` must be an object: `{x_axis, month, year}` for the first two keys and `{year}` for top_otk1.
- `imageDataUrl` must match `data:image/(png|jpg|jpeg);base64,...`. The frontend captures it with `ApexCharts.exec(id,"dataURI")`.
- Validation errors return 400.

### JSON-only statistics routes (no document; all tested with 200)
- `POST /counted_records`: `countedRecords`, body `{"x_axis":"MONTH|YEAR","month":18,"year":6}`. Returns `data[]` of `{month, year, open_count, close_count, access_count, otk1_count}`.
- `POST /form_overdue_trend`: `formOverdueTrend`, body `{"x_axis":"YEAR","year":3}`. Returns `data[]` of `{year, month, form_reg, value}`. The export is defined twice (lines 403 and 503); the second definition wins.
- `POST /finished_registration_percentage`: `finishedRegistrationPercentage`, body `{"year":2024,"model":"registration"}`. Returns `{percentage, finished_count, total_count}`.
- `POST /similarity_threshold`: `getSimilarityThreshold`, body `{}`. Returns `{threshold_percent, threshold_ratio, min, max, default}`.
- `POST /similarity_threshold_update`: `updateSimilarityThreshold`. It writes a setting, so it was **not called**.
- `POST /latest_transactions`: `latestTransactions`, body `{"pageNumber":1,"pageSize":10,"year?","forms?","sortFields?"}`. Returns `{rows[], pagination, filters}`.
- `POST /top_otk1_workplaces`: `topOtk1Workplaces`, body `{"year":5,"model":"registration"}` (year must be 1-10). Returns `data[]` of `{year, top[]}`.

Also noted: `statisticsController.generateAVR` builds a docx and returns a LINK, but nothing routes to it. `/raport/createAVR` uses the `generateAVR` from `raportController` instead.

### Artifacts created by this testing
Files in `Backend/uploads/`, all created 2026-10-21 09:39 local time:
- `d99aba58-d58f-4758-b7bd-b4b8e23bd037.docx` (reportStatements)
- `7a632436-c1c6-48ee-a8d0-0016828c7f52.docx` (reportFromForm)
- `0f4d4ee1-e053-4d32-8ee5-df739fcc2107.docx` (statisticsByForm)
- `9cc2e0c9-8cf8-42d7-a440-27bd540c068a.docx` (statisticsByYear)
- `e125fcd2-5dd3-4284-acec-e9d1acc24d73.docx` (monitoringByAdmin)
- `1b32aaa4-6d14-4356-94bf-de166a9e650c.docx` (weeeklyReport)
- `b40283d5-6671-4786-bb86-f8d5426184c6.xlsx` (dashboard_chart_export)

`raport` rows, all with executorId = superadmin `354dca94-9cd3-4c69-8288-c7cdab2d18f2`:
- `8464843d-44f1-49c5-97c4-f27ca2bfcc8a`
- `a4c145f1-939a-4487-b621-ec553755f169`
- `c75c7b90-e835-4f90-8a58-aa3053123f4d`
- `ac3cc835-308e-40fc-be16-0abb92356072`
- `041d58f1-3ad2-4f75-a55f-149555ee5e5c`
- `b54793bf-587b-4baa-a5b7-9bf5be86c356`

`raportLink` rows:
- `f24f7d8e-ddc4-4335-81fa-0f44334e3180`
- `cbb5715b-c7d2-4d01-83e2-77877f831daf`
- `eca6ee85-3181-4b4d-9e09-17410469ba40`
- `bc53489e-0b6b-44b4-94c2-3d003abb8384`
- `d8ba7e49-6097-4aaa-a7ef-dcb2aeb28abf`

Before testing there were 36 `raport` and 36 `raportLink` rows; afterwards 42 and 41, which matches exactly what these calls create. Downloaded copies are in `scratchpad/out/stat_*`, and the request bodies are in `scratchpad/bodies/stat/`.

Harness note: in Git Bash, run with `MSYS_NO_PATHCONV=1`. Otherwise `/api/v1/...` is rewritten to `C:/Program Files/Git/api/...` and the probe fails with ERR_UNESCAPED_CHARACTERS. Also, the shell wrapper here broke inline `VAR=...` assignments, so I ran everything from script files (`scratchpad/run_stat_docs.sh`, `run_stat_dl.sh`).


---

## Auth backup/restore and the other routers

Scope: `api/router/auth.js` and every router outside raport/registartionFour/register/statistcs/conclusion, plus a sweep of the whole `api/` tree (and `app/registerRoutes.js`) for code that builds documents and is not wired to a route.

### Summary table

| Method | Path | Controller | Output format | Delivery | Tested status |
|---|---|---|---|---|---|
| POST | /api/v1/auth/backup (`format: "csv"`, the default and what the frontend sends) | `registerController.exportData` | ZIP with a password (ZipCrypto `zip20`, via archiver + archiver-zip-encrypted) holding about 26 CSVs, one per Prisma model (csv-writer) | **FILE**: `res.sendFile`, `Content-Type: application/zip`, `Content-Disposition: attachment; filename="export_<ts>.zip"`, plus headers `X-Backup-Password` and `X-Backup-Info` (JSON: password, filename, counts) | Code only (not called, by rule) |
| POST | /api/v1/auth/backup (`format: "json"`) | `registerController.exportData` | The whole database as an inline JSON object (`{success, data:{counts,exportedAt,modelCount}, <model>: [...]}`) | **Inline JSON body**: no file, no link, no attachment header | Code only |
| POST | /api/v1/auth/backup-pg | `registerController.exportPgDump` | `pg_dump -F p --clean --if-exists --no-owner --no-acl`, SQL cleaned up (`transaction_timeout` removed), then put in a ZIP with a password (ZipCrypto) | **FILE**: `res.sendFile`, `application/zip`, `attachment; filename="pgdump_<ts>.zip"`, header `X-Backup-Password` | Code only (not called, by rule) |
| GET | /api/v1/download/:file[?newFileName=] | static mount in `app/registerRoutes.js` (not a router file) | Serves any file in `Backend/uploads/` (where the LINK-style generators write their docx/xlsx) | **FILE**: `express.static`, `Content-Disposition: attachment; filename="<ascii>"; filename*=UTF-8''<name>`, `Cache-Control: public, max-age=300` | **Tested**: 200, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `attachment; filename="test.docx"`, magic `504b0304` |
| POST | /api/v1/upload | inline handler in `file_uploads.js` | Not generated. Stores the uploaded file (multer) as `uploads/<uuidv1>.<ext>` and adds a row to the `upload` table | **LINK**: `201 {code, data: <upload row>, link: "<SERVER_URL>/api/v1/download/<file>"}` | Code only (it writes data) |
| GET | /api/v1/upload/list | inline handler in `file_uploads.js` | Not generated. Paginated list of `upload` rows | **LINK** (JSON list of `file_link` URLs); returns `400 {"message":"Nothing appeared"}` when the table is empty | **Tested**: 400 "Nothing appeared" (the table is empty in this DB) |
| (unrouted) | none | `statisticsController.generateAVR` (exported, never imported by `statistcs.js`) | docx (Packer) written to `uploads/<uuid>.docx`, plus `raport` and `raportLink` rows | Would be **LINK** (`{code:200, message, link}`). Not reachable over HTTP | Code only |

### Notes

- **Auth and permission.** `/auth/backup`, `/auth/restore`, `/auth/restore-from-zip`, `/auth/backup-pg` and `/auth/restore-pg` all use `verifyToken` + `permissionCheck("superAdmin")`. `/upload` and `/upload/list` use `verifyToken` (also applied at the mount) + `permissionCheck("admin")`. `/api/v1/download/*` has **no auth at all**: it is a public static mount, so anyone with a generated link can fetch the file.
- **Request shapes.** `backup`: JSON `{format: "csv"|"json"}` (default csv). Other values return 400. The frontend `NavBackup.js` sends `{format:"csv", compress:true}`, and `compress` is ignored. `backup-pg`: empty body `{}`. Both are read in the frontend with `Request.postRequestBlob`.
- **Where the backups go on disk.** Both backup endpoints write to `getBackupTempDir()`, which is `%PROGRAMDATA%\GSPApp\temp` on Windows, falling back to `os.tmpdir()/gspapp/temp`. `exportData` writes `<csvPrefix>_<ts>.csv` files and `export_<ts>.zip`. `exportPgDump` writes `pgdump_<ts>.sql` and `pgdump_<ts>.zip`. All of them are deleted in the `sendFile` callback (or on error). Nothing goes to `uploads/`, nothing goes into the DB, and no link is ever issued. These are the only two endpoints in my scope that stream a generated file directly. The ZIP password exists only in the `X-Backup-Password` response header (CORS `exposedHeaders` lists `X-Backup-Password` and `X-Backup-Info`) and cannot be recovered afterwards.
- **`pg_dump` binary lookup order:** `PG_BIN_DIR`, then `build/pg/bin`, then `C:\Program Files\PostgreSQL\{17..13}\bin`, then the PATH. Connection details are parsed from `DATABASE_URL`, and the password is passed via the `PGPASSWORD` environment variable.
- **Restore routes return no files.** `restore` (JSON body), `restore-from-zip` (multipart `file` + `password`, extracted with 7za) and `restore-pg` (multipart `file` + `password`, then `psql --single-transaction`) all reply with JSON only (`{success, message, data:{...stats}}`). Their temp files (multer upload in `<backupTempDir>/uploads`, `extract_*` folders, cleaned-up SQL) are deleted in `finally`. One leftover from earlier runs exists: `api/temp/uploads/` (an old upload blob and an `extract_1766652465752` folder). Current code no longer writes there.
- **Migration.** `POST /migration/upload` and `/migration/upload-modal` (superAdmin, multipart `.accdb`/`.mdb`) save the upload to `uploads/migrations` (dev) or `%PROGRAMDATA%\GSPApp\uploads\migrations` (prod), import it into Postgres, delete the upload and return JSON `{code, message, data:{migratedFile}}`. No document is produced. `GET /migration/status` was tested and returns 200 JSON `{platform:"win32", driver:"powershell+oledb", scriptsExist:true, accessDriverAvailable:true, ready:true}`.
- **Every other generator in the tree is wired.** A scan of every function in `api/controllers/*.js` for markers (`Packer.`, `new Document(`, `ExcelJS.Workbook`, `writeBuffer`, `archiver(`, `sendFile`, `res.download`, `attachment;`, `/api/v1/download`, `writeFileSync`) found that all are routed through the five routers covered by other agents, or through `auth.js`: the raport generators (`raport.js`, including `generateQuerySgb`/`generateQueryGsbp`, which wrap the local `generateDedicatedQueryRaportSGB/GSBP`), the statistics generators (`statistcs.js`), `registerFourController.exportTemporaryDataToExcel/exportSverkaMain/exportSverka`, and `registerController.globalSearchExport` (FILE, xlsx `writeBuffer` + attachment). The **only unwired one** is `statisticsController.generateAVR`. It has the same name as `raportController.generateAVR`, but `/raport/createAVR` is bound to the raportController version.
- **`res.download` is never live.** Every `res.download(...)` in raport/statistics is commented out. Those generators all write to `uploads/` and return a LINK. The only live `sendFile` calls are the two backup endpoints.
- **Not file output.** `api/temp/conclusions.json` (`conclusionController`, `fsp.writeFile`) is a JSON data store and is covered by the conclusion agent. `api/docs/endpoints.js` and `swagger_output.json` are static files that nothing in `api/` loads. Swagger UI at `/api/v1/api-docs` is built live by `swagger-jsdoc`.
- **Harness gotcha.** Git Bash rewrites a leading-`/` argument such as `/api/v1/health` into a Windows path. Run with `MSYS_NO_PATHCONV=1` (paths that contain `?` happened to pass through untouched).

### Routers checked that produce no documents

- `migration.js`: Access DB import plus a status check, JSON only.
- `file_uploads.js`: stores uploaded files and returns links. It does not generate anything.
- `signList.js` (`signListController`): CRUD, JSON.
- `logs.js` (`logController.getLogs`): JSON.
- `sessions.js` (`sessionController`): JSON.
- `service.js` (`serviceController`): JSON.
- `form.js` (`formController`): JSON.
- `relative.js` (`relativeController`): JSON.
- `workPlace.js` (`workPlaceController`): JSON.
- `realtionDegre.js` (`relationDegreeController`): JSON.
- `initiator.js` (`intiatorController`): JSON.
- `accessStatus.js` (`statusController`): JSON.
- `message.js`: the whole file is commented out. `index.js` requires it, but it is never mounted.
- `health.js`: tested, 200 `{backend:true, database:true}`.
- `auth.js`, all routes other than `backup` and `backup-pg`: JSON only, including the three restore routes.


---

