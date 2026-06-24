# Services — Backend & Frontend Guide

This document explains how **Services** (Uzbek: *Xizmatlar*) work across the project,
on both the **Backend** (Node/Express + Prisma) and the **Frontend** (React).

A **Service** represents an organizational unit / department that an `Admin` can be
granted access to. The link between an admin and a service is modeled by
`AdminServiceAccess`. Only a **superAdmin** can manage services.

---

## 1. Data Model (Prisma)

`Backend/prisma/schema.prisma`

```prisma
model Service {
  id          String               @id @default(uuid())
  name        String               @unique
  description String?              @default("")
  code        Int?
  createdAt   DateTime             @default(now())
  updatedAt   DateTime             @updatedAt
  access      AdminServiceAccess[]   // admins linked to this service

  @@index([id])
}

model AdminServiceAccess {
  id             String   @id @default(uuid())
  adminId        String?
  serviceId      String?
  grantedBy      String?              // admin who granted the access
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  admin          Admin?   @relation(fields: [adminId], references: [id], onDelete: SetNull)
  grantedByAdmin Admin?   @relation("GrantedAccess", fields: [grantedBy], references: [id], onDelete: SetNull)
  service        Service? @relation(fields: [serviceId], references: [id], onDelete: SetNull)

  @@index([adminId])
}
```

- A `Service` has a unique `name`.
- `AdminServiceAccess` is a join table: it records **which admin** has access to
  **which service**, and **who granted** it (`grantedBy`).

---

## 2. Backend

### File map

| Layer       | File                                              |
|-------------|---------------------------------------------------|
| Route       | `Backend/api/router/service.js`                   |
| Controller  | `Backend/api/controllers/serviceController.js`    |
| Mount point | `Backend/api/router/index.js` → `router.use('/services', service)` |
| API prefix  | `Backend/app/registerRoutes.js` → `app.use('/api/v1', apiRouter)`  |

So every service endpoint lives under **`/api/v1/services`**.

### Routes & access control

All routes require a valid token (`verifyToken`) **and** the `superAdmin`
permission (`permissionCheck("superAdmin")`).

`Backend/api/router/service.js`

```js
router.get("/list",      verifyToken, permissionCheck("superAdmin"), getServices);
router.post("/create",   verifyToken, permissionCheck("superAdmin"), createService);
router.post("/addAdmin", verifyToken, permissionCheck("superAdmin"), addAdminToService);
router.put("/update",    verifyToken, permissionCheck("superAdmin"), updateServiceName);
router.delete("/rmAdmin",verifyToken, permissionCheck("superAdmin"), removeAdminFromService);
```

### Endpoint reference

| Method | Path                        | Controller             | Description                          |
|--------|-----------------------------|------------------------|--------------------------------------|
| GET    | `/api/v1/services/list`     | `getServices`          | Paginated, searchable list           |
| POST   | `/api/v1/services/create`   | `createService`        | Create a new service                 |
| POST   | `/api/v1/services/addAdmin` | `addAdminToService`    | Grant an admin access to a service   |
| PUT    | `/api/v1/services/update`   | `updateServiceName`    | Rename a service (writes an audit log)|
| DELETE | `/api/v1/services/rmAdmin`  | `removeAdminFromService`| Revoke an admin's access            |

#### `GET /list`
Query params: `pageNumber` (default 1), `pageSize` (default 10), `query` (search by name, case-insensitive).

Response:
```json
{
  "code": 200,
  "message": "Services found",
  "total_pages": 5,
  "total_services": 100,
  "services": [
    { "id": "...", "name": "...", "description": "...", "createdAt": "...", "updatedAt": "..." }
  ]
}
```
Returns `404` if no services match, `400` on invalid pagination.

#### `POST /create`
Body: `{ "name": "New Service", "description": "..." }` — `name` is required and unique.
Returns `201` with the created service.

#### `POST /addAdmin`
Body: `{ "adminId": "...", "serviceId": "..." }`. Validates both exist, then creates an
`AdminServiceAccess` row with `grantedBy = req.userId`. Returns `404` if admin/service not found.

#### `PUT /update`
Body: `{ "serviceId": "...", "newName": "..." }`. Renames the service and writes a `Log`
record (old/new value, executor) inside a Prisma `$transaction`.

#### `DELETE /rmAdmin`
Query params: `?adminId=...&serviceId=...`. Deletes the matching `AdminServiceAccess` row.

### Related admin endpoint
`AuthService.getAdminServices` (frontend) calls `auth/getAdminServices/:id` to list the
services a given admin currently has access to (see `authController.js`).

### API docs (Swagger)
Each controller method is annotated with `@swagger` JSDoc (descriptions are in Uzbek).
Browse them at: **`/api/v1/api-docs`**.

---

## 3. Frontend

### The service layer pattern

`frontedn_v2/src/services/` contains one file per API domain. Each is a plain object
whose methods call the shared `Request` helper, which wraps an axios instance configured
with `apiBaseUrl` and auth-token interceptors (`utils/request.js`, `utils/baseUrl.js`).

```js
// utils/request.js — the thin HTTP wrapper used by every *Service.js
Request.getRequest(url)
Request.postRequest(url, data, config)
Request.putRequest(url, data)
Request.deleteRequest(url, data)
Request.fileUpload(url, file)        // multipart/form-data
Request.postRequestBlob(url, data)   // for file downloads
```

### `Service.js` (the Services domain)

`frontedn_v2/src/services/Service.js`

```js
import Request from "utils/request";

const Service = {};

Service.getServiceList = (pageNumber = 1, pageSize = 10, query = "") =>
  Request.getRequest(`services/list?pageNumber=${pageNumber}&pageSize=${pageSize}&query=${query}`);

Service.create = (data) => Request.postRequest("relatives/create", data);          // ⚠ see note
Service.delete = (id)   => Request.deleteRequest(`relatives/delete/${id}`);        // ⚠ see note

Service.addAdminService    = (adminId, serviceId) =>
  Request.postRequest("services/addAdmin", { adminId, serviceId });

Service.removeAdminService = (adminId, serviceId) =>
  Request.deleteRequest(`services/rmAdmin?adminId=${adminId}&serviceId=${serviceId}`);

export default Service;
```

| Method                 | Backend endpoint              | Status |
|------------------------|-------------------------------|--------|
| `getServiceList`       | `GET /services/list`          | ✅ matches |
| `addAdminService`      | `POST /services/addAdmin`     | ✅ matches |
| `removeAdminService`   | `DELETE /services/rmAdmin`    | ✅ matches |
| `create`               | `POST /relatives/create`      | ⚠️ points at **relatives**, not `services/create` |
| `delete`               | `DELETE /relatives/delete/:id`| ⚠️ points at **relatives** (backend has no service delete) |

> **⚠️ Known mismatch:** `Service.create` and `Service.delete` currently call the
> `relatives/*` endpoints (likely a copy-paste leftover). The backend exposes
> `POST /services/create` for creation and has **no** service-delete route. If you wire
> up create/delete in the UI, fix `create` to `services/create` and add a backend delete
> route (or remove `Service.delete`).

### All frontend service modules

`frontedn_v2/src/services/`

| File                        | Domain                                  |
|-----------------------------|-----------------------------------------|
| `Service.js`                | Services / departments                  |
| `AuthService.js`            | Login, admins, sessions, backup/restore |
| `AccessStatusService.js`    | Access status                           |
| `ConclusionService.js`      | Conclusions (*xulosa*)                  |
| `FormService.js`            | Forms                                   |
| `InitiatorService.js`       | Initiators                              |
| `MigrationService.js`       | Data migration                          |
| `RaportService.js`          | Reports (*raport*)                      |
| `RaportTypesService.js`     | Report types                            |
| `RegistartionFourService.js`| "Registration four" workflow           |
| `RegistrationService.js`    | Registration                            |
| `RelationlaceService.js`    | Relation place                          |
| `RelativeService.js`        | Relatives                               |
| `SessionService.js`         | Sessions                               |
| `SignedListService.js`      | Signed lists                            |
| `StattisticsService.js`     | Statistics                              |
| `StatusService.js`          | Statuses                                |
| `UploadService.js`          | File uploads                            |
| `WorkPlaceService.js`       | Work places                            |

> Note: several filenames have typos baked in (`Stattistics`, `Registartion`,
> `Relationlace`) — keep imports consistent with the actual filenames.

---

## 4. End-to-end flow (example: list services)

```
React component
   └─ Service.getServiceList(1, 10, "police")
        └─ Request.getRequest("services/list?pageNumber=1&pageSize=10&query=police")
             └─ axios (baseURL = apiBaseUrl, + auth token interceptor)
                  └─ GET /api/v1/services/list
                       └─ router/service.js  → verifyToken → permissionCheck("superAdmin")
                            └─ serviceController.getServices
                                 └─ prisma.service.findMany(...)  → JSON response
```

---

## 5. Infrastructure / Deployment

> ⚠️ **IP addresses are environment-specific and may change** depending on the target
> server. Treat the values below as the current reference for this deployment, not as
> fixed constants. Update them when the network changes.

| Role         | Public / management IP | LAN link IP       | Access |
|--------------|------------------------|-------------------|--------|
| App server   | `192.168.200.150`      | `192.168.111.10`  | hosts Backend (Node/Express) + Frontend build |
| DB server    | `192.168.200.151`      | `192.168.111.11`  | PostgreSQL (Prisma) |
| Win11 host   | `192.168.200.152`      | —                 | RDP (Remote Desktop) |

**Credentials**

- User: `azamat`
- Password: `P@$$wd123`

**Managing the API**

- The API (app server) is **controlled via Proxmox** — the virtualization platform
  hosting these servers. Use the Proxmox web console to start/stop/restart the app and
  DB VMs, check status, and access the consoles.
  - Proxmox login — User: `root`, Password: `P@$$wd123`
- A **new / updated API endpoint can be obtained from the server** itself: pull the
  latest build/config from the app server (and update `apiBaseUrl` on the frontend
  accordingly) whenever the API host or address changes.

> 🔒 **Security note:** Storing plaintext credentials in a repo file is risky. Consider
> moving these into a secrets manager or an untracked `.env` file (and add it to
> `.gitignore`) instead of committing them. Rotate the password if this file is ever
> pushed to a shared remote.

---

## 6. Quick reference

- **Backend service code:** `Backend/api/controllers/serviceController.js`, `Backend/api/router/service.js`
- **Frontend service code:** `frontedn_v2/src/services/Service.js`
- **Base API path:** `/api/v1/services`
- **Required role:** `superAdmin` for all service-management endpoints
- **Swagger UI:** `/api/v1/api-docs`
