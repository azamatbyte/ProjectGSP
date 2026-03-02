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
const { getEnv } = require("../../config/env");

const prisma = new PrismaClient();
const isWindows = process.platform === 'win32';
const env = getEnv();

// ============================================================
// Configuration
// ============================================================
const OLEDB_PROVIDER = env.OLEDB_PROVIDER;

// PowerShell helper scripts (Windows only)
const SCHEMA_SCRIPT = path.join(__dirname, "../../scripts/_ps_schema.ps1");
const STREAM_SCRIPT = path.join(__dirname, "../../scripts/_ps_stream.ps1");

// MDB type name to ADO type mapping (for mdb-tools on Linux)
const MDB_TO_ADO = {
    'Long Integer': 3, 'Integer': 2, 'Byte': 17,
    'Single': 4, 'Double': 5, 'Currency': 6,
    'DateTime': 7, 'Boolean': 11, 'Numeric': 131,
    'Text': 202, 'Memo/Hyperlink': 201, 'Memo': 201,
    'OLE Object': 205, 'Replication ID': 72,
};

// Temp database config (same PostgreSQL server, different database)
const getTempPgConfig = () => {
    const mainUrl = env.DATABASE_URL;
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

function normalizeOptionalText(value) {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim();
    if (!normalized || normalized === '-') return null;
    return normalized;
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
    if (regEndDate == null) return 'WAITING';
    if (regEndDate != null && regEndDate >= regDate) return 'COMPLETED';
    return 'COMPLETED';
}

function completeStatusReg4(regDate, regEndDate, record) {
    if (regDate == '2020-01-01') return 'COMPLETED';
    if (record['Заключение']?.includes(record['Рег №'])) return 'COMPLETED';
    if (regEndDate == null) return 'WAITING';
    if (regEndDate != null && regEndDate >= regDate) return 'COMPLETED';
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
        notes: normalizeOptionalText(record['Примечания']),
        additionalNotes: normalizeOptionalText(notes?.additionalNotes),
        externalNotes: normalizeOptionalText(notes?.externalNotes),
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
        notes: normalizeOptionalText(record['Компроматериалы']),
        additionalNotes: normalizeOptionalText(notes?.additionalNotes),
        externalNotes: normalizeOptionalText(notes?.externalNotes),
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

function mapRecordToRelativeData(record, relationDegree, relationId, initiatorId, model = "relativeWithoutAnalysis", status_analysis = true) {
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
        notes: normalizeOptionalText(record["Примечание"] ?? record["Примечания"]),
        additionalNotes: normalizeOptionalText(record["Примечание(доп)"] ?? record["Примечания(доп)"]),
        accessStatus: normalizeOptionalText(record["Статус доступа"]),
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

// ============================================================
// Platform-specific: mdb-tools (Linux/macOS)
// ============================================================

function runCommand(cmd, args) {
    return new Promise((resolve, reject) => {
        const proc = spawn(cmd, args);
        let stdout = "";
        let stderr = "";
        proc.stdout.setEncoding("utf8");
        proc.stderr.setEncoding("utf8");
        proc.stdout.on("data", (d) => (stdout += d));
        proc.stderr.on("data", (d) => (stderr += d));
        proc.on("close", (code) => {
            if (code !== 0) reject(new Error(`${cmd} exit ${code}: ${stderr}`));
            else resolve(stdout);
        });
        proc.on("error", reject);
    });
}

function parseMdbSchemaOutput(schemaStr) {
    const columns = [];
    for (const line of schemaStr.split("\n")) {
        const match = line.match(/\[([^\]]+)\]\s+([A-Za-z/][\w\s/]*?)(?:\s+\((\d+)\))?\s*[,)]\s*$/);
        if (!match) continue;
        const name = match[1];
        const mdbType = match[2].trim();
        const maxLen = match[3] ? parseInt(match[3], 10) : 0;
        const adoType = MDB_TO_ADO[mdbType] || 202;
        columns.push({ name, adoType, maxLen, pgType: getPgType(adoType, maxLen) });
    }
    return columns;
}

async function getMdbSchema(accessPath) {
    const tablesOutput = await runCommand("mdb-tables", ["-1", accessPath]);
    const tableNames = tablesOutput.split("\n")
        .map((t) => t.trim())
        .filter((t) => t && !t.startsWith("MSys") && !t.startsWith("~"));

    const tables = [];
    for (const name of tableNames) {
        const countOutput = await runCommand("mdb-count", [accessPath, name]);
        const rows = parseInt(countOutput.trim(), 10) || 0;
        const schemaOutput = await runCommand("mdb-schema", [accessPath, "-T", name]);
        const columns = parseMdbSchemaOutput(schemaOutput);
        tables.push({ name, rows, columns, primaryKeys: [] });
    }
    return tables;
}

function parseCsvLine(line) {
    const values = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                values.push(current);
                current = "";
            } else {
                current += ch;
            }
        }
    }
    values.push(current);
    return { values, complete: !inQuotes };
}

function csvValueToTyped(rawVal, adoType) {
    if (rawVal === "") return null;
    switch (adoType) {
        case 11: return rawVal === "1" || rawVal.toLowerCase() === "true";
        case 2: case 3: case 17: { const v = parseInt(rawVal, 10); return isNaN(v) ? null : v; }
        case 4: case 5: case 6: case 131: { const v = parseFloat(rawVal); return isNaN(v) ? null : v; }
        case 128: case 204: case 205: return null;
        default: return rawVal;
    }
}

async function streamAndInsertFromMdbTools(pg, table, accessPath) {
    const proc = spawn("mdb-export", ["-D", "%Y-%m-%dT%H:%M:%S", "-b", "strip", accessPath, table.name]);
    proc.stdout.setEncoding("utf8");
    proc.stderr.setEncoding("utf8");

    const rl = createInterface({ input: proc.stdout });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d));

    const closePromise = new Promise((resolve, reject) => {
        proc.on("close", resolve);
        proc.on("error", reject);
    });

    let headers = null;
    let inserted = 0;
    let lineNum = 0;
    let pendingLine = null;

    try {
        for await (const line of rl) {
            let result;
            if (pendingLine !== null) {
                pendingLine += "\n" + line;
                result = parseCsvLine(pendingLine);
                if (!result.complete) continue;
                pendingLine = null;
            } else {
                lineNum++;
                if (lineNum === 1) {
                    headers = parseCsvLine(line).values;
                    continue;
                }
                result = parseCsvLine(line);
                if (!result.complete) {
                    pendingLine = line;
                    continue;
                }
            }

            const record = {};
            for (let i = 0; i < headers.length && i < result.values.length; i++) {
                const col = table.columns.find((c) => c.name === headers[i]);
                record[headers[i]] = csvValueToTyped(result.values[i], col ? col.adoType : 202);
            }
            await insertOneRow(pg, table.name, table.columns, record);
            inserted++;
            printProgress(inserted, table.rows);
        }

        const code = await closePromise;
        if (code !== 0 && inserted === 0) {
            throw new Error(`mdb-export exit ${code}: ${stderr}`);
        }
        console.log("");
        return inserted;
    } catch (err) {
        proc.kill();
        throw err;
    } finally {
        rl.close();
    }
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

function normalizeColumnValue(col, val) {
    if (val === null || val === undefined) {
        return null;
    }
    if (col.adoType === 11) {
        return val === true || val === -1 || val === 1;
    }
    if (col.adoType === 128 || col.adoType === 204 || col.adoType === 205) {
        return typeof val === "string" ? Buffer.from(val, "base64") : val;
    }
    return val;
}

async function insertOneRow(pg, tableName, columns, row) {
    const pgTableName = pgId(tableName);
    const pgColNames = columns.map((c) => pgId(c.name)).join(", ");
    const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(", ");
    const params = columns.map((col) => normalizeColumnValue(col, row[col.name]));
    const sql = `INSERT INTO ${pgTableName} (${pgColNames}) VALUES (${placeholders})`;
    await pg.query(sql, params);
}

async function streamAndInsertFromPowerShell(pg, table, connStr) {
    const ps = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", STREAM_SCRIPT, "-ConnStr", connStr, "-TableName", table.name], { stdio: ["ignore", "pipe", "pipe"] });
    ps.stdout.setEncoding("utf8");
    ps.stderr.setEncoding("utf8");

    const rl = createInterface({ input: ps.stdout });
    let stderr = "";
    ps.stderr.on("data", (d) => (stderr += d));

    const closePromise = new Promise((resolve, reject) => {
        ps.on("close", resolve);
        ps.on("error", reject);
    });

    let inserted = 0;
    try {
        for await (const line of rl) {
            if (line.startsWith("DONE:")) continue;
            if (line.startsWith("STREAM_ERROR:")) {
                throw new Error(line.substring(13));
            }
            if (!line.startsWith("{")) continue;

            let record;
            try {
                record = JSON.parse(line);
            } catch {
                continue;
            }

            await insertOneRow(pg, table.name, table.columns, record);
            inserted++;
            printProgress(inserted, table.rows);
        }

        const code = await closePromise;
        if (code !== 0 && inserted === 0) {
            throw new Error(`Stream exit ${code}: ${stderr}`);
        }
        console.log("");
        return inserted;
    } catch (err) {
        ps.kill();
        throw err;
    } finally {
        rl.close();
    }
}

async function migrateAccessToTempDb(accessPath) {
    console.log("\n[Phase 1] Migrating Access to Temporary PostgreSQL...\n");

    if (!fs.existsSync(accessPath)) {
        throw new Error(`Access file not found: ${accessPath}`);
    }

    let tables;
    if (isWindows) {
        const CONN_STR = `Provider=${OLEDB_PROVIDER};Data Source=${accessPath};`;
        if (!fs.existsSync(SCHEMA_SCRIPT) || !fs.existsSync(STREAM_SCRIPT)) {
            throw new Error("PowerShell helper scripts not found (_ps_schema.ps1, _ps_stream.ps1)");
        }
        console.log("[1/4] Discovering Access schema (PowerShell + OleDb)...");
        const schemaOutput = await runPowerShell(SCHEMA_SCRIPT, ["-ConnStr", CONN_STR]);
        tables = parseSchema(schemaOutput);
    } else {
        console.log("[1/4] Discovering Access schema (mdb-tools)...");
        tables = await getMdbSchema(accessPath);
    }

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
            if (isWindows) {
                const CONN_STR = `Provider=${OLEDB_PROVIDER};Data Source=${accessPath};`;
                await streamAndInsertFromPowerShell(pg, table, CONN_STR);
            } else {
                await streamAndInsertFromMdbTools(pg, table, accessPath);
            }
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
        const service = await prisma.service.create({
            data: {
                name: "Руководители",
                description: "Руководители для операторов.",
                code: 1,
            },
        });
        await prisma.service.create({
            data: {
                name: "Места работы",
                description: "Места работы для операторов.",
                code: 2,
            },
        });
        await prisma.service.create({
            data: {
                name: "Статистика",
                description: "Статистика для операторов.",
                code: 3,
            },
        });
        await prisma.service.create({
            data: {
                name: "Удаление",
                description: "Удаление Ф-4 для операторов.",
                code: 4,
            },
        });
        const superAdmin = await prisma.admin.create({
            data: {
                first_name: "Super",
                last_name: "Admin",
                username: "superadmin",
                status: "active",
                password:
                    "$2a$10$VlxkGYp1/vjOX4TGkppFPeBwUcByuCNp5GhMOPGWC116Vr9sN/9oO", // Replace with actual hashed password
                salt: "$2a$10$Q4b2cf/QMoJMr.NFxnyBZu",
                role: "superAdmin", // Assign multiple roles
            },
        });
        const admin = await prisma.admin.create({
            data: {
                first_name: "Admin",
                last_name: "Super",
                username: "admin01",
                status: "active",
                password:
                    "$2a$10$VlxkGYp1/vjOX4TGkppFPeBwUcByuCNp5GhMOPGWC116Vr9sN/9oO", // Replace with actual hashed password
                salt: "$2a$10$Q4b2cf/QMoJMr.NFxnyBZu",
                role: "superAdmin", // Assign multiple roles
            },
        });
        const adminSimple = await prisma.admin.create({
            data: {
                first_name: "Admin",
                last_name: "Admin",
                username: "admin02",
                status: "active",
                password:
                    "$2a$10$VlxkGYp1/vjOX4TGkppFPeBwUcByuCNp5GhMOPGWC116Vr9sN/9oO", // Replace with actual hashed password
                salt: "$2a$10$Q4b2cf/QMoJMr.NFxnyBZu",
                role: "admin", // Assign multiple roles
            },
        });
        await prisma.adminServiceAccess.create({
            data: {
                adminId: admin.id,
                serviceId: service.id,
                grantedBy: superAdmin.id, // ID of the super admin granting the access
            },
        });
        await prisma.form.create({
            data: { name: "Р", description: "Р", length: 2, month: 1, status: true, type: "registration" },
        });
        await prisma.form.create({
            data: { name: "О", description: "О", length: 4, month: 1, status: true, type: "registration" },
        });
        await prisma.form.create({
            data: { name: "У", description: "У", length: 1, month: 1, status: true, type: "registration4" },
        });
        await prisma.form.create({
            data: { name: "1", description: "1", length: 2, month: 1, type: "registration" },
        });
        await prisma.form.create({
            data: { name: "2", description: "2", length: 4, month: 1, type: "registration" },
        });
        await prisma.form.create({
            data: { name: "3", description: "3", length: 4, month: 1, type: "registration" },
        });
        await prisma.form.create({
            data: { name: "4", description: "4", length: 2, month: 1, type: "registration4" },
        });
        await prisma.accessStatus.create({
            data: { name: "СП ПРОВЕРКА", adminId: admin.id, status: true },
        });
        await prisma.accessStatus.create({
            data: { name: "ОТКАЗ", adminId: admin.id, status: true },
        });
        await prisma.accessStatus.create({
            data: { name: "ОТКАЗ-1", adminId: admin.id, status: true },
        });
        await prisma.accessStatus.create({
            data: {
                name: "ДОПУСК АННУЛИРОВАН",
                adminId: admin.id,
                status: true,
            },
        });
        await prisma.accessStatus.create({
            data: { name: "ДОПУСК", adminId: admin.id, status: true },
        });
        await prisma.accessStatus.create({
            data: { name: "ПРОВЕРКА", adminId: admin.id, status: true },
        });
        await prisma.accessStatus.create({
            data: { name: "ЗАКЛЮЧЕНИЕ", adminId: admin.id, status: true },
        });
        await prisma.accessStatus.create({
            data: { name: "ПОВТОРНЫЙ ОТКАЗ", adminId: admin.id, status: true },
        });
        await prisma.accessStatus.create({
            data: { name: "СНЯТ ОТКАЗ", adminId: admin.id, status: true },
        });
        await prisma.raportTypes.create({
            data: {
                name: "МВД",
                code: "osu_mvd",
                code_ru: "osu_mvd",
                code_uz: "osu_mvd",
                organization: "МВД Республики Узбекистан",
                requested_organization: "ГСБП Республики Узбекистан",
                signed_fio: "И.И.Иванов",
                signed_position: "Генеральный директор",
                link: "type1",
                notes: "Р",
                executorId: admin.id,

            },
        });
        await prisma.raportTypes.create({
            data: {
                name: "ОСУ",
                code: "osu_sgb",
                code_ru: "osu_sgb",
                code_uz: "osu_sgb",
                organization: "СГБ Республики Узбекистан",
                requested_organization: "ГСБП Республики Узбекистан",
                signed_fio: "И.И.Иванов",
                signed_position: "Генеральный директор",
                link: "type2",
                notes: "no name, no request_organization",
                executorId: admin.id,

            },
        });
        await prisma.raportTypes.create({
            data: {
                name: "ГСБП",
                code: "osu_sgb",
                code_ru: "osu_sgb",
                code_uz: "osu_sgb",
                organization: "ГСБП Республики Узбекистан",
                requested_organization: "ГСБП Республики Узбекистан",
                signed_fio: "И.И.Иванов",
                signed_position: "Генеральный директор",
                link: "type2",
                notes: "no name, no request_organization",
                executorId: admin.id,

            },
        });
        await prisma.raportTypes.create({
            data: {
                name: "АВР",
                code: "avr",
                code_ru: "avr",
                code_uz: "avr",
                organization: "СГБ Республики Узбекистан",
                requested_organization: "ГСБП Республики Узбекистан",
                signed_fio: "И.И.Иванов",
                signed_position: "Генеральный директор",
                link: "Р",
                notes: "проверка по учетам",
                executorId: admin.id,
            },
        });
        await prisma.raportTypes.create({
            data: {
                name: "УПК ПВ",
                code: "upk",
                code_ru: "upk",
                code_uz: "upk",
                organization: "УПК ПВ",
                requested_organization: "ГСБП Республики Узбекистан",
                signed_fio: "И.И.Иванов",
                signed_position: "Генеральный директор",
                link: "Р",
                notes: "проверка по учетам",
                executorId: admin.id,
            },
        });
        await prisma.raportTypes.create({
            data: {
                name: "ЗАПРОС ГСБП",
                code: "type8",
                code_ru: "mlm",
                code_uz: "mlm",
                organization: "Ўзбекистон Республикаси ПДХХ",
                requested_organization: "ГСБП Республики Узбекистан",
                signed_fio: "И.И.Иванов",
                signed_position: "Генеральный директор",
                link: "Р",
                notes: "bad",
                executorId: admin.id,
            },
        });
        await prisma.raportTypes.create({
            data: {
                name: "ЗАПРОС СГБ",
                code: "type9",
                code_ru: "mlm",
                code_uz: "mlm",
                organization: "ГСБП Республики Узбекистан",
                requested_organization: "ГСБП Республики Узбекистан",
                signed_fio: "И.И.Иванов",
                signed_position: "Генеральный директор",
                link: "Р",
                notes: "good",
                executorId: admin.id,
            },
        });
        await prisma.raportTypes.create({
            data: {
                name: "НД",
                code: "nd",
                code_ru: "nd",
                code_uz: "nd",
                organization: "Директору Ташкентского городского филиала РСНПМЦН",
                requested_organization:
                    "ГОСУДАРСТВЕННАЯ СЛУЖБА БЕЗОПАСНОСТИ ПРИ ПРЕЗИДЕНТЕ РЕСПУБЛИКИ УЗБЕКИСТАН",
                link: "type3",
                signed_fio: "И.И.Иванов",
                signed_position: "Генеральный директор",
                notes: "В связи с возникшей необходимостью просим проверить по имеющимся учетам следующих лиц;должн подразделения",

                executorId: admin.id,
            },
        });
        await prisma.raportTypes.create({
            data: {
                name: "ПНД1",
                code: "nd1",
                code_ru: "nd1",
                code_uz: "nd1",
                organization:
                    "ГЛАВНОМУ ВРАЧУ ГОРОДСКОГО ПСИХОНЕВРОЛОГИЧЕСКОГО  ДИСПАНСЕРА №1 (ул.Мукими, 94)",
                requested_organization:
                    "ГОСУДАРСТВЕННАЯ СЛУЖБА БЕЗОПАСНОСТИ ПРИ ПРЕЗИДЕНТЕ РЕСПУБЛИКИ УЗБЕКИСТАН",
                signed_fio: "И.И.Иванов",
                signed_position: "Генеральный директор",
                link: "type3",
                notes:

                    "В связи с возникшей необходимостью просим проверить по имеющимся учетам:;Начальник подразделения",
                executorId: admin.id,
            },
        });
        await prisma.registration.create({
            data: {
                fullName: "Неизвестно",
                firstName: "Неизвестно",
                lastName: "Неизвестно",
                fatherName: "Неизвестно",
                regNumber: "Неизвестно",
                regDate: "2025-01-01T00:00:00.000Z",
                notes: "Неизвестно",
                executorId: admin.id,
            },
        });
        await prisma.registration.create({
            data: {
                fullName: "Неизвестно1",
                form_reg: "Р",
                firstName: "Неизвестно1",
                lastName: "Неизвестно1",
                fatherName: "Неизвестно1",
                regNumber: "Неизвестно1",
                regDate: "2024-01-01T00:00:00.000Z",
                notes: "Неизвестно1",
                executorId: adminSimple.id,
            },
        });
        await prisma.raportTypes.create({
            data: {
                name: "ПНД2",
                code: "nd2",
                code_ru: "nd2",
                code_uz: "nd2",
                organization:
                    "ГЛАВНОМУ ВРАЧУ ГОРОДСКОГО ПСИХОНЕВРОЛОГИЧЕСКОГО  ДИСПАНСЕРА №2 (ул. Лисунова, 25)",
                requested_organization:
                    "ГОСУДАРСТВЕННАЯ СЛУЖБА БЕЗОПАСНОСТИ ПРИ ПРЕЗИДЕНТЕ РЕСПУБЛИКИ УЗБЕКИСТАН",
                signed_fio: "И.И.Иванов",
                signed_position: "Генеральный директор",
                link: "type3",
                notes:

                    "В связи с возникшей необходимостью просим проверить по имеющимся учетам;Начальник подразделения",
                executorId: admin.id,
            },
        });
        return { id: admin.id, adminId: admin.id };
    } catch (err) {
        console.error(`Failed to insert record with data:`, err);
    } finally {
        await prisma.$disconnect();
    }
}

async function migrateRegistrations(table) {
    console.log(`Migrating registrations from [${table}]...`);

    const [unknownWorkplace, unknownInitiator, unknownExecutor, unknownForm] = await Promise.all([
        prisma.workPlace.create({ data: { name: "Неизвестно" } }).catch(() => prisma.workPlace.findFirst({ where: { name: "Неизвестно" } })),
        prisma.initiator.create({ data: { first_name: "Неизвестно", last_name: "Неизвестно", notes: "Неизвестно" } }).catch(() => prisma.initiator.findFirst({ where: { notes: "Неизвестно" } })),
        prisma.admin.create({ data: { first_name: "Неизвестно", last_name: "Неизвестно", username: "unknownadmin", role: "admin", status: "active", photo: "Неизвестно" } }).catch(() => prisma.admin.findFirst({ where: { photo: "Неизвестно" } })),
        prisma.form.create({ data: { name: "Неизвестно" } }).catch(() => prisma.form.findFirst({ where: { name: "Неизвестно" } })),
    ]);

    const sourceQuery = `SELECT * FROM "${table}"`;
    const sourceData = (await sourcePool.query(sourceQuery)).rows;
    let processed = 0;

    for (const record of sourceData) {
        try {
            const [executor, formId, initiator] = await Promise.all([
                findOrCreateExecutor(record["Исполнитель"] || false, unknownExecutor),
                findOrCreateForm(record["Форма допуска"] || unknownForm, unknownForm),
                findOrCreateInitiator(record["О/р"] || false, unknownInitiator),
            ]);
            await findOrCreateWorkplace(record["Место работы и должность"] || unknownWorkplace, unknownWorkplace);
            const notes = {
                additionalNotes: normalizeOptionalText(record["Примечания(доп)"]),
                externalNotes: normalizeOptionalText(record["Примечания 1 (доп)"]),
            };
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
        processed++;
        if (processed % 1000 === 0 || processed === sourceData.length) {
            console.log(`  Processed ${processed} registrations...`);
        }
    }
}

async function migrateRegistrations4(table) {
    console.log(`Migrating form-4 registrations from [${table}]...`);

    const [unknownWorkplace, unknownInitiator, unknownExecutor, unknownForm] = await Promise.all([
        prisma.workPlace.findFirst({ where: { name: "Неизвестно" } }),
        prisma.initiator.findFirst({ where: { notes: "Неизвестно" } }),
        prisma.admin.findFirst({ where: { photo: "Неизвестно" } }),
        prisma.form.findFirst({ where: { name: "Неизвестно" } }),
    ]);

    const sourceQuery = `SELECT * FROM "${table}"`;
    const sourceData = (await sourcePool.query(sourceQuery)).rows;
    let processed = 0;

    for (const record of sourceData) {
        try {
            const [executor, formId, initiator] = await Promise.all([
                findOrCreateExecutor(record["Исполнитель"] || false, unknownExecutor),
                findOrCreateForm4(),
                findOrCreateInitiator(record["О/р"] || false, unknownInitiator),
            ]);
            const notes = {
                additionalNotes: normalizeOptionalText(record["Компроматериалы1"]) || normalizeOptionalText(record["Примечания(доп)"]),
                externalNotes: normalizeOptionalText(record["Отк 1"]),
            };
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
        processed++;
        if (processed % 1000 === 0 || processed === sourceData.length) {
            console.log(`  Processed ${processed} form-4 registrations...`);
        }
    }
}

async function migrateRelatives() {
    console.log("Migrating relatives...");

    const unknownRelationDegree = await prisma.relationDegree.create({ data: { name: "Сам" } }).catch(() => prisma.relationDegree.findFirst({ where: { name: "Сам" } }));
    const unknownWorkplace = await prisma.workPlace.findFirst({ where: { name: "Неизвестно" } });
    const unknownInitiator = await prisma.initiator.findFirst({ where: { notes: "Неизвестно" } });
    const unknownExecutor = await prisma.admin.findFirst({ where: { photo: "Неизвестно" } });

    const result = (await sourcePool.query(`SELECT * FROM "Родственники"`)).rows;
    let processed = 0;

    for (const record of result) {
        try {
            const initiator = record["О/р"] ? await findOrCreateInitiator(record["О/р"], unknownInitiator) : unknownInitiator;
            const registration = await prisma.registration.findFirst({ where: { regNumber: record["Регистрационный номер и гриф секр"] } }) || await prisma.registration.findFirst({ where: { fullName: "Неизвестно", firstName: "Неизвестно", lastName: "Неизвестно" } });
            const relationDegree = record["Степень родства"] ? await findOrCreateRelationDegree(record["Степень родства"], unknownRelationDegree) : unknownRelationDegree;
            const executor = record["Исполнитель"] ? await findOrCreateExecutor(record["Исполнитель"]) : unknownExecutor;
            // await findOrCreateWorkplace(record["Место работы и должность"], unknownWorkplace);

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
        processed++;
        if (processed % 1000 === 0 || processed === result.length) {
            console.log(`  Processed ${processed} relatives...`);
        }
    }
}

async function migrateRelativesWithoutAnalysis() {
    console.log("Migrating relatives without analysis...");

    const unknownRelationDegree = await getOrCreateUnknownRelationDegree();
    const unknownWorkplace = await getOrCreateUnknownWorkplace();
    const unknownInitiator = await getOrCreateUnknownInitiator();

    const result = (await sourcePool.query(`SELECT * FROM "Родственники без СП"`)).rows;
    let processed = 0;

    for (const record of result) {
        try {
            const initiator = record["О/р"] ? await findOrCreateInitiator(record["О/р"], unknownInitiator) : unknownInitiator;
            const registration = await prisma.registration.findFirst({ where: { regNumber: record["Регистрационный номер и гриф секр"] } }) || await prisma.registration.findFirst({ where: { fullName: "Неизвестно", firstName: "Неизвестно", lastName: "Неизвестно" } });
            const relationDegree = record["Степень родства"] ? await findOrCreateRelationDegree(record["Степень родства"], unknownRelationDegree) : unknownRelationDegree;
            // await findOrCreateWorkplace(record["Место работы и должность"], unknownWorkplace);

            await prisma.relatives.create({ data: mapRecordToRelativeData(record, relationDegree.name, registration?.id || null, initiator.id) });
        } catch (err) { console.error(`Failed to insert relative without analysis:`, err.message); }
        processed++;
        if (processed % 1000 === 0 || processed === result.length) {
            console.log(`  Processed ${processed} relatives without analysis...`);
        }
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
    console.log(`Prod DB   : ${env.DATABASE_URL}`);
    console.log("Phase 1   : immediate row inserts (no batching)");
    console.log("Phase 2   : full-table reads (no LIMIT/OFFSET)\n");

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
