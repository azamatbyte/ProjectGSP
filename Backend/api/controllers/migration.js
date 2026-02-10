// ============================================================
// Migration Controller - Access DB to PostgreSQL Migration
// Phase 1: Access -> Temporary PostgreSQL Database (access_migration)
// Phase 2: Temp PostgreSQL -> Production PostgreSQL (mbdatabase)
// ============================================================

const { spawn } = require("child_process");
const { createInterface } = require("readline");
const { Client, Pool } = require("pg");
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

// ============================================================
// Configuration
// ============================================================
const OLEDB_PROVIDER = process.env.OLEDB_PROVIDER || "Microsoft.ACE.OLEDB.12.0";
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "2000", 10);

// PowerShell helper scripts
const SCHEMA_SCRIPT = path.join(__dirname, "../../scripts/_ps_schema.ps1");
const STREAM_SCRIPT = path.join(__dirname, "../../scripts/_ps_stream.ps1");

// Temp database config (same PostgreSQL server, different database)
const getTempPgConfig = () => {
    const mainUrl = process.env.DATABASE_URL;
    const match = mainUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)/);
    if (!match) throw new Error("Invalid DATABASE_URL format");
    return {
        host: match[3],
        port: parseInt(match[4], 10),
        database: "access_migration",
        user: match[1],
        password: match[2],
    };
};

// Source pool for reading from temporary database
let sourcePool = null;

// ============================================================
// Utility Functions
// ============================================================

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function pgId(name) {
    return `"${name.replace(/"/g, '""')}"`;
}

function printProgress(inserted, expectedRows) {
    if (expectedRows > 0) {
        const displayTotal = Math.max(expectedRows, inserted);
        const pct = ((inserted / displayTotal) * 100).toFixed(1);
        process.stdout.write(`\r  Progress: ${inserted.toLocaleString()}/${displayTotal.toLocaleString()} (${pct}%)`);
        return;
    }
    process.stdout.write(`\r  Inserted: ${inserted.toLocaleString()} rows`);
}

function getPgType(adoType, maxLen) {
    const map = {
        2: "SMALLINT", 3: "INTEGER", 4: "REAL", 5: "DOUBLE PRECISION",
        6: "NUMERIC(19,4)", 7: "TIMESTAMP", 11: "BOOLEAN", 17: "SMALLINT",
        72: "UUID", 128: "BYTEA", 131: "NUMERIC", 200: "TEXT",
        201: "TEXT", 202: "TEXT", 203: "TEXT", 204: "BYTEA", 205: "BYTEA",
    };
    if (map[adoType]) return map[adoType];
    if (adoType === 130) return maxLen && maxLen > 0 ? `VARCHAR(${maxLen})` : "TEXT";
    return "TEXT";
}

function getForm(form) {
    const parts = form.split(',');
    const lastPart = parts[parts.length - 1];
    const result = lastPart.includes('-') ? lastPart.split('-').pop() : lastPart;
    return result.trim();
}

const getDateStringWithFormat = (data, format) => {
    if (data === null) return 'Kritilmagan';
    const date = new Date(data);
    const year = date.getFullYear().toString();
    if (format === "year") return year;
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    if (format === "month") return `${year}-${month}`;
    const day = date.getDate().toString().padStart(2, '0');
    if (format === "day") return `${year}-${month}-${day}`;
    const hour = date.getHours().toString().padStart(2, '0');
    const minute = date.getMinutes().toString().padStart(2, '0');
    if (format === "hour" || format === "minute") return `${year}-${month}-${day} ${hour}:${minute}`;
    if (format === "format") return `${day}${month}${year}`;
    return `${year}-${month}-${day} ${hour}:${minute}`;
};

function parseValues(input) {
    if (!input) return null;
    const result = input.split(",").filter(item => {
        if (item.includes("-")) return true;
        if (item.length === 1) return false;
        return true;
    }).join(",");
    return result.length > 0 ? result : null;
}

function expiredDateFunc(regDate, regEndDate, formLength) {
    const thresholdDate = new Date('2010-01-01');
    const registrationDate = new Date(regDate);
    const regEndDateDate = new Date(regEndDate);
    if (registrationDate < thresholdDate) return null;
    if (regEndDateDate > registrationDate) {
        const date = new Date(regEndDate);
        date.setFullYear(date.getFullYear() + (formLength || 0));
        return date;
    }
    return null;
}

function expiredDateForm(regDate, regEndDate) {
    if (regDate && regEndDate) {
        const date = new Date(regDate);
        date.setMonth(date.getMonth() + 2);
        return date;
    }
    return null;
}

function getAccessStatus(accessStatus, record) {
    if (record['Заключение, рег №, форма']?.includes(record['Регистрационный номер и гриф секр'])) {
        if (record['Окончание проверки'] == null || record['Окончание проверки'] < record['Дата регистрации']) return 'ПРОВЕРКА';
    } else if (record['Допуск'] == null) {
        return 'ДОПУСК';
    }
    return accessStatus || 'ДОПУСК';
}

function getAccessStatus4(accessStatus, record) {
    if (record['Заключение']?.includes(record['Рег №'])) {
        if (record['Дата окончания'] === null || record['Дата окончания'] < record['Дата регистрации']) return 'ПРОВЕРКА';
    } else if (record['Допуск'] === null) {
        return 'ДОПУСК';
    }
    return accessStatus || 'ДОПУСК';
}

function completeStatusReg(regDate, regEndDate, record) {
    if (regDate == '2020-01-01') return 'COMPLETED';
    if (record['Заключение, рег №, форма']?.includes(record['Регистрационный номер и гриф секр'])) return 'COMPLETED';
    if (regEndDate == null || regEndDate <= regDate) return 'WAITING';
    return 'COMPLETED';
}

function completeStatusReg4(regDate, regEndDate, record) {
    if (regDate == '2020-01-01') return 'COMPLETED';
    if (record['Заключение']?.includes(record['Рег №'])) return 'COMPLETED';
    if (regEndDate === null || regEndDate <= regDate) return 'WAITING';
    return 'COMPLETED';
}

function formLog(form_reg, record) {
    return (record["Форма допуска"] || "") + "-" + getDateStringWithFormat(record["Дата регистрации"], "year");
}

// ============================================================
// Record Mapping Functions
// ============================================================

function mapRecordToRegistrationData(record, initiatorId, executorId, formId, notes, completeStatus, expiredDate, expired, accessStatus, fl) {
    return {
        regNumber: record['Регистрационный номер и гриф секр'],
        regDate: record['Дата регистрации'] ? new Date(record['Дата регистрации'] + 'Z') : null,
        regEndDate: record['Окончание проверки'] ? new Date(record['Окончание проверки'] + 'Z') : null,
        form_reg: formId,
        form_reg_log: fl,
        conclusionDate: record['Заключение, дата'] ? new Date(record['Заключение, дата'] + 'Z') : null,
        conclusionRegNum: record['Заключение, рег №, форма'],
        fullName: record['Фамилия,имя,отчество']?.trim(),
        firstName: record['Фамилия,имя,отчество']?.split(' ')[1]?.trim(),
        lastName: record['Фамилия,имя,отчество']?.split(' ')[0]?.trim(),
        fatherName: record['Фамилия,имя,отчество']?.split(' ').slice(2).join(' ').trim(),
        birthYear: record['Год рождения'] ? parseInt(record['Год рождения'], 10) : null,
        birthDate: record['Дата и год рождения'] ? new Date(record['Дата и год рождения'] + 'Z') : null,
        birthPlace: record['Место рождения'] == '-' ? null : record['Место рождения'],
        residence: record['Место жительства'] == '-' ? null : record['Место жительства'],
        workplace: record['Место работы и должность'] == '-' ? null : record['Место работы и должность']?.split(',')[0]?.trim(),
        position: record['Место работы и должность'] == '-' ? null : record['Место работы и должность']?.split(',')[1]?.trim(),
        accessStatus,
        notes: record['Примечания'] ? String(record['Примечания']).trim() : null,
        externalNotes: notes ? String(notes).trim() : null,
        or_tab: initiatorId,
        executorId,
        whoAdd: executorId,
        expired,
        recordNumber: record['Номер анкеты'],
        completeStatus,
        expiredDate
    };
}

function mapRecordToRegistration4Data(record, initiatorId, executorId, formId, notes, completeStatus, expiredDate, expired, accessStatus, fl) {
    return {
        regNumber: record['Рег №'],
        regDate: record['Дата регистрации'] ? new Date(record['Дата регистрации'] + 'Z') : null,
        regEndDate: record['Дата окончания'] ? new Date(record['Дата окончания'] + 'Z') : null,
        form_reg: formId,
        form_reg_log: formId + "-" + getDateStringWithFormat(record["Дата регистрации"], "year"),
        conclusionDate: record['Дата заключения'] ? new Date(record['Дата заключения'] + 'Z') : null,
        conclusionRegNum: record['Заключение'],
        fullName: record['Фамилия,имя,отчество']?.trim(),
        firstName: record['Фамилия,имя,отчество']?.split(' ')[1]?.trim(),
        lastName: record['Фамилия,имя,отчество']?.split(' ')[0]?.trim(),
        fatherName: record['Фамилия,имя,отчество']?.split(' ').slice(2).join(' ').trim(),
        birthYear: record['Дата рождения'] ? parseInt(record['Дата рождения'], 10) : null,
        birthDate: record['Дата и год рождения'] ? new Date(record['Дата и год рождения'] + 'Z') : null,
        birthPlace: record['Место рождения'] == '-' ? null : record['Место рождения'],
        residence: record['Место жительства'] == '-' ? null : record['Место жительства'],
        workplace: record['Место работы'] == '-' ? null : record['Место работы']?.split(',')[0]?.trim(),
        position: record['Место работы'] == '-' ? null : record['Место работы']?.split(',')[1]?.trim(),
        accessStatus,
        notes: record['Компроматериалы'] ? String(record['Компроматериалы']).trim() : null,
        externalNotes: notes ? String(notes).trim() : null,
        or_tab: initiatorId,
        executorId,
        whoAdd: executorId,
        model: "registration4",
        expired,
        recordNumber: record['Номер анкеты'],
        completeStatus,
        expiredDate
    };
}

function mapRecordToRelativeData(record, relationDegree, relationId, initiatorId, model = "relative", status_analysis = true) {
    return {
        regNumber: record["Регистрационный номер и гриф секр"] || record["Рег №"] || "",
        relationDegree: relationDegree,
        registrationId: relationId,
        fullName: record["Фамилия,имя,отчество"]?.trim(),
        firstName: record["Фамилия,имя,отчество"]?.split(" ")[1]?.trim(),
        lastName: record["Фамилия,имя,отчество"]?.split(" ")[0]?.trim(),
        fatherName: record["Фамилия,имя,отчество"]?.split(" ").slice(2).join(" ").trim(),
        birthYear: record["Год рождения"] ? parseInt(record["Год рождения"], 10) : null,
        birthPlace: record["Место рождения"] == "-" ? null : record["Место рождения"],
        residence: record["Место жительства"] == "-" ? null : record["Место жительства"],
        workplace: record["Место работы и должность"] == "-" ? null : (record["Место работы и должность"] || record["Место работы"])?.split(",")[0]?.trim(),
        position: record["Место работы и должность"] == "-" ? null : (record["Место работы и должность"] || record["Место работы"])?.split(",")[1]?.trim(),
        notes: record["Примечания"] == "-" ? null : record["Примечания"],
        or_tab: initiatorId,
        model: model,
        status_analysis: status_analysis,
    };
}

// ============================================================
// Database Lookup/Creation Helpers
// ============================================================

async function getOrCreateUnknownRelationDegree() {
    return await prisma.relationDegree.findFirst({ where: { name: 'Сам' } }) ||
        await prisma.relationDegree.create({ data: { name: 'Сам' } });
}

async function getOrCreateUnknownWorkplace() {
    return await prisma.workPlace.findFirst({ where: { name: "Неизвестно" } }) ||
        await prisma.workPlace.create({ data: { name: "Неизвестно" } });
}

async function getOrCreateUnknownInitiator() {
    return await prisma.initiator.findFirst({ where: { notes: "Неизвестно" } }) ||
        await prisma.initiator.create({ data: { first_name: "Неизвестно", last_name: "", notes: "Неизвестно" } });
}

async function getOrCreateUnknownExecutor() {
    return await prisma.admin.findFirst({ where: { photo: "Неизвестно" } }) ||
        await prisma.admin.create({ data: { first_name: "Неизвестно", last_name: "", username: "unknownadmin", role: 'admin', status: 'active', photo: "Неизвестно" } });
}

async function findOrCreateRelationDegree(name, unknownRelationDegree) {
    if (!name || name === '-') return unknownRelationDegree;
    const check = await prisma.relationDegree.findFirst({ where: { name } });
    return check || await prisma.relationDegree.create({ data: { name } });
}

async function findOrCreateInitiator(notes, unknownInitiator) {
    if (!notes) return unknownInitiator;
    const search = await prisma.initiator.findFirst({ where: { notes } });
    if (search) return search;
    const [last_name, first_name] = notes.split(' ').map(n => n.trim());
    return await prisma.initiator.create({ data: { last_name, first_name, notes } });
}

async function findOrCreateExecutor(photo, unknownExecutor) {
    if (!photo) return unknownExecutor;
    const check = await prisma.admin.findFirst({ where: { photo } });
    if (check) return check;
    const [last_name, first_name] = photo.split(' ').map(n => n.trim());
    return await prisma.admin.create({
        data: {
            first_name,
            last_name,
            username: (last_name || "unknown").toLowerCase() + Math.floor(Math.random() * 1000000) + 'admin',
            role: 'admin',
            status: 'active',
            photo
        }
    });
}

async function findOrCreateForm(formName, unknownForm) {
    if (!formName || formName === '-') return unknownForm;
    const form = getForm(formName);
    const check = await prisma.form.findFirst({ where: { name: form } });
    return check || await prisma.form.create({ data: { name: form } });
}

async function findOrCreateForm4() {
    const check = await prisma.form.findFirst({ where: { name: '4' } });
    return check || await prisma.form.create({ data: { name: '4', description: '4', length: 2, month: 1, type: 'registration4' } });
}

async function findOrCreateWorkplace(workplaceName, unknownWorkplace) {
    if (!workplaceName || workplaceName === '-') return unknownWorkplace;
    const [workplace] = workplaceName.split(',').map(n => n.trim());
    const check = await prisma.workPlace.findFirst({ where: { name: workplace } });
    return check || await prisma.workPlace.create({ data: { name: workplace } });
}

// ============================================================
// Phase 1: Access to Temporary PostgreSQL
// ============================================================

function runPowerShell(scriptPath, args) {
    return new Promise((resolve, reject) => {
        const ps = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, ...args], { stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        ps.stdout.setEncoding("utf8");
        ps.stderr.setEncoding("utf8");
        ps.stdout.on("data", (d) => (stdout += d));
        ps.stderr.on("data", (d) => (stderr += d));
        ps.on("close", (code) => {
            if (code !== 0 && !stdout.includes("SCHEMA_DONE") && !stdout.includes("DONE:")) {
                reject(new Error(`PowerShell exit ${code}: ${stderr || stdout}`));
            } else {
                resolve(stdout);
            }
        });
        ps.on("error", reject);
    });
}

function parseSchema(output) {
    const tables = [];
    let current = null;
    for (const line of output.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith("TABLE:")) {
            const pipeIdx = trimmed.indexOf("|ROWS:");
            const name = pipeIdx > 0 ? trimmed.substring(6, pipeIdx) : trimmed.substring(6);
            const rows = pipeIdx > 0 ? parseInt(trimmed.substring(pipeIdx + 6), 10) : 0;
            current = { name, rows, columns: [], primaryKeys: [] };
            tables.push(current);
        } else if (trimmed.startsWith("COL:") && current) {
            const lenIdx = trimmed.lastIndexOf("|LEN:");
            const typeIdx = trimmed.lastIndexOf("|TYPE:");
            if (typeIdx < 0) continue;
            const colName = trimmed.substring(4, typeIdx);
            const adoType = parseInt(trimmed.substring(typeIdx + 6, lenIdx > typeIdx ? lenIdx : undefined), 10);
            const maxLen = lenIdx > typeIdx ? parseInt(trimmed.substring(lenIdx + 5), 10) : 0;
            current.columns.push({ name: colName, adoType, maxLen, pgType: getPgType(adoType, maxLen) });
        } else if (trimmed.startsWith("PK:") && current) {
            current.primaryKeys.push(trimmed.substring(3));
        } else if (trimmed === "END_TABLE") {
            current = null;
        } else if (trimmed.startsWith("SCHEMA_ERROR:")) {
            throw new Error("Access schema error: " + trimmed.substring(13));
        }
    }
    return tables;
}

async function connectTempPgWithRetry(maxRetries = 30) {
    const TEMP_PG_CONFIG = getTempPgConfig();

    for (let i = 0; i < maxRetries; i++) {
        try {
            const tmpClient = new Client({ ...TEMP_PG_CONFIG, database: "postgres" });
            await tmpClient.connect();
            const res = await tmpClient.query("SELECT 1 FROM pg_database WHERE datname = $1", [TEMP_PG_CONFIG.database]);
            if (res.rows.length === 0) {
                await tmpClient.query(`CREATE DATABASE ${pgId(TEMP_PG_CONFIG.database)}`);
                console.log(`  Created database "${TEMP_PG_CONFIG.database}"`);
            }
            await tmpClient.end();
            break;
        } catch (err) {
            if (i < maxRetries - 1) {
                process.stdout.write(`\r  Waiting for PostgreSQL... (${i + 1}/${maxRetries})`);
                await sleep(2000);
            } else {
                throw new Error("Cannot connect to PostgreSQL: " + err.message);
            }
        }
    }
    console.log("");
    const client = new Client(TEMP_PG_CONFIG);
    await client.connect();
    return client;
}

async function createTempPgTable(pg, table) {
    const tableName = pgId(table.name);
    await pg.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
    const colDefs = table.columns.map((col) => `  ${pgId(col.name)} ${col.pgType} NULL`);
    await pg.query(`CREATE TABLE ${tableName} (\n${colDefs.join(",\n")}\n)`);
}

async function insertBatch(pg, tableName, columns, rows) {
    if (rows.length === 0) return;
    const MAX_PARAMS = 60000;
    const colCount = columns.length;
    const chunkSize = Math.min(rows.length, Math.max(1, Math.floor(MAX_PARAMS / colCount)));
    const pgTableName = pgId(tableName);
    const pgColNames = columns.map((c) => pgId(c.name)).join(", ");

    for (let offset = 0; offset < rows.length; offset += chunkSize) {
        const chunk = rows.slice(offset, offset + chunkSize);
        const valueClauses = [];
        const params = [];
        let idx = 1;
        for (const row of chunk) {
            const placeholders = [];
            for (const col of columns) {
                placeholders.push(`$${idx++}`);
                let val = row[col.name];
                if (val === null || val === undefined) {
                    params.push(null);
                } else if (col.adoType === 11) {
                    params.push(val === true || val === -1 || val === 1);
                } else if (col.adoType === 128 || col.adoType === 204 || col.adoType === 205) {
                    params.push(typeof val === "string" ? Buffer.from(val, "base64") : val);
                } else {
                    params.push(val);
                }
            }
            valueClauses.push(`(${placeholders.join(", ")})`);
        }
        const sql = `INSERT INTO ${pgTableName} (${pgColNames}) VALUES ${valueClauses.join(", ")}`;
        await pg.query(sql, params);
    }
}

async function streamAndInsertFromPowerShell(pg, table, connStr) {
    return new Promise((resolve, reject) => {
        const ps = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", STREAM_SCRIPT, "-ConnStr", connStr, "-TableName", table.name], { stdio: ["ignore", "pipe", "pipe"] });
        ps.stdout.setEncoding("utf8");
        ps.stderr.setEncoding("utf8");
        const rl = createInterface({ input: ps.stdout });
        let buffer = [];
        let inserted = 0;
        let error = null;
        let flushing = false;
        let closed = false;

        async function flushBuffer() {
            if (buffer.length === 0) return;
            const batch = buffer;
            buffer = [];
            flushing = true;
            try {
                await insertBatch(pg, table.name, table.columns, batch);
                inserted += batch.length;
                printProgress(inserted, table.rows);
            } catch (err) {
                error = err;
                ps.kill();
            }
            flushing = false;
        }

        rl.on("line", (line) => {
            if (error) return;
            if (line.startsWith("DONE:")) return;
            if (line.startsWith("STREAM_ERROR:")) {
                error = new Error(line.substring(13));
                return;
            }
            if (!line.startsWith("{")) return;
            try {
                buffer.push(JSON.parse(line));
            } catch { return; }
            if (buffer.length >= BATCH_SIZE) {
                rl.pause();
                flushBuffer().then(() => { if (!error && !closed) rl.resume(); }).catch((err) => { error = err; ps.kill(); });
            }
        });

        let stderr = "";
        ps.stderr.on("data", (d) => (stderr += d));
        ps.on("close", async (code) => {
            closed = true;
            try {
                while (flushing) await sleep(50);
                if (!error) await flushBuffer();
            } catch (err) { error = err; }
            if (error) return reject(error);
            if (code !== 0 && inserted === 0) return reject(new Error(`Stream exit ${code}: ${stderr}`));
            console.log("");
            resolve(inserted);
        });
        ps.on("error", reject);
    });
}

async function migrateAccessToTempDb(accessPath) {
    console.log("\n[Phase 1] Migrating Access to Temporary PostgreSQL...\n");

    const CONN_STR = `Provider=${OLEDB_PROVIDER};Data Source=${accessPath};`;

    if (!fs.existsSync(accessPath)) {
        throw new Error(`Access file not found: ${accessPath}`);
    }
    if (!fs.existsSync(SCHEMA_SCRIPT) || !fs.existsSync(STREAM_SCRIPT)) {
        throw new Error("PowerShell helper scripts not found (_ps_schema.ps1, _ps_stream.ps1)");
    }

    console.log("[1/4] Discovering Access schema...");
    const schemaOutput = await runPowerShell(SCHEMA_SCRIPT, ["-ConnStr", CONN_STR]);
    const tables = parseSchema(schemaOutput);
    console.log(`  Found ${tables.length} tables\n`);
    for (const t of tables) {
        console.log(`  ${t.name} : ${t.rows.toLocaleString()} rows, ${t.columns.length} cols`);
    }
    console.log("");

    console.log("[2/4] Connecting to Temporary PostgreSQL...");
    const pg = await connectTempPgWithRetry();
    console.log("  Connected!\n");

    console.log("[3/4] Creating tables in Temporary PostgreSQL...");
    for (const table of tables) {
        await createTempPgTable(pg, table);
        console.log(`  Created: ${table.name}`);
    }
    console.log("");

    console.log("[4/4] Streaming data from Access to Temporary PostgreSQL...\n");
    for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        console.log(`--- [${i + 1}/${tables.length}] ${table.name} (${table.rows.toLocaleString()} rows) ---`);
        if (table.rows === 0) {
            console.log("  Skipped (empty table)\n");
            continue;
        }
        try {
            await streamAndInsertFromPowerShell(pg, table, CONN_STR);
        } catch (err) {
            console.log(`  ERROR: ${err.message}`);
        }
        console.log("");
    }

    await pg.end();
    console.log("Phase 1 Complete: Access data is now in Temporary PostgreSQL\n");
}

// ============================================================
// Phase 2: Temporary PostgreSQL to Production (Prisma)
// ============================================================

async function clearProductionDB() {
    console.log("Clearing production database...");
    try {
        await prisma.accessStatus.deleteMany();
        await prisma.workPlace.deleteMany();
        await prisma.refreshToken.deleteMany();
        await prisma.form.deleteMany();
        await prisma.upload.deleteMany();
        await prisma.relationDegree.deleteMany();
        await prisma.adminServiceAccess.deleteMany();
        await prisma.service.deleteMany();
        await prisma.seans.deleteMany();
        await prisma.admin.deleteMany();
        await prisma.registrationLog.deleteMany();
        await prisma.relatives.deleteMany();
        await prisma.registration.deleteMany();
        await prisma.initiator.deleteMany();
        await prisma.raport.deleteMany();
        await prisma.raportLink.deleteMany();
        await prisma.raportTypes.deleteMany();
        await prisma.archive.deleteMany();
        await prisma.temporaryData.deleteMany();
        await prisma.session.deleteMany();
        await prisma.signList.deleteMany();
    } catch (err) {
        console.error(`Failed to clear database:`, err);
    }
}

async function createDefaultAdminsAndServices() {
    try {
        const service = await prisma.service.create({ data: { name: "Руководители", description: "Руководители для операторов.", code: 1 } });
        await prisma.service.create({ data: { name: "Места работы", description: "Места работы для операторов.", code: 2 } });
        await prisma.service.create({ data: { name: "Статистика", description: "Статистика для операторов.", code: 3 } });
        await prisma.service.create({ data: { name: "Удаление", description: "Удаление Ф-4 для операторов.", code: 4 } });

        const superAdmin = await prisma.admin.create({
            data: {
                first_name: "Super", last_name: "Admin", username: "superadmin", status: "active",
                password: "$2a$10$VlxkGYp1/vjOX4TGkppFPeBwUcByuCNp5GhMOPGWC116Vr9sN/9oO",
                salt: "$2a$10$Q4b2cf/QMoJMr.NFxnyBZu", role: "superAdmin"
            }
        });
        const admin = await prisma.admin.create({
            data: {
                first_name: "Admin", last_name: "Super", username: "admin01", status: "active",
                password: "$2a$10$VlxkGYp1/vjOX4TGkppFPeBwUcByuCNp5GhMOPGWC116Vr9sN/9oO",
                salt: "$2a$10$Q4b2cf/QMoJMr.NFxnyBZu", role: "superAdmin"
            }
        });
        await prisma.admin.create({
            data: {
                first_name: "Admin", last_name: "Admin", username: "admin02", status: "active",
                password: "$2a$10$VlxkGYp1/vjOX4TGkppFPeBwUcByuCNp5GhMOPGWC116Vr9sN/9oO",
                salt: "$2a$10$Q4b2cf/QMoJMr.NFxnyBZu", role: "admin"
            }
        });
        await prisma.adminServiceAccess.create({ data: { adminId: admin.id, serviceId: service.id, grantedBy: superAdmin.id } });

        // Create forms
        await prisma.form.create({ data: { name: "Р", description: "Р", length: 2, month: 1, status: true, type: "registration" } });
        await prisma.form.create({ data: { name: "О", description: "О", length: 4, month: 1, status: true, type: "registration" } });
        await prisma.form.create({ data: { name: "У", description: "У", length: 1, month: 1, status: true, type: "registration4" } });
        await prisma.form.create({ data: { name: "1", description: "1", length: 2, month: 1, type: "registration" } });
        await prisma.form.create({ data: { name: "2", description: "2", length: 4, month: 1, type: "registration" } });
        await prisma.form.create({ data: { name: "3", description: "3", length: 4, month: 1, type: "registration" } });
        await prisma.form.create({ data: { name: "4", description: "4", length: 2, month: 1, type: "registration4" } });

        // Create access statuses
        await prisma.accessStatus.create({ data: { name: "СП ПРОВЕРКА", adminId: admin.id, status: true } });
        await prisma.accessStatus.create({ data: { name: "ОТКАЗ", adminId: admin.id, status: true } });
        await prisma.accessStatus.create({ data: { name: "ОТКАЗ-1", adminId: admin.id, status: true } });
        await prisma.accessStatus.create({ data: { name: "ДОПУСК АННУЛИРОВАН", adminId: admin.id, status: true } });
        await prisma.accessStatus.create({ data: { name: "ДОПУСК", adminId: admin.id, status: true } });
        await prisma.accessStatus.create({ data: { name: "ПРОВЕРКА", adminId: admin.id, status: true } });
        await prisma.accessStatus.create({ data: { name: "ЗАКЛЮЧЕНИЕ", adminId: admin.id, status: true } });
        await prisma.accessStatus.create({ data: { name: "ПОВТОРНЫЙ ОТКАЗ", adminId: admin.id, status: true } });
        await prisma.accessStatus.create({ data: { name: "СНЯТ ОТКАЗ", adminId: admin.id, status: true } });

        // Create raport types
        await prisma.raportTypes.create({ data: { name: "МВД", code: "osu_mvd", code_ru: "osu_mvd", code_uz: "osu_mvd", organization: "МВД Республики Узбекистан", requested_organization: "ГСБП Республики Узбекистан", signed_fio: "И.И.Иванов", signed_position: "Генеральный директор", link: "type1", notes: "Р", executorId: admin.id } });
        await prisma.raportTypes.create({ data: { name: "ОСУ", code: "osu_sgb", code_ru: "osu_sgb", code_uz: "osu_sgb", organization: "СГБ Республики Узбекистан", requested_organization: "ГСБП Республики Узбекистан", signed_fio: "И.И.Иванов", signed_position: "Генеральный директор", link: "type2", notes: "no name, no request_organization", executorId: admin.id } });
        await prisma.raportTypes.create({ data: { name: "ГСБП", code: "osu_sgb", code_ru: "osu_sgb", code_uz: "osu_sgb", organization: "ГСБП Республики Узбекистан", requested_organization: "ГСБП Республики Узбекистан", signed_fio: "И.И.Иванов", signed_position: "Генеральный директор", link: "type2", notes: "no name, no request_organization", executorId: admin.id } });

        await prisma.registration.create({ data: { fullName: "Неизвестно", firstName: "Неизвестно", lastName: "Неизвестно", fatherName: "Неизвестно", regNumber: "Неизвестно", regDate: "2025-01-01T00:00:00.000Z", notes: "Неизвестно", executorId: admin.id } });
        await prisma.registration.create({ data: { fullName: "Неизвестно1", form_reg: "Р", firstName: "Неизвестно1", lastName: "Неизвестно1", fatherName: "Неизвестно1", regNumber: "Неизвестно1", regDate: "2024-01-01T00:00:00.000Z", notes: "Неизвестно1", executorId: admin.id } });

        return { id: admin.id, adminId: admin.id };
    } catch (err) {
        console.error(`Failed to create default data:`, err);
        throw err;
    }
}

async function migrateRegistrations(table) {
    const batchSize = 1000;
    let offset = 0;
    console.log(`Migrating registrations from [${table}]...`);

    const [unknownWorkplace, unknownInitiator, unknownExecutor, unknownForm] = await Promise.all([
        prisma.workPlace.create({ data: { name: "Неизвестно" } }).catch(() => prisma.workPlace.findFirst({ where: { name: "Неизвестно" } })),
        prisma.initiator.create({ data: { first_name: "Неизвестно", last_name: "Неизвестно", notes: "Неизвестно" } }).catch(() => prisma.initiator.findFirst({ where: { notes: "Неизвестно" } })),
        prisma.admin.create({ data: { first_name: "Неизвестно", last_name: "Неизвестно", username: "unknownadmin", role: "admin", status: "active", photo: "Неизвестно" } }).catch(() => prisma.admin.findFirst({ where: { photo: "Неизвестно" } })),
        prisma.form.create({ data: { name: "Неизвестно" } }).catch(() => prisma.form.findFirst({ where: { name: "Неизвестно" } })),
    ]);

    let hasMoreData = true;
    while (hasMoreData) {
        const sourceQuery = `SELECT * FROM "${table}" LIMIT ${batchSize} OFFSET ${offset}`;
        const sourceData = (await sourcePool.query(sourceQuery)).rows;
        if (sourceData.length === 0) { hasMoreData = false; break; }

        for (const record of sourceData) {
            try {
                const [executor, formId, initiator] = await Promise.all([
                    findOrCreateExecutor(record["Исполнитель"] || false, unknownExecutor),
                    findOrCreateForm(record["Форма допуска"] || unknownForm, unknownForm),
                    findOrCreateInitiator(record["О/р"] || false, unknownInitiator),
                ]);
                await findOrCreateWorkplace(record["Место работы и должность"] || unknownWorkplace, unknownWorkplace);
                const notes = (record["Примечания(доп)"] === "-" || record["Примечания(доп)"] === null ? "" : record["Примечания(доп)"]) + (record["Примечания 1 (доп)"] === "-" || record["Примечания 1 (доп)"] === null ? "" : record["Примечания 1 (доп)"]);
                let completeStatus = completeStatusReg(record["Дата регистрации"], record["Окончание проверки"], record);
                let expiredDate = expiredDateForm(record["Дата регистрации"], record["Окончание проверки"]);
                let expired = expiredDateFunc(record["Дата регистрации"], record["Окончание проверки"], formId?.length);
                let accessStatus = getAccessStatus(record["Допуск"], record);
                if (completeStatus === "WAITING") { accessStatus = "ПРОВЕРКА"; expired = null; }
                if (completeStatus === "COMPLETED") { expiredDate = null; }
                if (!(accessStatus == "ДОПУСК" || accessStatus == "IN_PROGRESS" || accessStatus == "ПРОВЕРКА" || accessStatus?.toLowerCase().includes('снят'))) { expired = null; }

                const registration = await prisma.registration.create({
                    data: mapRecordToRegistrationData(record, initiator?.id || null, executor?.id || null, formId?.name || null, notes, completeStatus, expiredDate, expired, accessStatus, formLog(formId?.name, record)),
                });

                const formValues = parseValues(record["Форма допуска"]);
                if (formValues) {
                    await prisma.registrationLog.create({
                        data: { registrationId: registration.id, fieldName: "form_reg", oldValue: formValues, newValue: formId?.name, createdAt: record["Дата регистрации"] ? new Date(record["Дата регистрации"] + "Z") : null, executorId: executor.id },
                    });
                }
            } catch (err) { console.error(`Failed to process registration:`, err.message); }
        }
        console.log(`  Processed ${offset + sourceData.length} registrations...`);
        offset += batchSize;
    }
}

async function migrateRegistrations4(table) {
    const batchSize = 1000;
    let offset = 0;
    console.log(`Migrating form-4 registrations from [${table}]...`);

    const [unknownWorkplace, unknownInitiator, unknownExecutor, unknownForm] = await Promise.all([
        prisma.workPlace.findFirst({ where: { name: "Неизвестно" } }),
        prisma.initiator.findFirst({ where: { notes: "Неизвестно" } }),
        prisma.admin.findFirst({ where: { photo: "Неизвестно" } }),
        prisma.form.findFirst({ where: { name: "Неизвестно" } }),
    ]);

    let hasMoreData = true;
    while (hasMoreData) {
        const sourceQuery = `SELECT * FROM "${table}" LIMIT ${batchSize} OFFSET ${offset}`;
        const sourceData = (await sourcePool.query(sourceQuery)).rows;
        if (sourceData.length === 0) { hasMoreData = false; break; }

        for (const record of sourceData) {
            try {
                const [executor, formId, initiator] = await Promise.all([
                    findOrCreateExecutor(record["Исполнитель"] || false, unknownExecutor),
                    findOrCreateForm4(),
                    findOrCreateInitiator(record["О/р"] || false, unknownInitiator),
                ]);
                const notes = (record["Примечания(доп)"] === "-" || record["Примечания(доп)"] === null ? "" : record["Примечания(доп)"]);
                let completeStatus = completeStatusReg4(record["Дата регистрации"], record["Дата окончания"], record);
                let expiredDate = expiredDateForm(record["Дата регистрации"], record["Дата окончания"]);
                let expired = expiredDateFunc(record["Дата регистрации"], record["Дата окончания"], formId?.length);
                let accessStatus = getAccessStatus4(record["Допуск"], record);
                if (completeStatus === "WAITING") { accessStatus = "ПРОВЕРКА"; expired = null; }
                if (completeStatus === "COMPLETED") { expiredDate = null; }
                if (!(accessStatus == "ДОПУСК" || accessStatus == "IN_PROGRESS" || accessStatus == "ПРОВЕРКА" || accessStatus?.toLowerCase().includes('снят'))) { expired = null; }

                await prisma.registration.create({
                    data: mapRecordToRegistration4Data(record, initiator?.id || null, executor?.id || null, formId?.name || null, notes, completeStatus, expiredDate, expired, accessStatus, formLog(formId?.name, record)),
                });
            } catch (err) { console.error(`Failed to process form-4 registration:`, err.message); }
        }
        console.log(`  Processed ${offset + sourceData.length} form-4 registrations...`);
        offset += batchSize;
    }
}

async function migrateRelatives() {
    const batchSize = 1000;
    let offset = 0;
    console.log("Migrating relatives...");

    const unknownRelationDegree = await prisma.relationDegree.create({ data: { name: "Сам" } }).catch(() => prisma.relationDegree.findFirst({ where: { name: "Сам" } }));
    const unknownWorkplace = await prisma.workPlace.findFirst({ where: { name: "Неизвестно" } });
    const unknownInitiator = await prisma.initiator.findFirst({ where: { notes: "Неизвестно" } });
    const unknownExecutor = await prisma.admin.findFirst({ where: { photo: "Неизвестно" } });

    let hasMoreData = true;
    while (hasMoreData) {
        const result = (await sourcePool.query(`SELECT * FROM "Родственники" LIMIT ${batchSize} OFFSET ${offset}`)).rows;
        if (result.length === 0) { hasMoreData = false; break; }

        for (const record of result) {
            try {
                const initiator = record["О/р"] ? await findOrCreateInitiator(record["О/р"], unknownInitiator) : unknownInitiator;
                const registration = await prisma.registration.findFirst({ where: { regNumber: record["Регистрационный номер и гриф секр"] } }) || await prisma.registration.findFirst({ where: { fullName: "Неизвестно", firstName: "Неизвестно", lastName: "Неизвестно" } });
                const relationDegree = record["Степень родства"] ? await findOrCreateRelationDegree(record["Степень родства"], unknownRelationDegree) : unknownRelationDegree;
                const executor = record["Исполнитель"] ? await findOrCreateExecutor(record["Исполнитель"]) : unknownExecutor;
                await findOrCreateWorkplace(record["Место работы и должность"], unknownWorkplace);

                await prisma.relatives.create({
                    data: {
                        regNumber: record["Регистрационный номер и гриф секр"],
                        relationDegree: relationDegree.name,
                        registrationId: registration?.id || null,
                        fullName: record["Фамилия,имя,отчество"]?.trim(),
                        firstName: record["Фамилия,имя,отчество"]?.split(" ")[1]?.trim(),
                        lastName: record["Фамилия,имя,отчество"]?.split(" ")[0]?.trim(),
                        fatherName: record["Фамилия,имя,отчество"]?.split(" ").slice(2).join(" ").trim(),
                        birthYear: record["Год рождения"] ? parseInt(record["Год рождения"], 10) : null,
                        birthPlace: record["Место рождения"] == "-" ? null : record["Место рождения"],
                        residence: record["Место жительства"] == "-" ? null : record["Место жительства"],
                        workplace: record["Место работы и должность"] == "-" ? null : record["Место работы и должность"]?.split(",")[0]?.trim(),
                        position: record["Место работы и должность"] == "-" ? null : record["Место работы и должность"]?.split(",")[1]?.trim(),
                        notes: record["Примечание"] == "-" ? "" : record["Примечание"],
                        additionalNotes: record["Примечание(доп)"] == null ? "" : record["Примечание(доп)"],
                        or_tab: initiator.id,
                        executorId: executor.id,
                        whoAdd: executor.id,
                        accessStatus: record["Статус доступа"],
                    },
                });
            } catch (err) { console.error(`Failed to insert relative:`, err.message); }
        }
        console.log(`  Processed ${offset + result.length} relatives...`);
        offset += batchSize;
    }
}

async function migrateRelativesWithoutAnalysis() {
    const batchSize = 1000;
    let offset = 0;
    console.log("Migrating relatives without analysis...");

    const unknownRelationDegree = await getOrCreateUnknownRelationDegree();
    const unknownWorkplace = await getOrCreateUnknownWorkplace();
    const unknownInitiator = await getOrCreateUnknownInitiator();

    let hasMoreData = true;
    while (hasMoreData) {
        const result = (await sourcePool.query(`SELECT * FROM "Родственники без СП" LIMIT ${batchSize} OFFSET ${offset}`)).rows;
        if (result.length === 0) { hasMoreData = false; break; }

        for (const record of result) {
            try {
                const initiator = record["О/р"] ? await findOrCreateInitiator(record["О/р"], unknownInitiator) : unknownInitiator;
                const registration = await prisma.registration.findFirst({ where: { regNumber: record["Регистрационный номер и гриф секр"] } }) || await prisma.registration.findFirst({ where: { fullName: "Неизвестно", firstName: "Неизвестно", lastName: "Неизвестно" } });
                const relationDegree = record["Степень родства"] ? await findOrCreateRelationDegree(record["Степень родства"], unknownRelationDegree) : unknownRelationDegree;
                await findOrCreateWorkplace(record["Место работы и должность"], unknownWorkplace);

                await prisma.relatives.create({ data: mapRecordToRelativeData(record, relationDegree.name, registration.id, initiator.id) });
            } catch (err) { console.error(`Failed to insert relative without analysis:`, err.message); }
        }
        console.log(`  Processed ${offset + result.length} relatives without analysis...`);
        offset += batchSize;
    }
}

async function migrateTempToProduction() {
    console.log("\n[Phase 2] Migrating Temporary PostgreSQL to Production...\n");

    // Connect to temporary database
    const TEMP_PG_CONFIG = getTempPgConfig();
    sourcePool = new Pool(TEMP_PG_CONFIG);

    await clearProductionDB();
    await createDefaultAdminsAndServices();

    await migrateRegistrations("УЧЕТНЫЕ КАРТОЧКИ 123");
    await migrateRelatives();
    await migrateRelativesWithoutAnalysis();
    await migrateRegistrations4("УЧЕТНЫЕ КАРТОЧКИ 4");

    await sourcePool.end();
    console.log("\nPhase 2 Complete: Data migrated to Production PostgreSQL\n");
}

// ============================================================
// Main Migration Function (called by API)
// ============================================================

async function runMigration(accessFilePath) {
    console.log("============================================");
    console.log("  Full Access to PostgreSQL Migration");
    console.log("============================================\n");
    console.log(`Access DB : ${accessFilePath}`);
    console.log(`Temp DB   : access_migration`);
    console.log(`Prod DB   : ${process.env.DATABASE_URL}`);
    console.log(`Batch Size: ${BATCH_SIZE}\n`);

    try {
        // Phase 1: Access -> Temporary PostgreSQL
        await migrateAccessToTempDb(accessFilePath);

        // Phase 2: Temporary PostgreSQL -> Production PostgreSQL
        await migrateTempToProduction();

        console.log("============================================");
        console.log("  Migration Complete!");
        console.log("============================================");

        return { success: true, message: "Migration completed successfully" };
    } catch (err) {
        console.error("FATAL ERROR:", err.message);
        return { success: false, message: err.message };
    } finally {
        await prisma.$disconnect();
    }
}

module.exports = {
    runMigration
};
