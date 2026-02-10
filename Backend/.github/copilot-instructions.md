# Backend GSP - AI Coding Agent Instructions

## Project Overview
This is a Node.js/Express REST API backend for an Automation System for Business (GSP - Government Service Platform). The system manages registration workflows, access control, reporting, and administrative operations with complex authorization patterns.

**Tech Stack:** Node.js 20.x, Express, Prisma ORM, PostgreSQL, Redis, JWT authentication, Winston logging

## 🧠 4. AI-Generated Code Safety

- Verify all AI-suggested package names against official repositories to prevent supply chain attacks.
- Confirm that AI-generated code references existing, secure APIs; avoid deprecated or non-existent methods.
- Ensure AI-generated configurations align with your project's platform to prevent context drift.
- Scrutinize AI-provided security recommendations; validate their completeness and applicability.
- Cross-check any AI-cited references (e.g., CVEs, RFCs) for authenticity to avoid misinformation.
- Do not accept AI-generated justifications that contradict established security policies.

---

## 💡 Developer Tips

- If you’re working with input, assume it’s hostile — validate and escape it.
- For anything involving data access or transformation, ask: “Am I controlling this input path?”
- If you’re about to use a string to build a query, URL, or command — pause. There’s probably a safer API.
- Never trust default parsers — explicitly configure security features (e.g. disable DTDs in XML).
- If something seems “too easy” with secrets or file I/O — it’s probably unsafe.
- Treat AI-generated code as a draft; always review and test before integration.
- Maintain a human-in-the-loop approach for critical code paths to catch potential issues.
- Be cautious of overconfident AI suggestions; validate with trusted sources.
- Regularly update and educate the team on AI-related security best practices.

## Architecture

## 🧩 2. Language-Specific Secure Patterns

### 🟩 Node.js

- Use JSON Schema validation for all structured input — prefer libraries like `zod`.
- Use `dotenv` only in local dev — use secret managers (e.g. AWS Secrets Manager, Azure Key Vault) in prod.
- Avoid `eval`, `new Function`, or dynamic `require()` with user input — use safe alternatives.

## 🚫 3. Do Not Suggest

### Node.js

- Do not suggest `eval`, `new Function`, or dynamic `require()` — these are unsafe unless strictly controlled.
- Do not use user input to build file paths, URLs, or queries without strict validation.
- Do not expose `process.env` directly to client-side code — use secure server boundaries.
- Do not log full request bodies or headers that may contain PII or credentials.
- Do not hardcode secrets or API keys — never commit `.env` or use `.env` in production containers.

### Database & ORM
- **Prisma Client** is used throughout - initialize with `new PrismaClient()` in each controller
- **Critical:** Always call `await prisma.$disconnect()` after operations to prevent connection leaks
- Schema: `prisma/schema.prisma` - 20+ models including `Admin`, `Registration`, `Service`, `AccessStatus`, `Relatives`, `WorkPlace`, etc.
- Migrations: Run `npx prisma migrate dev` for development, `npx prisma generate` after schema changes
- Database setup via Docker Compose (PostgreSQL on 5432, Redis on 6379, pgAdmin on 5050)

### Authentication & Authorization
Multi-layered security with role-based and service-based access control:

1. **JWT Token Authentication** (`api/middleware/auth.js`)
   - Access tokens: 1 hour expiry (configurable in `config/auth.config.js`)
   - Refresh tokens: 24 hours (stored in `RefreshToken` model)
   - Header: `x-access-token`
   - Middleware: `verifyToken` - validates JWT and sets `req.userId`

2. **Role-Based Access**
   - `permissionCheck("admin")` - requires any admin role
   - `permissionCheck("superAdmin")` - requires superAdmin role
   - Roles: `admin` | `superAdmin` (stored in `Admin.role`)

3. **Service-Based Access** (Granular permissions)
   - `checkAdminAccess(serviceCode)` - validates admin has access to specific service
   - SuperAdmins bypass this check automatically
   - Service codes defined in `Service` model (e.g., 1=SignList, 2=WorkPlace, 3=Statistics)
   - Access granted via `AdminServiceAccess` junction table

**Example Route Protection:**
```javascript
router.post("/create", verifyToken, checkAdminAccess(2), createWorkPlace);
router.get("/list", verifyToken, permissionCheck("admin"), getList);
```

### Request/Response Patterns

**Controller Structure:**
- All controllers use `exports.functionName = async (req, res) => {}`
- Standard response format: `{ code: number, message: string, data?: any }`
- Error responses: `res.status(code).json({ code, message })`
- Always disconnect Prisma: `await prisma.$disconnect()` in try/catch/finally blocks

**Swagger requirement:**
- Every route handler must include a Swagger JSDoc block documenting params, responses, and tags.
- Wrap logic in try/catch; always return `{ code, message, data?, error? }` where `error` is present on failures.

**Example pattern (Swagger + controller):**
```javascript
/**
 * @swagger
 * /api/v1/auth/getById:
 *   get:
 *     summary: "Foydalanuvchini ID bo'yicha olish"
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Foydalanuvchi IDsi"
 *     responses:
 *       200:
 *         description: "Foydalanuvchi topildi"
 *       404:
 *         description: "Foydalanuvchi topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.getById = async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ code: 400, message: "ID is required" });
    const user = await prisma.admin.findFirst({
      select: { id: true, first_name: true, last_name: true, father_name: true, nationality: true, rank: true, gender: true, phone: true, username: true, role: true, birthDate: true },
      where: { id },
    });
    if (!user) return res.status(404).json({ code: 404, message: "User not found" });
    return res.status(200).json({ code: 200, message: "User exists", user });
  } catch (err) {
    return res.status(500).json({ code: 500, message: "Internal server error", error: err.message });
  } finally {
    await prisma.$disconnect();
  }
};
```

**Common Validation:**
- Zod schemas in `api/helpers/validator.js` (e.g., `AdminSchema`, `FormSchema`)
- Safe string conversion: Use `safeString(value)` from `api/helpers/safeString.js` to handle null/undefined values

### Routing Structure
Main router: `api/router/index.js` aggregates sub-routers:
- `/api/v1/auth` - authentication (signup, signin, refreshToken)
- `/api/v1/register` - registration management
- `/api/v1/relatives` - relatives management
- `/api/v1/raport` - report generation
- `/api/v1/statistics` - statistical reports
- `/api/v1/services` - service management
- `/api/v1/status` - access status management
- `/api/v1/session` - session management
- `/api/v1/logs` - audit logging
- `/api/v1/download` - file downloads with Cyrillic filename support

### File Uploads & Downloads
- Uploads: `uploads/` directory, managed via `multer`
- Downloads: `/api/v1/download` with custom UTF-8 filename encoding for Cyrillic support
- Query param `?newFileName=...` to override download filename
- Sanitization helper: `sanitizeFileName()` in `index.js`

### Logging
Winston logger configured in `api/helpers/logger.js`:
- `userLogger` - logs to `logs/server.log`
- `paymentLogger` - console output
- Usage: `const { userLogger } = require('../helpers/logger'); userLogger.info('message');`

### Key Models & Relationships

**Admin (Users):**
- Core user model with username/password (bcrypt hashed)
- Fields: `first_name`, `last_name`, `father_name`, `phone`, `rank`, `nationality`, `role`, `status` (active/inactive)
- Relations: `AdminServiceAccess`, `RefreshToken`, `Registration`, `Seans` (sessions), `Log`, `Raport`

**Registration (Main business entity):**
- Tracks registration workflows with status tracking
- `completeStatus`: WAITING | IN_PROGRESS | COMPLETED | EXPIRED
- `status`: "proccess" | other custom states
- Relations: `Relatives`, `WorkPlace`, `Initiator`, `RegistrationLog` (audit trail)
- Fields: `regNumber`, `fullName`, `pinfl`, `birthDate`, `workplace`, `accessStatus`, `executor`

**AdminServiceAccess (Permission Junction):**
- Links admins to services they can access
- Fields: `adminId`, `serviceId`, `grantedBy` (tracks who granted access)

### Prisma models (from `prisma/schema.prisma`)

Enums:
- `CompleteStatus`: WAITING | IN_PROGRESS | COMPLETED | EXPIRED
- `SessionType`: SESSION | RESERVE | RAPORT

Models (key fields and relations):
- `Admin`
  - Fields: `id`, `username` (unique), `password?`, `first_name`, `last_name?`, `father_name?`, `nationality?`, `rank?`, `gender` ("male" default), `phone?` (unique), `photo?`, `salt?`, `role` ("admin" default), `status` ("inactive" default), `birthDate?`, timestamps
  - Relations: `AdminServiceAccess[]`, `grantedAccess` (AdminServiceAccess[] via relation "GrantedAccess"), `RefreshToken[]`, `registrations` (Registration[]), `relatives` (Relatives[] via "RelativesWhoAdded"), `seans` (Seans[]), `accessStatus` (AccessStatus[]), `logs` (Log[]), `RegistrationLog[]`, `raport` (Raport[]), `archive` (Archive[]), `raportTypes` (RaportTypes[]), `temporaryData` (TemporaryData[])
  - Indexes: `username`, `id`

- `AdminServiceAccess`
  - Fields: `id`, `adminId?`, `serviceId?`, `grantedBy?`, timestamps
  - Relations: `admin` (Admin?), `grantedByAdmin` (Admin via "GrantedAccess"), `service` (Service?)
  - Indexes: `adminId`

- `Service`
  - Fields: `id`, `name` (unique), `description?`, `code?`, timestamps
  - Relations: `access` (AdminServiceAccess[])
  - Indexes: `id`

- `Form`
  - Fields: `id`, `name` (unique), `description?`, `length?`, `month?`, `type` ("registration" default), `status?` (boolean), timestamps
  - Indexes: `name`

- `Seans`
  - Fields: `id`, `adminId`, `resource?`, `ip_address?`, `user_agent?`, `auth_method` (default "Login va parol"), timestamps
  - Relations: `admin` (Admin, onDelete: Cascade)
  - Indexes: `adminId`

- `AccessStatus`
  - Fields: `id`, `name` (unique), `adminId?`, `status` (boolean, default false), timestamps
  - Relations: `admin` (Admin?)
  - Indexes: `name`

- `Registration`
  - Fields: `id`, `form_reg?`, `form_reg_log?`, `regNumber?`, `regDate?`, `regEndDate?`, `fullName`, `firstName?`, `lastName?`, `fatherName?`, `nationality?`, `pinfl?`, `birthDate?`, `birthYear?`, `conclusionDate?`, `conclusionRegNum?`, `workplace?`, `position?`, `birthPlace?`, `residence?`, `model` ("registration"), notes fields, `accessStatus?`, `expired?`, `completeStatus?` (default WAITING), `expiredDate?`, `recordNumber?`, `or_tab?`, `executorId?`, `whoAdd?`, `status?` ("proccess"), `endDate?`, timestamps
  - Relations: `executor` (Admin?), `Initiator` (Initiator?), `RegistrationLog[]`, `Relatives[]`, `raportLinks` (RaportLink[])
  - Indexes: `id`

- `WorkPlace`
  - Fields: `id`, `name` (unique), timestamps
  - Indexes: `name`

- `RegistrationLog`
  - Fields: `id`, `registrationId`, `fieldName`, `oldValue?`, `newValue?`, `executorId?`, timestamps
  - Relations: `executor` (Admin, onDelete: Cascade), `registration` (Registration, onDelete: Cascade)
  - Indexes: `registrationId`

- `Relatives`
  - Fields: `id`, `registrationId?`, `regNumber`, `relationDegree`, `fullName`, `firstName`, `lastName`, `fatherName?`, `nationality?`, `pinfl?`, `birthYear?`, `birthDate?`, `birthStatus?`, `birthPlace?`, `residence?`, `workplace?`, `position?`, `familyStatus?` (default "single"), `model` ("relative"), notes fields, `accessStatus?`, `status_analysis` (default true), `or_tab?`, `executorId?`, `whoAdd?`, timestamps
  - Relations: `executor` (Admin via "RelativesWhoAdded"), `Initiator` (Initiator via "InitiatorRelatives"), `registration` (Registration?)
  - Indexes: `registrationId`, `regNumber`

- `Initiator`
  - Fields: `id`, `first_name`, `last_name?`, `father_name?`, `rank?`, `notes?`, timestamps
  - Relations: `Registration[]`, `relatives` (Relatives[] via "InitiatorRelatives"), `temporaryData` (TemporaryData[])
  - Indexes: `id`

- `RelationDegree`
  - Fields: `id`, `name` (unique), timestamps
  - Indexes: `name`

- `RefreshToken`
  - Fields: `id`, `token` (unique), `adminId?`, `expiredAt`, timestamps
  - Relations: `admin` (Admin?)
  - Indexes: `token`

- `Upload`
  - Fields: `id`, `file_link` (unique), `uploadedBy`, timestamps
  - Indexes: `file_link`

- `Log`
  - Fields: `id`, `recordId`, `tableName`, `fieldName`, `oldValue?`, `newValue?`, `executorId?`, timestamps
  - Relations: `executor` (Admin?)
  - Indexes: `recordId`

- `Raport`
  - Fields: `id`, `name`, `executorId?`, `link?`, `notes?`, timestamps
  - Relations: `executor` (Admin?), `links` (RaportLink[])
  - Indexes: `createdAt`

- `SignList`
  - Fields: `id`, `lastName?`, `firstName`, `fatherName?`, `workplace?`, `position?`, `rank?`, `notes?`, `birthDate?`, `nationality?`, `gender` (default "male"), `phone?` (unique), `photo?`, `status` ("inactive"), timestamps
  - Indexes: `firstName`, `lastName`, `fatherName`, `id`

- `RaportLink`
  - Fields: `id`, `raportId?`, `regNumber?`, `code` (default ""), flags: `delete` (bool), `display` (bool), `adminCheck` (bool), `operator` (bool), `notes?`, timestamps
  - Relations: `raport` (Raport?), `registrations` (Registration[] many-to-many)

- `Archive`
  - Fields: `id`, `name?`, `data` (Json?), `executorId?`, timestamps
  - Relations: `executor` (Admin?)

- `RaportTypes`
  - Fields: `id`, `name`, `code`, `code_ru`, `code_uz`, `organization`, `requested_organization`, `signed_fio?`, `signed_position?`, `link?`, `notes?`, `executorId?`, `data` (Json?), timestamps
  - Relations: `executor` (Admin?)
  - Indexes: `createdAt`

- `TemporaryData`
  - Fields: `id`, `order?`, `form_reg`, `regNumber`, `regDate`, names, `fullName`, `birthYear?`, `birthPlace`, `workplace`, `position`, `model`, `residence`, `initiatorId?`, `executorId?`, `accessStatus?`, `data?` (Json), `recordNumber?`, `pinfl?`, `found_status?`, `action_status?`, migration helpers: `registration?`, `registrationSimilarity?` (Json), `registration_four?`, `registration_four_similarity?` (Json), `relatives?`, `migration_status` (bool, default false), `status?`, timestamps
  - Relations: `executor` (Admin?), `Initiator` (Initiator?)
  - Indexes: `executorId`

- `Session`
  - Fields: `id`, `registrationId?`, `regNumber?`, `fullName?`, name parts, `birthYear?`, `birthDate?`, `birthPlace?`, `workplace?`, `position?`, `residence?`, `model` ("registration"), notes fields, `adminId`, `type` (SessionType), `order`, timestamps
  - Indexes: composite `[adminId, id]`

## Development Workflow

**Local Development:**
```bash
npm install                    # Install dependencies
docker-compose up -d           # Start PostgreSQL, Redis, pgAdmin
npx prisma migrate dev         # Run migrations
npm run dev                    # Start with hot-reload (--watch)
npm start                      # Production start
```

**Environment Variables (.env):**
```
DATABASE_URL="postgresql://user:pass@localhost:5432/mbdatabase"
PORT=8080
HOST=127.0.0.1
SERVER_URL=http://localhost:8080
```

**Deployment:**
- Vercel-ready (`vercel.json` configured)
- Docker support (Dockerfile uses Node 20.11.0 builder, Node 16.3.0-alpine runtime)
- Production port: 8080

## Code Conventions

1. **No ES6 imports** - use `require()` consistently throughout the codebase
2. **CommonJS exports** - `module.exports = {...}` or `exports.functionName = ...`
3. **Prisma instantiation** - Create new `PrismaClient()` in each controller file
4. **Error handling** - Always use try/catch with Prisma disconnect in finally block
5. **Date handling** - Use `moment-timezone` for date operations
6. **Constants** - Centralized in `api/helpers/constants.js` (MODEL_TYPE, MODEL_STATUS, SERVER_URL)

## Common Patterns

**Creating a new controller:**
```javascript
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

exports.functionName = async (req, res) => {
  try {
    // Logic here
    await prisma.$disconnect();
    res.json({ code: 200, data: result });
  } catch (error) {
    console.error(error);
    await prisma.$disconnect();
    res.status(500).json({ code: 500, message: error.message });
  }
};
```

**Adding a new protected route:**
```javascript
// In router file
const { verifyToken, checkAdminAccess, permissionCheck } = require('../middleware/auth');
router.post("/create", verifyToken, checkAdminAccess(serviceCode), controllerFunction);
```

**Audit logging pattern:**
Used extensively for tracking changes - see `RegistrationLog` model and `api/controllers/logController.js`

## Testing & Debugging
- No automated tests currently (test script placeholder in package.json)
- Manual testing via API clients (Postman, etc.)
- Logs: Check `logs/server.log` for application logs
- Database inspection: pgAdmin at http://localhost:5050 (admin@example.com / admin)

## Critical Notes
- **Connection management:** Prisma disconnects are critical - missing them causes connection pool exhaustion
- **Status fields:** Multiple status tracking patterns (`status`, `completeStatus`, `accessStatus`) - check model context
- **Cyrillic support:** Filename encoding uses UTF-8 with `filename*=UTF-8''` header format
- **Cache headers:** API routes default to `no-store`, static assets use 1-year caching with immutability
