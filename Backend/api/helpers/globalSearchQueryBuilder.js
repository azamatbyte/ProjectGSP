/**
 * Helper module for building global search SQL queries
 * Replaces the PostgreSQL functions search_recordsv25 and search_records_countv12
 */

/**
 * Sanitizes a string value for use in SQL queries
 * @param {string} value - The value to sanitize
 * @returns {string} - Sanitized value
 */
function sanitizeValue(value) {
    if (value === null || value === undefined) return null;
    return String(value).replace(/'/g, "''");
}

/**
 * Processes a search term by trimming, removing %, and replacing * with %
 * @param {string} term - The search term
 * @returns {string} - Processed term
 */
function processSearchTerm(term) {
    if (!term) return null;
    return term.trim().replace(/%/g, "").replace(/\*/g, "%");
}

/**
 * Builds a text filter condition for the WHERE clause
 * @param {string} column - The column name (with table alias)
 * @param {string} value - The search value
 * @param {boolean} excludeStatus - If true, exclude matches; if false, include matches
 * @param {boolean} exactMatch - If true, use exact match (=); if false, use ILIKE
 * @returns {string} - The SQL condition
 */
function buildTextFilter(column, value, excludeStatus = false, exactMatch = false) {
    if (!value) return null;

    const sanitized = sanitizeValue(processSearchTerm(value));
    if (!sanitized) return null;

    if (exactMatch) {
        if (excludeStatus) {
            return `NOT (lower(${column}) = lower('${sanitized}'))`;
        }
        return `lower(${column}) = lower('${sanitized}')`;
    }

    if (excludeStatus) {
        return `NOT (${column} ILIKE '%${sanitized}%')`;
    }
    return `${column} ILIKE '%${sanitized}%'`;
}

/**
 * Builds a normalized text filter for person-name fields.
 * Compares using lower(trim(...)) so case and edge spaces are ignored,
 * while internal spaces stay significant.
 * @param {string} column - The column name (with table alias)
 * @param {string} value - The search value
 * @param {boolean} excludeStatus - If true, exclude matches; if false, include matches
 * @param {boolean} exactMatch - If true, use exact match (=); if false, use LIKE
 * @returns {string|null} - The SQL condition
 */
function buildTrimmedNameFilter(column, value, excludeStatus = false, exactMatch = false) {
    if (!value) return null;

    const sanitized = sanitizeValue(processSearchTerm(value));
    if (!sanitized) return null;

    const normalizedColumn = `lower(trim(coalesce(${column}, '')))`;
    const normalizedValue = `lower(trim('${sanitized}'))`;
    const condition = exactMatch
        ? `${normalizedColumn} = ${normalizedValue}`
        : `${normalizedColumn} LIKE '%' || ${normalizedValue} || '%'`;

    if (excludeStatus) {
        return `NOT (${condition})`;
    }
    return condition;
}

/**
 * Builds a date range filter condition
 * @param {string} column - The column name
 * @param {Date|string} startDate - Start of date range
 * @param {Date|string} endDate - End of date range
 * @param {boolean} excludeStatus - If true, exclude matches
 * @returns {string} - The SQL condition
 */
function buildDateRangeFilter(column, startDate, endDate, excludeStatus = false) {
    if (!startDate && !endDate) return null;

    const conditions = [];

    if (startDate && !endDate) {
        if (excludeStatus) {
            conditions.push(`${column} < '${startDate}'`);
        } else {
            conditions.push(`${column} >= '${startDate}'`);
        }
    } else if (!startDate && endDate) {
        if (excludeStatus) {
            conditions.push(`${column} > '${endDate}'`);
        } else {
            conditions.push(`${column} <= '${endDate}'`);
        }
    } else if (startDate && endDate) {
        if (excludeStatus) {
            conditions.push(`(${column} < '${startDate}' OR ${column} > '${endDate}')`);
        } else {
            conditions.push(`${column} BETWEEN '${startDate}' AND '${endDate}'`);
        }
    }

    return conditions.length > 0 ? conditions.join(" AND ") : null;
}

/**
 * Builds birth date filter with year fallback
 * @param {string} dateColumn - Birth date column
 * @param {string} yearColumn - Birth year column
 * @param {Date|string} startDate - Start date
 * @param {Date|string} endDate - End date
 * @param {boolean} excludeStatus - If true, exclude matches
 * @returns {string} - The SQL condition
 */
function buildBirthDateFilter(dateColumn, yearColumn, startDate, endDate, excludeStatus = false) {
    if (!startDate && !endDate) return null;

    const startYear = startDate ? new Date(startDate).getFullYear() : null;
    const endYear = endDate ? new Date(endDate).getFullYear() : null;

    const dateCondition = buildDateRangeFilter(dateColumn, startDate, endDate, false);
    const yearCondition = startYear && endYear
        ? `(${yearColumn} IS NOT NULL AND ${yearColumn} BETWEEN ${startYear} AND ${endYear})`
        : null;

    let condition;
    if (dateCondition && yearCondition) {
        condition = `((${dateColumn} IS NOT NULL AND ${dateCondition}) OR ${yearCondition})`;
    } else if (dateCondition) {
        condition = `(${dateColumn} IS NOT NULL AND ${dateCondition})`;
    } else if (yearCondition) {
        condition = yearCondition;
    } else {
        return null;
    }

    if (excludeStatus) {
        return `NOT (${condition})`;
    }
    return condition;
}

/**
 * Builds the WHERE clause conditions from search parameters
 * @param {object} params - Search parameters
 * @param {string} tableAlias - Table alias (r for Registration, rel for Relatives)
 * @param {string} regAlias - Registration table alias for joined queries
 * @returns {Array<string>} - Array of WHERE conditions
 */
function buildWhereConditions(params, tableAlias = "r", regAlias = null) {
    const conditions = [];
    const reg = regAlias || tableAlias;

    // Name filters use lower(trim(...)) normalization.
    const nameFilters = [
        { column: `${tableAlias}."firstName"`, value: params.firstName, status: params.firstNameStatus },
        { column: `${tableAlias}."lastName"`, value: params.lastName, status: params.lastNameStatus },
        { column: `${tableAlias}."fatherName"`, value: params.fatherName, status: params.fatherNameStatus },
    ];

    for (const filter of nameFilters) {
        const condition = buildTrimmedNameFilter(filter.column, filter.value, filter.status);
        if (condition) conditions.push(condition);
    }

    // Text filters
    const textFilters = [
        { column: `${tableAlias}."birthPlace"`, value: params.birthPlace, status: params.birthPlaceStatus },
        { column: `${tableAlias}."workplace"`, value: params.workPlace, status: params.workPlaceStatus },
        { column: `${tableAlias}."position"`, value: params.position, status: params.positionStatus },
        { column: `${tableAlias}."pinfl"`, value: params.pinfl, status: params.pinflStatus },
        { column: `${reg}."passport"`, value: params.passport, status: params.passportStatus },
        { column: `${reg}."regNumber"`, value: params.regNumber, status: params.regNumberStatus },
        { column: `${reg}."form_reg"`, value: params.form_reg, status: params.form_regStatus },
        { column: `${tableAlias}."id"::text`, value: params.id, status: params.idStatus },
        { column: `${reg}."completeStatus"::text`, value: params.completeStatus, status: params.completeStatusStatus },
        { column: `${reg}."accessStatus"::text`, value: params.accessStatus, status: params.accessStatusStatus },
        { column: `${tableAlias}."or_tab"`, value: params.or_tab, status: params.or_tabStatus },
        { column: `${reg}."recordNumber"`, value: params.recordNumber, status: params.recordNumberStatus },
        { column: `${tableAlias}."executorId"::text`, value: params.executorId, status: params.executorIdStatus },
        { column: `${tableAlias}."residence"`, value: params.residence, status: params.residenceStatus },
        { column: `${reg}."conclusionRegNum"`, value: params.conclusionRegNum, status: params.conclusionRegNumStatus },
    ];

    // Model uses exact match
    if (params.model) {
        const modelFilter = buildTextFilter(`${tableAlias}."model"`, params.model, params.modelStatus, true);
        if (modelFilter) conditions.push(modelFilter);
    }

    // Notes searches in both notes and additionalNotes
    if (params.notes) {
        const notesSearch = sanitizeValue(processSearchTerm(params.notes));
        if (notesSearch) {
            const notesCondition = params.notesStatus
                ? `NOT (${tableAlias}."notes" ILIKE '%${notesSearch}%' OR ${tableAlias}."additionalNotes" ILIKE '%${notesSearch}%')`
                : `(${tableAlias}."notes" ILIKE '%${notesSearch}%' OR ${tableAlias}."additionalNotes" ILIKE '%${notesSearch}%')`;
            conditions.push(notesCondition);
        }
    }

    for (const filter of textFilters) {
        const condition = buildTextFilter(filter.column, filter.value, filter.status);
        if (condition) conditions.push(condition);
    }

    // Date range filters
    if (params.register_date_start || params.register_date_end) {
        const dateFilter = buildDateRangeFilter(
            `${reg}."regDate"`,
            params.register_date_start,
            params.register_date_end,
            params.register_date_startStatus
        );
        if (dateFilter) conditions.push(dateFilter);
    }

    if (params.register_end_date_start || params.register_end_date_end) {
        const dateFilter = buildDateRangeFilter(
            `${reg}."regEndDate"`,
            params.register_end_date_start,
            params.register_end_date_end,
            params.register_end_dateStatus
        );
        if (dateFilter) conditions.push(dateFilter);
    }

    if (params.birth_date_start || params.birth_date_end) {
        const birthFilter = buildBirthDateFilter(
            `${tableAlias}."birthDate"`,
            `${tableAlias}."birthYear"`,
            params.birth_date_start,
            params.birth_date_end,
            params.birth_dateStatus
        );
        if (birthFilter) conditions.push(birthFilter);
    }

    if (params.conclusion_date_start || params.conclusion_date_end) {
        const dateFilter = buildDateRangeFilter(
            `${reg}."conclusionDate"`,
            params.conclusion_date_start,
            params.conclusion_date_end,
            params.conclusion_dateStatus
        );
        if (dateFilter) conditions.push(dateFilter);
    }

    return conditions;
}

/**
 * Whitelist of allowed sort fields mapped to their SQL column expressions.
 * Text columns use LOWER() for case-insensitive sorting (works with both Latin and Cyrillic).
 */
const SORT_FIELD_MAP = {
    reg_number: { expr: 'LOWER(reg_number)', type: 'text' },
    form_reg: { expr: 'LOWER(form_reg)', type: 'text' },
    form_reg_log: { expr: 'LOWER(form_reg_log)', type: 'text' },
    relationdegree: { expr: 'LOWER(relationDegree)', type: 'text' },
    full_name: { expr: 'LOWER(full_name)', type: 'text' },
    birth_date: {
        // For year-only records use end-of-year to keep chronological ordering consistent.
        expr: 'COALESCE(birth_date, CASE WHEN birth_year BETWEEN 1 AND 9999 THEN make_timestamp(birth_year, 12, 31, 23, 59, 59) END)',
        type: 'date',
        nulls: 'last',
    },
    reg_date: { expr: 'reg_date', type: 'date' },
    reg_end_date: { expr: 'reg_end_date', type: 'date' },
    complete_status: { expr: 'LOWER(complete_status)', type: 'text' },
    access_status: { expr: 'LOWER(access_status)', type: 'text' },
    expired: { expr: 'expired', type: 'date' },
    pinfl: { expr: 'LOWER(pinfl)', type: 'text' },
    passport: { expr: 'LOWER(passport)', type: 'text' },
    conclusion_reg_num: { expr: 'LOWER(conclusion_reg_num)', type: 'text' },
    birth_place: { expr: 'LOWER(birth_place)', type: 'text' },
    workplace: { expr: 'LOWER(workplace)', type: 'text' },
    notes: { expr: 'LOWER(notes)', type: 'text' },
    residence: { expr: 'LOWER(residence)', type: 'text' },
    initiator: { expr: 'LOWER(initiator_last_name)', type: 'text' },
    executor: { expr: 'LOWER(executor_last_name)', type: 'text' },
    updatedat: { expr: 'updatedAt', type: 'date' },
    createdat: { expr: 'createdAt', type: 'date' },
};

/**
 * Builds the ORDER BY clause based on sort parameters.
 * Accepts either legacy (sortField, sortOrder) strings or an array of {field, order} objects.
 * @param {Array<{field:string, order:string}>|string|null} sortFields - Array of sort entries, or legacy sortField string
 * @param {string|null} [sortOrder] - Legacy sortOrder (ASC/DESC), used only when sortFields is a string
 * @returns {string} - The ORDER BY clause
 */
function buildOrderByClause(sortFields, sortOrder) {
    // Normalize to array format
    let entries = [];
    if (Array.isArray(sortFields)) {
        entries = sortFields;
    } else if (typeof sortFields === 'string' && sortFields) {
        // Legacy: single sortField + sortOrder strings
        entries = [{ field: sortFields, order: sortOrder || 'ASC' }];
    }

    // Filter to only valid entries
    const validEntries = entries
        .filter(e => e && e.field)
        .map(e => {
            const fieldKey = e.field.toLowerCase();
            const mapping = SORT_FIELD_MAP[fieldKey];
            if (!mapping) return null;
            const direction = (e.order || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
            const nullsHandling = mapping.nulls === 'last'
                ? 'NULLS LAST'
                : (direction === 'ASC' ? 'NULLS LAST' : 'NULLS FIRST');
            return `${mapping.expr} ${direction} ${nullsHandling}`;
        })
        .filter(Boolean);

    if (validEntries.length === 0) {
        return 'ORDER BY model_name, createdAt DESC';
    }

    return `ORDER BY ${validEntries.join(', ')}`;
}

/**
 * Builds the full search query for Registration records
 * @param {object} params - Search parameters
 * @param {number} pageNumber - Page number (1-indexed)
 * @param {number} pageSize - Number of records per page
 * @param {Array<{field:string, order:string}>|string|null} sortFields - Array of sort entries, or legacy sortField string
 * @param {string|null} [sortOrder] - Legacy sortOrder, used only when sortFields is a string
 * @returns {string} - Complete SQL query
 */
function buildBaseSearchQuery(params, orderByClause, paginationClause = "") {
    // Build Registration WHERE conditions
    const regConditions = buildWhereConditions(params, "r");
    const regWhereClause = regConditions.length > 0 ? `WHERE ${regConditions.join(" AND ")}` : "";

    // Build Relatives WHERE conditions
    const relConditions = buildWhereConditions(params, "rel", "regg");
    const relWhereClause = relConditions.length > 0 ? `WHERE ${relConditions.join(" AND ")}` : "";

    return `
    SELECT * FROM (
      -- Query from Registration table
      SELECT
        r."id"::UUID,
        r."model" AS model_name,
        NULL AS relationDegree,
        r."form_reg",
        r."form_reg_log",
        r."regNumber" AS reg_number,
        r."regDate"::timestamp AS reg_date,
        r."regEndDate"::timestamp AS reg_end_date,
        r."fullName" AS full_name,
        r."firstName" AS first_name,
        r."lastName" AS last_name,
        r.nationality,
        r."fatherName" AS father_name,
        r."pinfl",
        r."passport" AS passport,
        r."birthDate"::timestamp AS birth_date,
        r."birthYear" AS birth_year,
        r."conclusionDate"::timestamp AS conclusion_date,
        r."conclusionRegNum" AS conclusion_reg_num,
        r."workplace",
        r."position" AS positionv1,
        r."birthPlace" AS birth_place,
        r."residence",
        r."notes",
        r."additionalNotes" AS additional_notes,
        r."accessStatus" AS access_status,
        r."expired"::timestamp AS expired,
        r."completeStatus"::text AS complete_status,
        r."expiredDate"::timestamp AS expired_date,
        r."recordNumber" AS record_number,
        r."or_tab",
        ini."first_name" AS initiator_first_name,
        ini."last_name" AS initiator_last_name,
        ini."father_name" AS initiator_father_name,
        adm."first_name" AS executor_first_name,
        adm."last_name" AS executor_last_name,
        adm."father_name" AS executor_father_name,
        r."updatedAt" AS updatedAt,
        r."createdAt" AS createdAt
      FROM "Registration" r
      LEFT JOIN "Initiator" ini ON r."or_tab" = ini."id"
      LEFT JOIN "Admin" adm ON r."executorId" = adm."id"
      ${regWhereClause}
      
      UNION ALL
      
      -- Query from Relatives joined with Registration
      SELECT
        rel."id"::UUID,
        rel."model" AS model_name,
        rel."relationDegree" AS relationDegree,
        regg."form_reg" AS form_reg,
        regg."form_reg_log" AS form_reg_log,
        rel."regNumber" AS reg_number,
        regg."regDate"::timestamp AS reg_date,
        regg."regEndDate"::timestamp AS reg_end_date,
        rel."fullName" AS full_name,
        rel."firstName" AS first_name,
        rel."lastName" AS last_name,
        rel."fatherName" AS father_name,
        rel.nationality,
        rel."pinfl",
        regg."passport" AS passport,
        rel."birthDate"::timestamp AS birth_date,
        rel."birthYear" AS birth_year,
        regg."conclusionDate"::timestamp AS conclusion_date,
        regg."conclusionRegNum" AS conclusion_reg_num,
        rel."workplace",
        rel."position" AS positionv1,
        rel."birthPlace" AS birth_place,
        rel."residence",
        rel."notes",
        rel."additionalNotes" AS additional_notes,
        regg."accessStatus" AS access_status,
        regg."expired"::timestamp AS expired,
        regg."completeStatus"::text AS complete_status,
        regg."expiredDate"::timestamp AS expired_date,
        regg."recordNumber" AS record_number,
        rel."or_tab",
        ini."first_name" AS initiator_first_name,
        ini."last_name" AS initiator_last_name,
        ini."father_name" AS initiator_father_name,
        adm."first_name" AS executor_first_name,
        adm."last_name" AS executor_last_name,
        adm."father_name" AS executor_father_name,
        rel."updatedAt" AS updatedAt,
        rel."createdAt" AS createdAt
      FROM "Relatives" rel
      LEFT JOIN "Initiator" ini ON rel."or_tab" = ini."id"
      LEFT JOIN "Admin" adm ON rel."executorId" = adm."id"
      INNER JOIN "Registration" regg ON rel."registrationId" = regg."id"
      ${relWhereClause}
    ) combined_results
    ${orderByClause}
    ${paginationClause};
  `;
}

function buildSearchQuery(params, pageNumber, pageSize, sortFields, sortOrder) {
    const offset = (pageNumber - 1) * pageSize;
    const orderByClause = buildOrderByClause(sortFields, sortOrder);

    return buildBaseSearchQuery(
        params,
        orderByClause,
        `LIMIT ${pageSize} OFFSET ${offset}`
    );
}

function buildSearchExportQuery(params, sortFields, sortOrder) {
    const orderByClause = buildOrderByClause(sortFields, sortOrder);

    return buildBaseSearchQuery(params, orderByClause);
}

/**
 * Builds the count query for global search
 * @param {object} params - Search parameters
 * @returns {string} - Complete SQL count query
 */
function buildCountQuery(params) {
    // Build Registration WHERE conditions
    const regConditions = buildWhereConditions(params, "r");
    const regWhereClause = regConditions.length > 0 ? `WHERE ${regConditions.join(" AND ")}` : "";

    // Build Relatives WHERE conditions
    const relConditions = buildWhereConditions(params, "rel", "regg");
    const relWhereClause = relConditions.length > 0 ? `WHERE ${relConditions.join(" AND ")}` : "";

    const query = `
    SELECT COUNT(*) as total_count FROM (
      SELECT r."id"
      FROM "Registration" r
      ${regWhereClause}
      
      UNION ALL
      
      SELECT rel."id"
      FROM "Relatives" rel
      INNER JOIN "Registration" regg ON rel."registrationId" = regg."id"
      ${relWhereClause}
    ) combined_results;
  `;

    return query;
}

module.exports = {
    buildSearchQuery,
    buildSearchExportQuery,
    buildCountQuery,
    buildWhereConditions,
    buildTextFilter,
    buildDateRangeFilter,
    buildOrderByClause,
    sanitizeValue,
    processSearchTerm,
    SORT_FIELD_MAP,
};
