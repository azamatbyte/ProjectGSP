const { PrismaClient } = require("@prisma/client");
const xlsx = require("xlsx");
const ExcelJS = require("exceljs");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");
const {
  MODEL_TYPE,
  MODEL_STATUS,
  SERVER_URL,
} = require("../helpers/constants");
const safeString = require("../helpers/safeString");
const compareDates = require("../helpers/compareDates");
const { getDateDayString, getDateStringWithFormat } = require("../helpers/time");

// Initialize Prisma Client
const prisma = require('../../db/database');

/**
 * @swagger
 * /api/v1/registerFour/upload-excel:
 *   post:
 *     summary: "Upload an Excel file"
 *     tags: [RegisterFour]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               filePath:
 *                 type: string
 *                 description: "Path of the Excel file"
 *                 example: "C:/Users/w10/Documents/GSBP/registartion_form_4.xlsx"
 *     responses:
 *       200:
 *         description: "Excel file uploaded successfully"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 totalPeople:
 *                   type: integer
 *       400:
 *         description: "Invalid Excel file or format"
 *       500:
 *         description: "Internal server error"
 */
exports.uploadExcel = async (req, res) => {
  let uploadsPath = null; // Track file path for cleanup

  try {
    let {
      filePath,
      form_reg = "4",
      regDate = "2025-02-04T00:00:00.000Z",
      regNumber = "45-6",
      workplace = "Aviation",
      or_tab,
      recordNumber,
    } = req.body;

    if (!filePath || !filePath.endsWith(".xlsx")) {
      return res.status(400).json({ code: 400, message: "Invalid Excel file" });
    }

    const fileName = filePath.split("/").pop(); // Excel fayl nomini olish

    const currentDir = __dirname;

    // uploads papkasining to'liq yo'lini olish
    uploadsPath = path.join(currentDir, `../../uploads/${fileName}`);

    if (!fs.existsSync(uploadsPath)) {
      return res.status(404).json({ code: 404, message: "File not found" });
    }

    // Read the file
    const workbook = xlsx.readFile(uploadsPath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convert sheet to JSON, skipping the first 2 rows (headers at row 2, data at row 3)
    const excelData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    let count = 0; // Total valid records
    const maxRecords = 7062;

    await prisma.temporaryData.deleteMany({
      where: {
        executorId: req.userId,
      },
    });

    const initiator = await prisma.initiator.findFirst({
      where: {
        id: or_tab,
      },
    });

    if (!initiator) {
      return res
        .status(400)
        .json({ code: 400, message: "Initiator not found" });
    }

    const form_reg_check = await prisma.form.findFirst({
      where: {
        name: form_reg,
      },
    });

    if (!form_reg_check) {
      return res.status(400).json({ code: 400, message: "Form reg not found" });
    }

    const expiredDate = new Date();
    expiredDate.setMonth(expiredDate.getMonth() + form_reg_check?.month);
    for (let i = 1; i < maxRecords; i++) {
      try {
        const row = excelData[i]; // Get row data
        if (!row[2] || !row[1]) {
          console.log("row", row);
          continue;
        }

        const form_reg_log = `${form_reg}-${new Date(
          regDate?.trim()
        ).getFullYear()}`;

        const data = {
          order: i,
          firstName: row[2]?.trim(),
          lastName: row[1]?.trim(),
          fatherName: row[3]
            ? row[3]?.trim() === " "
              ? ""
              : row[3]?.trim()
            : "",
          fullName: `${row[1]?.trim()} ${row[2]?.trim()} ${row[3] ? (row[3]?.trim() === " " ? "" : row[3]?.trim()) : ""
            }`,
          form_reg: form_reg ? form_reg?.trim() : "4",
          form_reg_log: form_reg_log,
          regNumber: regNumber ? regNumber?.trim() : null,
          regDate: regDate ? regDate?.trim() : null,
          birthYear: parseInt(safeString(row[4])) || null,
          birthPlace: row[5]
            ? row[5]?.trim() === " "
              ? ""
              : row[5]?.trim()
            : "",
          workplace: workplace ? workplace?.trim() : null,
          position: row[6]
            ? row[6]?.trim() === " "
              ? ""
              : row[6]?.trim()
            : "",
          model: "registration4",
          residence: row[7]
            ? row[7]?.trim() === " "
              ? ""
              : row[7]?.trim()
            : "",
          // or_tab: initiator?.id,
          accessStatus: "ПРОВЕРКА",
          status: "not_checked",
          found_status: false,
          // executorId: req.userId,
          expiredDate: expiredDate,
          executor: { connect: { id: req.userId } },
          Initiator: { connect: { id: initiator?.id } },
        };

        // console.log("data", data);
        if (data?.lastName === "Абдужабборева") {
          console.log("data", data);
        }
        // console.log("data");
        // If full name, birth year or workplace is empty, stop processing

        const startOfYear = new Date(
          `${safeString(data?.birthYear)}-01-01T00:00:00.000Z`
        );
        const endOfYear = new Date(
          `${safeString(data?.birthYear)}-12-31T23:59:59.999Z`
        );

        const filter = {
          OR: [
            {
              firstName: data?.firstName,
              lastName: data?.lastName,
              fatherName: data?.fatherName ? data?.fatherName : "",
              birthDate: data?.birthDate
                ? {
                  gte: new Date(startOfYear.setHours(0, 0, 0, 0)), // Start of the year at 00:00:00
                  lte: new Date(endOfYear.setHours(23, 59, 59, 999)), // End of the year at 23:59:59.999
                }
                : null,
            },
            {
              firstName: data?.firstName,
              lastName: data?.lastName,
              fatherName: data?.fatherName ? data?.fatherName : "",
              birthYear: data?.birthYear ? parseInt(data?.birthYear) : null,
            },
          ].filter(Boolean),
        };

        const initial_data = await prisma.registration.findMany({
          where: { ...filter },
          orderBy: {
            model: "asc",
          },
        });

        const registration = initial_data.find(
          (item) => item?.model === "registration"
        );

        const registration4 = initial_data.find(
          (item) => item?.model === "registration4"
        );

        if (registration) {
          data.registration = registration.id;
          data.found_status = true;
          console.log("FOUND registration");
        }

        if (registration4) {
          data.registration_four = registration4.id;
          data.found_status = true;
          console.log("FOUND registration4");
        }

        if (!registration && !registration4) {
          const relatives_data = await prisma.relatives.findFirst({
            where: filter,
          });
          if (relatives_data) {
            data.relatives = relatives_data.id;
            // data.found_status = true;
            console.log("FOUND relatives");
          }
        }

        // data.registrationSimilarity = [];
        // data.registration_four_similarity = [];

        if (true) {
          // delete data.registrationSimilarity;
          // delete data.registration_four_similarity;
          ////write data to rehistration four
          // const write_data = await prisma.registration.create({
          //   data: data,
          // });
          // if (write_data) {
          //   data.registration_four = write_data.id;
          // }
          // data.found_status = false;
          data.registrationSimilarity = [];
          data.registration_four_similarity = [];
          // 1. Ensure the required extensions are enabled (auto-creates if not exists)
          await prisma.$executeRawUnsafe(
            `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
          );
          await prisma.$executeRawUnsafe(
            `CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;`
          );
          // 2. Use the tagged template literal syntax for $queryRaw with parameter interpolation.
          const results = await prisma.$queryRaw`
  WITH combined_results AS (
    -- Search in Registration table
    SELECT 
      "id",
      "fullName",
      "regNumber",
      "form_reg",
      "birthDate",
      "birthYear",
      "workplace",
      "position",
      "birthPlace",
      "model",
      "accessStatus",
      "expired",
      "completeStatus",
      "recordNumber",
      "expiredDate",
      'registration' as source_table,
      NULL as registration_id,
      NULL as "registrationId", -- Registration doesn't have registrationId
      round(
        (
          (
            CASE 
              WHEN "firstName" IS NOT NULL AND ${data?.firstName} IS NOT NULL
                   AND regexp_replace(lower(trim("firstName")), '[[:space:]]+', ' ', 'g') != ''
                   AND regexp_replace(lower(trim(${data?.firstName})), '[[:space:]]+', ' ', 'g') != ''
              THEN (1 - (levenshtein(
                regexp_replace(lower(trim("firstName")), '[[:space:]]+', ' ', 'g'),
                regexp_replace(lower(trim(${data?.firstName})), '[[:space:]]+', ' ', 'g')
              )::numeric
                / GREATEST(
                  char_length(regexp_replace(lower(trim("firstName")), '[[:space:]]+', ' ', 'g')),
                  char_length(regexp_replace(lower(trim(${data?.firstName})), '[[:space:]]+', ' ', 'g'))
                )))
              ELSE 0.5
            END +
            CASE 
              WHEN "lastName" IS NOT NULL AND ${data?.lastName} IS NOT NULL
                   AND regexp_replace(lower(trim("lastName")), '[[:space:]]+', ' ', 'g') != ''
                   AND regexp_replace(lower(trim(${data?.lastName})), '[[:space:]]+', ' ', 'g') != ''
              THEN (1 - (levenshtein(
                regexp_replace(lower(trim("lastName")), '[[:space:]]+', ' ', 'g'),
                regexp_replace(lower(trim(${data?.lastName})), '[[:space:]]+', ' ', 'g')
              )::numeric
                / GREATEST(
                  char_length(regexp_replace(lower(trim("lastName")), '[[:space:]]+', ' ', 'g')),
                  char_length(regexp_replace(lower(trim(${data?.lastName})), '[[:space:]]+', ' ', 'g'))
                )))
              ELSE 0.5
            END +
            CASE 
              WHEN "fatherName" IS NOT NULL AND ${data?.fatherName} IS NOT NULL
                   AND regexp_replace(lower(trim("fatherName")), '[[:space:]]+', ' ', 'g') != ''
                   AND regexp_replace(lower(trim(${data?.fatherName})), '[[:space:]]+', ' ', 'g') != ''
              THEN (1 - (levenshtein(
                regexp_replace(lower(trim("fatherName")), '[[:space:]]+', ' ', 'g'),
                regexp_replace(lower(trim(${data?.fatherName})), '[[:space:]]+', ' ', 'g')
              )::numeric
                / GREATEST(
                  char_length(regexp_replace(lower(trim("fatherName")), '[[:space:]]+', ' ', 'g')),
                  char_length(regexp_replace(lower(trim(${data?.fatherName})), '[[:space:]]+', ' ', 'g'))
                )))
              ELSE 0.5
            END
          ) / 3 * 100
        )::numeric,
        2
      ) AS similarity_percentage
    FROM "Registration"
    WHERE
      (
        (
          CASE 
            WHEN "firstName" IS NOT NULL AND ${data?.firstName} IS NOT NULL
                 AND regexp_replace(lower(trim("firstName")), '[[:space:]]+', ' ', 'g') != ''
                 AND regexp_replace(lower(trim(${data?.firstName})), '[[:space:]]+', ' ', 'g') != ''
            THEN (1 - (levenshtein(
              regexp_replace(lower(trim("firstName")), '[[:space:]]+', ' ', 'g'),
              regexp_replace(lower(trim(${data?.firstName})), '[[:space:]]+', ' ', 'g')
            )::numeric
              / GREATEST(
                char_length(regexp_replace(lower(trim("firstName")), '[[:space:]]+', ' ', 'g')),
                char_length(regexp_replace(lower(trim(${data?.firstName})), '[[:space:]]+', ' ', 'g'))
              )))
            ELSE 0.5
          END +
          CASE 
            WHEN "lastName" IS NOT NULL AND ${data?.lastName} IS NOT NULL
                 AND regexp_replace(lower(trim("lastName")), '[[:space:]]+', ' ', 'g') != ''
                 AND regexp_replace(lower(trim(${data?.lastName})), '[[:space:]]+', ' ', 'g') != ''
            THEN (1 - (levenshtein(
              regexp_replace(lower(trim("lastName")), '[[:space:]]+', ' ', 'g'),
              regexp_replace(lower(trim(${data?.lastName})), '[[:space:]]+', ' ', 'g')
            )::numeric
              / GREATEST(
                char_length(regexp_replace(lower(trim("lastName")), '[[:space:]]+', ' ', 'g')),
                char_length(regexp_replace(lower(trim(${data?.lastName})), '[[:space:]]+', ' ', 'g'))
              )))
            ELSE 0.5
          END +
          CASE 
            WHEN "fatherName" IS NOT NULL AND ${data?.fatherName} IS NOT NULL
                 AND regexp_replace(lower(trim("fatherName")), '[[:space:]]+', ' ', 'g') != ''
                 AND regexp_replace(lower(trim(${data?.fatherName})), '[[:space:]]+', ' ', 'g') != ''
            THEN (1 - (levenshtein(
              regexp_replace(lower(trim("fatherName")), '[[:space:]]+', ' ', 'g'),
              regexp_replace(lower(trim(${data?.fatherName})), '[[:space:]]+', ' ', 'g')
            )::numeric
              / GREATEST(
                char_length(regexp_replace(lower(trim("fatherName")), '[[:space:]]+', ' ', 'g')),
                char_length(regexp_replace(lower(trim(${data?.fatherName})), '[[:space:]]+', ' ', 'g'))
              )))
            ELSE 0.5
          END
        ) / 3
      ) > 0.75

    UNION ALL

    -- Search in Relatives table with Registration accessStatus check
    SELECT 
      r."id",
      r."fullName",
      r."regNumber",
      NULL as "form_reg", -- Relatives doesn't have form_reg
      r."birthDate",
      r."birthYear",
      r."workplace",
      r."position",
      r."birthPlace",
      r."model",
      reg."accessStatus", -- Get accessStatus from Registration
      reg."expired", -- Get expired from Registration
      NULL as "completeStatus", -- Relatives doesn't have completeStatus
      NULL as "recordNumber", -- Relatives doesn't have recordNumber
      NULL as "expiredDate", -- Relatives doesn't have expiredDate
      'relatives' as source_table,
      r."registrationId" as registration_id,
      r."registrationId", -- Include registrationId field
      round(
        (
          (
            CASE 
              WHEN r."firstName" IS NOT NULL AND ${data?.firstName} IS NOT NULL
                   AND regexp_replace(lower(trim(r."firstName")), '[[:space:]]+', ' ', 'g') != ''
                   AND regexp_replace(lower(trim(${data?.firstName})), '[[:space:]]+', ' ', 'g') != ''
              THEN (1 - (levenshtein(
                regexp_replace(lower(trim(r."firstName")), '[[:space:]]+', ' ', 'g'),
                regexp_replace(lower(trim(${data?.firstName})), '[[:space:]]+', ' ', 'g')
              )::numeric
                / GREATEST(
                  char_length(regexp_replace(lower(trim(r."firstName")), '[[:space:]]+', ' ', 'g')),
                  char_length(regexp_replace(lower(trim(${data?.firstName})), '[[:space:]]+', ' ', 'g'))
                )))
              ELSE 0.5
            END +
            CASE 
              WHEN r."lastName" IS NOT NULL AND ${data?.lastName} IS NOT NULL
                   AND regexp_replace(lower(trim(r."lastName")), '[[:space:]]+', ' ', 'g') != ''
                   AND regexp_replace(lower(trim(${data?.lastName})), '[[:space:]]+', ' ', 'g') != ''
              THEN (1 - (levenshtein(
                regexp_replace(lower(trim(r."lastName")), '[[:space:]]+', ' ', 'g'),
                regexp_replace(lower(trim(${data?.lastName})), '[[:space:]]+', ' ', 'g')
              )::numeric
                / GREATEST(
                  char_length(regexp_replace(lower(trim(r."lastName")), '[[:space:]]+', ' ', 'g')),
                  char_length(regexp_replace(lower(trim(${data?.lastName})), '[[:space:]]+', ' ', 'g'))
                )))
              ELSE 0.5
            END +
            CASE 
              WHEN r."fatherName" IS NOT NULL AND ${data?.fatherName} IS NOT NULL
                   AND regexp_replace(lower(trim(r."fatherName")), '[[:space:]]+', ' ', 'g') != ''
                   AND regexp_replace(lower(trim(${data?.fatherName})), '[[:space:]]+', ' ', 'g') != ''
              THEN (1 - (levenshtein(
                regexp_replace(lower(trim(r."fatherName")), '[[:space:]]+', ' ', 'g'),
                regexp_replace(lower(trim(${data?.fatherName})), '[[:space:]]+', ' ', 'g')
              )::numeric
                / GREATEST(
                  char_length(regexp_replace(lower(trim(r."fatherName")), '[[:space:]]+', ' ', 'g')),
                  char_length(regexp_replace(lower(trim(${data?.fatherName})), '[[:space:]]+', ' ', 'g'))
                )))
              ELSE 0.5
            END
          ) / 3 * 100
        )::numeric,
        2
      ) AS similarity_percentage
    FROM "Relatives" r
    LEFT JOIN "Registration" reg ON r."registrationId" = reg."id"
    WHERE
      -- Check Registration's accessStatus conditions
      -- (reg."accessStatus" ILIKE '%cyzn%' OR reg."accessStatus" = 'dopusk')
      -- AND
      -- Name similarity conditions
      (
        (
          CASE 
            WHEN r."firstName" IS NOT NULL AND ${data?.firstName} IS NOT NULL
                 AND regexp_replace(lower(trim(r."firstName")), '[[:space:]]+', ' ', 'g') != ''
                 AND regexp_replace(lower(trim(${data?.firstName})), '[[:space:]]+', ' ', 'g') != ''
            THEN (1 - (levenshtein(
              regexp_replace(lower(trim(r."firstName")), '[[:space:]]+', ' ', 'g'),
              regexp_replace(lower(trim(${data?.firstName})), '[[:space:]]+', ' ', 'g')
            )::numeric
              / GREATEST(
                char_length(regexp_replace(lower(trim(r."firstName")), '[[:space:]]+', ' ', 'g')),
                char_length(regexp_replace(lower(trim(${data?.firstName})), '[[:space:]]+', ' ', 'g'))
              )))
            ELSE 0.5
          END +
          CASE 
            WHEN r."lastName" IS NOT NULL AND ${data?.lastName} IS NOT NULL
                 AND regexp_replace(lower(trim(r."lastName")), '[[:space:]]+', ' ', 'g') != ''
                 AND regexp_replace(lower(trim(${data?.lastName})), '[[:space:]]+', ' ', 'g') != ''
            THEN (1 - (levenshtein(
              regexp_replace(lower(trim(r."lastName")), '[[:space:]]+', ' ', 'g'),
              regexp_replace(lower(trim(${data?.lastName})), '[[:space:]]+', ' ', 'g')
            )::numeric
              / GREATEST(
                char_length(regexp_replace(lower(trim(r."lastName")), '[[:space:]]+', ' ', 'g')),
                char_length(regexp_replace(lower(trim(${data?.lastName})), '[[:space:]]+', ' ', 'g'))
              )))
            ELSE 0.5
          END +
          CASE 
            WHEN r."fatherName" IS NOT NULL AND ${data?.fatherName} IS NOT NULL
                 AND regexp_replace(lower(trim(r."fatherName")), '[[:space:]]+', ' ', 'g') != ''
                 AND regexp_replace(lower(trim(${data?.fatherName})), '[[:space:]]+', ' ', 'g') != ''
            THEN (1 - (levenshtein(
              regexp_replace(lower(trim(r."fatherName")), '[[:space:]]+', ' ', 'g'),
              regexp_replace(lower(trim(${data?.fatherName})), '[[:space:]]+', ' ', 'g')
            )::numeric
              / GREATEST(
                char_length(regexp_replace(lower(trim(r."fatherName")), '[[:space:]]+', ' ', 'g')),
                char_length(regexp_replace(lower(trim(${data?.fatherName})), '[[:space:]]+', ' ', 'g'))
              )))
            ELSE 0.5
          END
        ) / 3
      ) > 0.75
  )
  SELECT * FROM combined_results
  ORDER BY similarity_percentage DESC
  LIMIT 50
`;
          if (data?.order === 31) {
            console.log("results", results);
            console.log("data", data);
          }
          results.map(async (item) => {
            if (item?.model === "registration") {
              data.registrationSimilarity.push(item);
            }
            if (item?.model === "registration4") {
              data.registration_four_similarity.push(item);
            }
            if (item?.model === "relative") {
              // data.registration = item.registration_id;
              data.registrationSimilarity.push(item);
            }
          });
        }

        const registration_123_first = Boolean(
          registration &&
          (registration?.accessStatus === "ДОПУСК" ||
            registration?.accessStatus?.toLowerCase().includes("снят")) &&
          compareDates(registration?.expired, new Date(), {
            granularity: "date",
          }) === 1 &&
          registration?.expired
        );

        const registration_4_first = Boolean(
          registration4 &&
          (registration4?.accessStatus === "ДОПУСК" ||
            registration4?.accessStatus?.toLowerCase().includes("снят")) &&
          compareDates(registration4?.expired, new Date(), {
            granularity: "date",
          }) === 1 &&
          registration4?.expired
        );

        //second check
        if (registration_123_first && !registration4) {
          data.status = "accepted";
        }

        //third check
        if (!registration && registration_4_first) {
          data.status = "accepted";
        }

        //fourth check
        const registration_4_second = Boolean(
          registration4 &&
          !(
            registration4?.accessStatus === "ДОПУСК" ||
            registration4?.accessStatus?.toLowerCase().includes("снят")
          )
        );

        if (!registration && registration_4_second) {
          data.status = "not_accepted";
        }
        //fifth check
        const registration_123_third = Boolean(
          registration &&
          !(
            registration?.accessStatus === "ДОПУСК" ||
            registration?.accessStatus?.toLowerCase().includes("снят")
          )
        );

        if (registration_123_third && !registration4) {
          data.status = "not_checked";
        }

        //sixth check
        const registration_123_fourth = Boolean(
          registration &&
          (((registration?.accessStatus === "ДОПУСК" ||
            registration?.accessStatus?.toLowerCase().includes("снят")) &&
            compareDates(registration?.expired, new Date(), {
              granularity: "date",
            }) === -1) ||
            registration?.accessStatus === "ПРОВЕРКА")
        );

        if (registration_123_fourth && !registration4) {
          data.status = "not_checked";
        }

        //seventh check
        const registration_4_fourth = Boolean(
          registration4 &&
          (((registration4?.accessStatus === "ДОПУСК" ||
            registration4?.accessStatus?.toLowerCase().includes("снят")) &&
            new Date(registration4?.expired) < new Date()) ||
            registration4?.accessStatus === "ПРОВЕРКА")
        );

        if (!registration && registration_4_fourth) {
          data.status = "not_checked";
          data.action_status = "fast";
        }

        //eighth check
        if (registration_123_first && registration_4_first) {
          data.status = "accepted";
        }

        //ninth check
        const registration_nineth = Boolean(
          registration &&
          (registration.accessStatus === "ДОПУСК" ||
            registration.accessStatus?.toLowerCase().includes("снят")) &&
          registration.expired > new Date() &&
          registration.expired
        );
        const registration4_nineth = Boolean(
          registration4 &&
          (registration4.accessStatus === "ДОПУСК" ||
            registration4.accessStatus?.toLowerCase().includes("снят") ||
            registration4.accessStatus
              ?.toLowerCase()
              .includes("сп прекращена")) &&
          registration4.expired < new Date() &&
          registration4.expired
        );

        if (registration_nineth && registration4_nineth) {
          data.status = "accepted";
        }

        //tenth check

        const registration_tenth = Boolean(
          registration &&
          (registration.accessStatus === "ДОПУСК" ||
            registration.accessStatus?.toLowerCase().includes("снят")) &&
          registration.expired > new Date() &&
          registration.expired
        );
        const registration4_tenth = Boolean(
          registration4 &&
          (((registration4.accessStatus === "ДОПУСК" ||
            registration4.accessStatus?.toLowerCase().includes("снят")) &&
            (registration4.expired < new Date() || !registration4.expired)) ||
            registration4.accessStatus === "ПРОВЕРКА")
        );

        if (registration_tenth && registration4_tenth) {
          data.status = "not_checked";
          data.action_status = "fast";
        }
        //11th check
        const registration_123_11th = Boolean(
          registration &&
          (registration.accessStatus === "ДОПУСК" ||
            registration.accessStatus?.toLowerCase().includes("снят")) &&
          registration.expired < new Date() &&
          registration.expired
          // registration?.accessStatus?.toLowerCase().includes("аннулирован")
        );

        if (registration_123_11th && registration_4_first) {
          data.status = "accepted";
        }

        //13th check
        if (registration_123_third && registration_4_second) {
          data.status = "not_accepted";
        }
        //14th check this is edited 16.07.2025
        if (registration_123_third && registration_4_first) {
          data.status = "accepted";
        }

        //15th check
        if (registration_123_third && registration4_nineth) {
          data.status = "not_checked";
        }

        //16th check
        if (registration_123_third && registration_4_fourth) {
          data.status = "not_checked";
          data.action_status = "fast";
        }

        //17th check
        if (registration_123_first && registration_4_second) {
          data.status = "not_checked";
        }

        //18th check
        if (registration_123_11th && registration_4_second) {
          data.status = "not_accepted";
        }

        //19th check
        if (registration_123_11th && registration4_nineth) {
          data.status = "not_checked";
        }

        //20th check annulirovan
        const registration_20th = Boolean(
          registration &&
          registration.accessStatus?.toLowerCase().includes("аннулирован")
        );
        const registration4_20th = Boolean(
          registration4 &&
          registration4.accessStatus?.toLowerCase().includes("аннулирован")
        );
        if (registration_20th && registration4_20th) {
          data.status = "not_checked";
        }

        delete data.form_reg_log;
        delete data.expiredDate;
        data.recordNumber = recordNumber;

        // if (data.registrationSimilarity?.length > 0 || data.registration_four_similarity?.length > 0) {
        //   console.log("data.registrationSimilarity", data);
        //   // console.log("data.registration_four_similarity", data.registration_four_similarity);
        // }

        await prisma.temporaryData.create({
          data: { ...data },
        });

        count++;
      } catch (error) {
        console.error("Error processing Excel file:", error);
      }
      // Stop if we reach the max limit
      if (count >= maxRecords) {
        console.log("Max record limit reached (7062). Stopping processing.");
        break;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 5000)); // 5 sekund kutish

    // Delete the Excel file after successful processing
    try {
      if (uploadsPath && fs.existsSync(uploadsPath)) {
        fs.unlinkSync(uploadsPath);
        console.log(`Excel file deleted successfully: ${uploadsPath}`);
      }
    } catch (deleteError) {
      console.error("Error deleting Excel file:", deleteError);
      // Don't return error here as the main process was successful
    }

    return res.json({
      code: 200,
      message: "OK",
      totalPeople: count,
    });
  } catch (error) {
    console.error("Error processing Excel file:", error);

    // Try to delete the file even if there was an error during processing
    try {
      if (uploadsPath && fs.existsSync(uploadsPath)) {
        fs.unlinkSync(uploadsPath);
        console.log(`Excel file deleted after error: ${uploadsPath}`);
      }
    } catch (deleteError) {
      console.error("Error deleting Excel file after error:", deleteError);
    }

    return res
      .status(500)
      .json({ code: 500, message: "Internal Server Error" });
  }
};

/**
 * @swagger
 * /api/v1/registerFour/list:
 *   post:
 *     summary: Get paginated list of temporary data with filtering options
 *     tags: [RegisterFour]
 *     parameters:
 *       - in: query
 *         name: pageNumber
 *         schema:
 *           type: integer
 *           default: 1
 *         required: false
 *         description: Page number for pagination
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 10
 *         required: false
 *         description: Number of items per page
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *                 description: Filter by ID
 *               status:
 *                 type: string
 *                 description: Filter by status
 *               found_status:
 *                 type: string
 *                 enum: [found, not_found]
 *                 description: Filter by found status
 *               sortField:
 *                 type: string
 *                 description: Legacy single-column sort field
 *               sortOrder:
 *                 type: string
 *                 enum: [ASC, DESC, asc, desc]
 *                 description: Legacy single-column sort direction
 *               sortFields:
 *                 type: array
 *                 description: Multi-column sorting format (globalSearch style)
 *                 items:
 *                   type: object
 *                   properties:
 *                     field:
 *                       type: string
 *                     order:
 *                       type: string
 *                       enum: [ASC, DESC, asc, desc]
 *               sort:
 *                 oneOf:
 *                   - type: object
 *                     description: Register-list style single sort (for example regNumber ascending)
 *                   - type: array
 *                     description: Register-list style multi sort (for example regNumber ascending then fullName descending)
 *                 description: Compatibility sort format from /register/list
 *     responses:
 *       200:
 *         description: Successfully retrieved list of temporary data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "List of temporary data"
 *                 total_pages:
 *                   type: integer
 *                   example: 5
 *                 total_data:
 *                   type: integer
 *                   example: 50
 *                 temporaryData:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       fullName:
 *                         type: string
 *                       status:
 *                         type: string
 *       400:
 *         description: Bad request - Invalid parameters
 *       500:
 *         description: Internal server error
 */
const TEMPORARY_DATA_SORTABLE_FIELDS = new Set([
  "createdAt",
  "updatedAt",
  "order",
  "form_reg",
  "regNumber",
  "regDate",
  "fullName",
  "firstName",
  "lastName",
  "fatherName",
  "birthDate",
  "birthYear",
  "birthPlace",
  "workplace",
  "position",
  "model",
  "residence",
  "accessStatus",
  "recordNumber",
  "pinfl",
  "status",
  "found_status",
  "migration_status",
  "action_status",
  "executorId",
  "initiatorId",
]);

const normalizeSortDirection = (direction) =>
  typeof direction === "string" && direction.toUpperCase() === "DESC"
    ? "desc"
    : "asc";

const normalizeTemporaryDataOrderBy = ({
  sortFields,
  sortField,
  sortOrder,
  sort,
}) => {
  const entries = [];

  const pushSortEntry = (field, direction) => {
    if (typeof field !== "string" || !field.trim()) return;
    const normalizedField = field.trim();
    if (!TEMPORARY_DATA_SORTABLE_FIELDS.has(normalizedField)) return;
    entries.push({ [normalizedField]: normalizeSortDirection(direction) });
  };

  if (Array.isArray(sortFields) && sortFields.length > 0) {
    sortFields.forEach((item) => {
      if (!item || typeof item !== "object") return;
      pushSortEntry(item.field, item.order);
    });
  } else if (sortField) {
    pushSortEntry(sortField, sortOrder);
  }

  const parseSortObject = (obj) => {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
    const pair = Object.entries(obj);
    if (pair.length !== 1) return;

    const [field, directionOrObj] = pair[0];
    let direction = directionOrObj;
    if (
      directionOrObj &&
      typeof directionOrObj === "object" &&
      typeof directionOrObj.sort === "string"
    ) {
      direction = directionOrObj.sort;
    }

    pushSortEntry(field, direction);
  };

  if (Array.isArray(sort)) {
    sort.forEach(parseSortObject);
  } else {
    parseSortObject(sort);
  }

  const uniqueEntries = [];
  const seenFields = new Set();
  entries.forEach((entry) => {
    const field = Object.keys(entry)[0];
    if (!field || seenFields.has(field)) return;
    seenFields.add(field);
    uniqueEntries.push(entry);
  });

  return uniqueEntries.length > 0 ? uniqueEntries : [{ createdAt: "asc" }];
};

exports.getTemporaryDataList = async (req, res) => {
  try {
    let {
      id,
      status,
      found_status,
      pageNumber = 1,
      pageSize = 10,
      sortFields,
      sortField,
      sortOrder,
      sort,
    } = req.body || {};

    pageNumber = parseInt(pageNumber, 10);
    pageSize = parseInt(pageSize, 10);

    if (
      isNaN(pageNumber) ||
      isNaN(pageSize) ||
      pageNumber < 1 ||
      pageSize < 1
    ) {
      return res.status(400).json({ message: "Invalid pagination parameters" });
    }

    // Qidiruv shartlarini dinamik ravishda yaratish
    const filters = {
      AND: [],
    };

    if (status) {
      filters.AND.push({ status: { equals: status } });
    }

    if (id) {
      filters.AND.push({ executorId: { equals: id } });
    }

    if (found_status && found_status === "found") {
      filters.AND.push({ found_status: { equals: true } });
    }

    if (found_status && found_status === "not_found") {
      filters.AND.push({ found_status: { equals: false } });
    }

    const orderBy = normalizeTemporaryDataOrderBy({
      sortFields,
      sortField,
      sortOrder,
      sort,
    });

    console.log(filters);

    const includeRelations = {
      executor: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          username: true,
        },
      },
      Initiator: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
        },
      },
    };

    const hasBirthDateSort = orderBy.some((entry) => Object.prototype.hasOwnProperty.call(entry, "birthDate"));

    const getEffectiveBirthDateSortValue = (record) => {
      if (record?.birthDate) {
        const parsedBirthDate = new Date(record.birthDate);
        if (!Number.isNaN(parsedBirthDate.getTime())) {
          return parsedBirthDate.getTime();
        }
      }

      if (record?.birthYear !== null && record?.birthYear !== undefined) {
        const birthYearInt = parseInt(record.birthYear, 10);
        if (!Number.isNaN(birthYearInt)) {
          // Year-only records are sorted as end-of-year dates.
          return Date.UTC(birthYearInt, 11, 31, 23, 59, 59, 999);
        }
      }

      return null;
    };

    const normalizeComparableValue = (value) => {
      if (value instanceof Date) return value.getTime();
      if (typeof value === "string") return value.toLocaleLowerCase();
      return value;
    };

    let temporaryData = [];
    let totalData = 0;

    if (hasBirthDateSort) {
      const sortSelect = { id: true, birthDate: true, birthYear: true };
      for (const entry of orderBy) {
        const field = Object.keys(entry)[0];
        if (field) sortSelect[field] = true;
      }

      const allForSort = await prisma.temporaryData.findMany({
        where: filters,
        select: sortSelect,
      });

      allForSort.sort((a, b) => {
        for (const entry of orderBy) {
          const field = Object.keys(entry)[0];
          const direction = entry[field];
          let cmp = 0;

          if (field === "birthDate") {
            const av = getEffectiveBirthDateSortValue(a);
            const bv = getEffectiveBirthDateSortValue(b);

            // Keep records without both birthDate and birthYear at the end for both ASC and DESC.
            if (av === null && bv === null) {
              cmp = 0;
            } else if (av === null) {
              cmp = 1;
            } else if (bv === null) {
              cmp = -1;
            } else {
              cmp = av < bv ? -1 : av > bv ? 1 : 0;
              if (direction === "desc") {
                cmp = -cmp;
              }
            }
          } else {
            const avRaw = a[field];
            const bvRaw = b[field];

            if (avRaw === null || avRaw === undefined) {
              cmp = bvRaw === null || bvRaw === undefined ? 0 : 1;
            } else if (bvRaw === null || bvRaw === undefined) {
              cmp = -1;
            } else {
              const av = normalizeComparableValue(avRaw);
              const bv = normalizeComparableValue(bvRaw);
              cmp = av < bv ? -1 : av > bv ? 1 : 0;
              if (cmp !== 0 && direction === "desc") {
                cmp = -cmp;
              }
            }
          }

          if (cmp !== 0) return cmp;
        }

        // Deterministic tie-breaker for stable pagination.
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });

      totalData = allForSort.length;
      const offset = (pageNumber - 1) * pageSize;
      const pageIds = allForSort.slice(offset, offset + pageSize).map((item) => item.id);

      if (pageIds.length > 0) {
        const unordered = await prisma.temporaryData.findMany({
          where: { id: { in: pageIds } },
          include: includeRelations,
        });
        const pos = new Map(pageIds.map((id, index) => [id, index]));
        unordered.sort((a, b) => pos.get(a.id) - pos.get(b.id));
        temporaryData = unordered;
      }
    } else {
      const [rows, count] = await prisma.$transaction([
        prisma.temporaryData.findMany({
          where: filters,
          skip: (pageNumber - 1) * pageSize,
          take: pageSize,
          include: includeRelations,
          orderBy,
        }),
        prisma.temporaryData.count({
          where: filters,
        }),
      ]);
      temporaryData = rows;
      totalData = count;
    }

    const totalPages = Math.ceil(totalData / pageSize);

    return res.status(200).json({
      code: 200,
      message: "List of temporary data",
      total_pages: totalPages,
      total_data: totalData,
      temporaryData,
    });
  } catch (error) {
    console.error("Error fetching temporary data list:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {

  }
};

/**
 * @swagger
 * /api/v1/registerFour/getIdsOfList:
 *   post:
 *     summary: Get ids of temporary data with filtering options
 *     tags: [RegisterFour]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *                 description: Filter by ID
 *     responses:
 *       200:
 *         description: Successfully retrieved list of temporary data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "List of temporary data"
 *                 total_pages:
 *                   type: integer
 *                   example: 5
 *                 total_data:
 *                   type: integer
 *                   example: 50
 *                 temporaryData:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       fullName:
 *                         type: string
 *                       status:
 *                         type: string
 *       400:
 *         description: Bad request - Invalid parameters
 *       500:
 *         description: Internal server error
 */
exports.getIdsOfList = async (req, res) => {
  try {
    let { id, regNumber } = req.body;

    // Qidiruv shartlarini dinamik ravishda yaratish
    const filters = {
      AND: [],
    };

    if (id) {
      filters.AND.push({ executorId: { equals: id } });
    }

    const temporaryData = await prisma.temporaryData.findMany({
      where: filters,
      select: {
        id: true,
        found_status: true,
        registration: true,
        registration_four: true,
      },
    });

    const ids = temporaryData.map((data) => {
      if (data.found_status && data.regNumber == regNumber) {
        if (data.registration_four) {
          return data.registration_four;
        } else {
          return data.registration;
        }
      }
    });

    return res.status(200).json({
      code: 200,
      message: "List of temporary data",
      ids: ids,
    });
  } catch (error) {
    console.error("Error fetching temporary data list:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {

  }
};

/**
 * @swagger
 * /api/v1/registerFour/get/{id}:
 *   get:
 *     summary: Get temporary data by ID
 *     tags: [RegisterFour]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Temporary Data ID
 *     responses:
 *       200:
 *         description: Successfully retrieved temporary data
 *       404:
 *         description: Temporary data not found
 *       500:
 *         description: Internal server error
 */
exports.getTemporaryDataById = async (req, res) => {
  const { id } = req.params;

  try {
    const temporaryData = await prisma.temporaryData.findUnique({
      where: { id },
      include: {
        executor: true,
        Initiator: true,
      },
    });

    if (!temporaryData) {
      return res
        .status(404)
        .json({ code: 404, message: "Temporary data not found" });
    }

    return res.status(200).json({
      code: 200,
      message: "Temporary data retrieved successfully",
      data: temporaryData,
    });
  } catch (error) {
    console.error("Error fetching temporary data:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {

  }
};

/**
 * @swagger
 * /api/v1/registerFour/update/{id}:
 *   post:
 *     summary: Update status of temporary data
 *     tags: [RegisterFour]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Temporary Data ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 example: "accepted"
 *     responses:
 *       200:
 *         description: Status updated successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: Temporary data not found
 *       500:
 *         description: Internal server error
 */
exports.updateTemporaryDataStatus = async (req, res) => {
  const { id } = req.params;
  const { status, regNumber } = req.body;

  if (!status) {
    return res.status(400).json({ code: 400, message: "Status is required" });
  }

  try {
    const updatedTemporaryData = await prisma.temporaryData.update({
      where: { id },
      data: { status },
    });

    return res.status(200).json({
      code: 200,
      message: "Status updated successfully",
      data: updatedTemporaryData,
    });
  } catch (error) {
    if (error.code === "P2025") {
      return res
        .status(404)
        .json({ code: 404, message: "Temporary data not found" });
    }
    console.error("Error updating temporary data status:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {

  }
};

/**
 * @swagger
 * /api/v1/registerFour/export:
 *   post:
 *     summary: Export temporary data to Excel
 *     tags: [RegisterFour]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               executorId:
 *                 type: string
 *                 description: "ID of the executor"
 *               status:
 *                 type: string
 *                 description: "Status to filter by"
 *     responses:
 *       200:
 *         description: "Excel file exported successfully"
 *       400:
 *         description: "Invalid parameters"
 *       500:
 *         description: "Internal server error"
 */
exports.exportTemporaryDataToExcel = async (req, res) => {
  const { type } = req.body;

  if (!type || type.trim() === "") {
    return res.status(400).json({ code: 400, message: "type is required" });
  }

  try {
    // Find all sessions for the given type and admin
    const sessions = await prisma.session.findMany({
      where: {
        type: type,
        adminId: req.userId,
      },
      select: { registrationId: true },
    });

    const ids = sessions.map((session) => session?.registrationId);

    if (ids.length === 0) {
      return res
        .status(404)
        .json({ code: 404, message: "No sessions found for the given type" });
    }

    // Build dynamic filters
    const filters = {
      id: { in: ids },
    };

    // Fetch data from registrations and relatives
    const registrationList = await prisma.registration.findMany({
      where: filters,
      orderBy: {
        regNumber: "asc",
      },
      include: {
        executor: {
          select: {
            first_name: true,
            last_name: true,
          },
        },
        Initiator: {
          select: {
            first_name: true,
            last_name: true,
          },
        },
      },
    });

    const relativesList = await prisma.relatives.findMany({
      where: filters,
      orderBy: {
        regNumber: "asc",
      },
      include: {
        executor: {
          select: {
            first_name: true,
            last_name: true,
          },
        },
        Initiator: {
          select: {
            first_name: true,
            last_name: true,
          },
        },
      },
    });

    const temporaryDataList = [...registrationList, ...relativesList];

    temporaryDataList.sort((a, b) => {
      const regA = a.regNumber || a.reg_number || "";
      const regB = b.regNumber || b.reg_number || "";
      return regA.localeCompare(regB);
    });

    if (temporaryDataList.length === 0) {
      return res.status(404).json({ code: 404, message: "No data found" });
    }

    // Map data into sheet rows
    const rows = temporaryDataList.map((data, index) => ({
      "№": index + 1,
      "reg№": data?.regNumber || data?.reg_number || "",
      Фам: data?.last_name || data?.lastName || "",
      Имя: data?.first_name || data?.firstName || "",
      Отч: data?.fatherName || "",
      "г.р.": data.birthDate
        ? new Date(data.birthDate).getFullYear()
        : data.birthYear || "",
      "м.р.": data.birthPlace || "",
    }));

    // Create worksheet and apply styles
    const worksheet = xlsx.utils.json_to_sheet(rows);
    const headers = ["№", "reg№", "Фам", "Имя", "Отч", "г.р.", "м.р."];

    headers.forEach((_, colIndex) => {
      const cellRef = xlsx.utils.encode_cell({ r: 0, c: colIndex });
      if (worksheet[cellRef]) {
        worksheet[cellRef].s = {
          fill: { patternType: "solid", fgColor: { rgb: "FFA500" } },
          font: { color: { rgb: "FFFFFF" }, bold: true },
        };
      }
    });

    worksheet["!cols"] = [
      { wch: 5 },
      { wch: 10 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
      { wch: 10 },
      { wch: 50 },
    ];

    // Create workbook and write file
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Temporary Data");

    const fileName = `${uuidv4()}.xlsx`;
    const filePath = `./uploads/${fileName}`;
    xlsx.writeFile(workbook, filePath);

    return res.status(200).json({
      code: 200,
      message: "Excel file exported successfully",
      link: `${SERVER_URL}/api/v1/download/${fileName}`,
    });
  } catch (error) {
    console.error("Error exporting temporary data to Excel:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {

  }
};

exports.exportSverkaMain = async (req, res) => {
  const { type } = req.body;
  const executorId = req.userId;

  // 2. Validate session type
  const validTypes = ["SESSION", "RESERVE", "RAPORT"];
  if (!validTypes.includes(type)) {
    return res.status(400).json({
      code: 400,
      message: "Invalid session type",
    });
  }

  try {
    const sessionData = await prisma.session.findMany({
      where: { type, adminId: executorId },
    });
    if (!sessionData.length) {
      return res.status(404).json({ code: 404, message: "No data found" });
    }

    // 1) Create workbook & worksheet
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Сверка", {
      pageSetup: { orientation: "landscape" },
    });

    // 2) Define columns with proper widths
    sheet.columns = [
      { width: 8 }, // A - №
      { width: 15 }, // B - Фам
      { width: 15 }, // C - Имя
      { width: 15 }, // D - Отч
      { width: 8 }, // E - Г.р.
      { width: 25 }, // F - Место работы
      { width: 25 }, // G - Р/О
      { width: 25 }, // H - Р/О
    ];

    // 3) Title "Сверка" in row 1, merged across A1:H1
    sheet.mergeCells("A1:H1");
    sheet.getCell("A1").value = "Сверка";
    sheet.getCell("A1").font = { bold: true, size: 14 };
    sheet.getCell("A1").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    sheet.getCell("A1").border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    // 4) "время:" in F2
    sheet.getCell("F2").value = "время:";
    sheet.getCell("F2").font = { bold: true, size: 11 };
    sheet.getCell("F2").alignment = { horizontal: "right", vertical: "middle" };

    // 5) Merge G2:H2 and add current date/time
    sheet.mergeCells("G2:H2");
    const now = new Date();
    const timeString = now.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const dateString = now.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    sheet.getCell("G2").value = `${timeString}  ${dateString}`;
    sheet.getCell("G2").font = { italic: true, size: 11 };
    sheet.getCell("G2").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    sheet.getCell("G2").border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    // 6) "Допуск/отказ" header in row 3, merged across G3:H3
    sheet.mergeCells("G3:H3");
    sheet.getCell("G3").value = "Допуск/отказ";
    sheet.getCell("G3").font = { bold: true, size: 11 };
    sheet.getCell("G3").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    sheet.getCell("G3").border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    // 7) "Форма" header in row 4, merged across G4:H4
    sheet.mergeCells("G4:H4");
    sheet.getCell("G4").value = "Форма";
    sheet.getCell("G4").font = { bold: true, size: 11 };
    sheet.getCell("G4").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    sheet.getCell("G4").border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    // 8) Merge cells A3:A5 for "№"
    sheet.mergeCells("A3:A5");
    sheet.getCell("A3").value = "№";
    sheet.getCell("A3").font = { bold: true, size: 11 };
    sheet.getCell("A3").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    sheet.getCell("A3").border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    // 9) Merge cells B3:B5 for "Фам"
    sheet.mergeCells("B3:B5");
    sheet.getCell("B3").value = "Фам";
    sheet.getCell("B3").font = { bold: true, size: 11 };
    sheet.getCell("B3").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    sheet.getCell("B3").border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    // 10) Merge cells C3:C5 for "Имя"
    sheet.mergeCells("C3:C5");
    sheet.getCell("C3").value = "Имя";
    sheet.getCell("C3").font = { bold: true, size: 11 };
    sheet.getCell("C3").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    sheet.getCell("C3").border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    // 11) Merge cells D3:D5 for "Отч"
    sheet.mergeCells("D3:D5");
    sheet.getCell("D3").value = "Отч";
    sheet.getCell("D3").font = { bold: true, size: 11 };
    sheet.getCell("D3").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    sheet.getCell("D3").border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    // 12) Merge cells E3:E5 for "Г.р."
    sheet.mergeCells("E3:E5");
    sheet.getCell("E3").value = "Г.р.";
    sheet.getCell("E3").font = { bold: true, size: 11 };
    sheet.getCell("E3").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    sheet.getCell("E3").border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    // 13) Merge cells F3:F5 for "Место работы"
    sheet.mergeCells("F3:F5");
    sheet.getCell("F3").value = "Место работы";
    sheet.getCell("F3").font = { bold: true, size: 11 };
    sheet.getCell("F3").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    sheet.getCell("F3").border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    // 14) Sub-headers in row 5
    sheet.getCell("G5").value = "Р/О";
    sheet.getCell("G5").font = { bold: true, size: 11 };
    sheet.getCell("G5").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    sheet.getCell("G5").border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    sheet.getCell("H5").value = "У";
    sheet.getCell("H5").font = { bold: true, size: 11 };
    sheet.getCell("H5").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    sheet.getCell("H5").border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    // 15) Populate data starting from row 6
    for (let i = 0; i < sessionData.length; i++) {
      const data = sessionData[i];
      const rowIndex = i + 6;
      const row = sheet.getRow(rowIndex);

      // Set initial row values
      row.values = [
        i + 1,
        data.lastName || "",
        data.firstName || "",
        data.fatherName || "",
        data.birthDate ? data.birthDate.getFullYear() : data.birthYear || "",
        data.birthPlace || "",
        "", // Р/О - will be set below
        "", // У - will be set below
      ];

      // Handle registration column (G)
      try {
        const registrationData = await prisma.registration.findUnique({
          where: {
            id: data.registrationId,
          },
          select: {
            accessStatus: true,
            expired: true,
            regDate: true,
            model: true,
          },
        });
        const accessStatus = registrationData?.accessStatus;
        if (registrationData?.model === MODEL_TYPE.REGISTRATION_FOUR) {
          if (accessStatus) {
            const accessDate = registrationData?.expired
              ? new Date(registrationData.expired).toLocaleDateString("ru-RU", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })
              : "";
            const regDate = registrationData?.regDate
              ? new Date(registrationData.regDate).toLocaleDateString("ru-RU", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })
              : "";
            if (
              accessStatus === "ДОПУСК" ||
              accessStatus.toLowerCase().includes("снят")
            ) {
              row.getCell("H").value =
                registrationData?.accessStatus + " до " + accessDate;
            } else {
              row.getCell("H").value =
                registrationData?.accessStatus + " от " + regDate;
            }
          } else {
            row.getCell("H").value = "Найден";
          }
        } else {
          if (accessStatus) {
            const accessDate = registrationData?.expired
              ? new Date(registrationData.expired).toLocaleDateString("ru-RU", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })
              : "";
            const regDate = registrationData?.regDate
              ? new Date(registrationData.regDate).toLocaleDateString("ru-RU", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })
              : "";
            if (
              accessStatus === "ДОПУСК" ||
              accessStatus.toLowerCase().includes("снят")
            ) {
              row.getCell("G").value =
                registrationData?.accessStatus + " до " + accessDate;
            } else {
              row.getCell("G").value =
                registrationData?.accessStatus + " от " + regDate;
            }
          } else {
            row.getCell("G").value = "Найден";
          }
        }
      } catch (error) {
        console.error("Error fetching registration:", error);
        row.getCell("H").value = "Ошибка";
      }

      row.alignment = { horizontal: "center", vertical: "middle" };
      row.height = 20;

      // Apply borders to all cells in data rows
      row.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };

        // Left align text in name and place columns
        if (colNumber >= 2 && colNumber <= 4) {
          // Фам, Имя, Отч
          cell.alignment = { horizontal: "left", vertical: "middle" };
        } else if (colNumber === 6) {
          // Место работы
          cell.alignment = { horizontal: "left", vertical: "middle" };
        }
      });
    }

    // 16) Save to disk
    const fileName = `${uuidv4()}.xlsx`;
    const filePath = `./uploads/${fileName}`;
    await workbook.xlsx.writeFile(filePath);

    return res.status(200).json({
      code: 200,
      message: "Excel file exported successfully",
      link: `${SERVER_URL}/api/v1/download/${fileName}`,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: err.message,
    });
  } finally {

  }
};

/**
 * @swagger
 * /api/v1/registerFour/exportSverka:
 *   post:
 *     summary: Export temporary data to Excel
 *     tags: [RegisterFour]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               executorId:
 *                 type: string
 *                 description: "ID of the executor"
 *               status:
 *                 type: string
 *                 description: "Status to filter by"
 *     responses:
 *       200:
 *         description: "Excel file exported successfully"
 *       400:
 *         description: "Invalid parameters"
 *       500:
 *         description: "Internal server error"
 */
exports.exportSverka = async (req, res) => {
  const { executorId } = req.body;
  if (!executorId)
    return res.status(400).json({ code: 400, message: "Ids is required" });

  try {
    const temporaryDataList = await prisma.temporaryData.findMany({
      where: { executorId: { equals: executorId } },
    });
    if (!temporaryDataList.length) {
      return res.status(404).json({ code: 404, message: "No data found" });
    }

    // 1) Create workbook & worksheet
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Сверка", {
      pageSetup: { orientation: "landscape" },
    });

    // 2) Define columns with proper widths
    sheet.columns = [
      { width: 8 }, // A - №
      { width: 15 }, // B - Фам
      { width: 15 }, // C - Имя
      { width: 15 }, // D - Отч
      { width: 8 }, // E - Г.р.
      { width: 25 }, // F - Место работы
      { width: 35 }, // G - Р/О
      { width: 30 }, // H - У
    ];

    // 3) Title "Сверка" in row 1, merged across A1:H1
    sheet.mergeCells("A1:H1");
    sheet.getCell("A1").value = "Сверка";
    sheet.getCell("A1").font = { bold: true, size: 14 };
    sheet.getCell("A1").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    sheet.getCell("A1").border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    // 4) "время:" in F2
    sheet.getCell("F2").value = "время:";
    sheet.getCell("F2").font = { bold: true, size: 11 };
    sheet.getCell("F2").alignment = { horizontal: "right", vertical: "middle" };

    // 5) Merge G2:H2 and add current date/time
    sheet.mergeCells("G2:H2");
    const now = new Date();
    const timeString = now.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const dateString = now.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    sheet.getCell("G2").value = `${timeString}  ${dateString}`;
    sheet.getCell("G2").font = { italic: true, size: 11 };
    sheet.getCell("G2").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    sheet.getCell("G2").border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    // 6) "Допуск/отказ" header in row 3, merged across G3:H3
    sheet.mergeCells("G3:H3");
    sheet.getCell("G3").value = "Допуск/отказ";
    sheet.getCell("G3").font = { bold: true, size: 11 };
    sheet.getCell("G3").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    sheet.getCell("G3").border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    // 7) "Форма" header in row 4, merged across G4:H4
    sheet.mergeCells("G4:H4");
    sheet.getCell("G4").value = "Форма";
    sheet.getCell("G4").font = { bold: true, size: 11 };
    sheet.getCell("G4").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    sheet.getCell("G4").border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    // 8) Merge cells A3:A5 for "№"
    sheet.mergeCells("A3:A5");
    sheet.getCell("A3").value = "№";
    sheet.getCell("A3").font = { bold: true, size: 11 };
    sheet.getCell("A3").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    sheet.getCell("A3").border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    // 9) Merge cells B3:B5 for "Фам"
    sheet.mergeCells("B3:B5");
    sheet.getCell("B3").value = "Фам";
    sheet.getCell("B3").font = { bold: true, size: 11 };
    sheet.getCell("B3").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    sheet.getCell("B3").border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    // 10) Merge cells C3:C5 for "Имя"
    sheet.mergeCells("C3:C5");
    sheet.getCell("C3").value = "Имя";
    sheet.getCell("C3").font = { bold: true, size: 11 };
    sheet.getCell("C3").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    sheet.getCell("C3").border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    // 11) Merge cells D3:D5 for "Отч"
    sheet.mergeCells("D3:D5");
    sheet.getCell("D3").value = "Отч";
    sheet.getCell("D3").font = { bold: true, size: 11 };
    sheet.getCell("D3").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    sheet.getCell("D3").border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    // 12) Merge cells E3:E5 for "Г.р."
    sheet.mergeCells("E3:E5");
    sheet.getCell("E3").value = "Г.р.";
    sheet.getCell("E3").font = { bold: true, size: 11 };
    sheet.getCell("E3").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    sheet.getCell("E3").border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    // 13) Merge cells F3:F5 for "Место работы"
    sheet.mergeCells("F3:F5");
    sheet.getCell("F3").value = "Место работы";
    sheet.getCell("F3").font = { bold: true, size: 11 };
    sheet.getCell("F3").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    sheet.getCell("F3").border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    // 14) Sub-headers in row 5
    sheet.getCell("G5").value = "Р/О";
    sheet.getCell("G5").font = { bold: true, size: 11 };
    sheet.getCell("G5").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    sheet.getCell("G5").border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    sheet.getCell("H5").value = "У";
    sheet.getCell("H5").font = { bold: true, size: 11 };
    sheet.getCell("H5").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    sheet.getCell("H5").border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };

    // 15) Populate data starting from row 6
    for (let i = 0; i < temporaryDataList.length; i++) {
      const data = temporaryDataList[i];
      const rowIndex = i + 6;
      const row = sheet.getRow(rowIndex);

      // Set initial row values
      row.values = [
        i + 1,
        data.lastName || "",
        data.firstName || "",
        data.fatherName || "",
        data.birthDate ? data.birthDate.getFullYear() : data.birthYear || "",
        data.birthPlace || "",
        "", // Р/О - will be set below
        "", // У - will be set below
      ];

      // Handle registration column (G)
      if (data.registration) {
        try {
          const registrationData = await prisma.registration.findUnique({
            where: {
              id: data.registration,
            },
            select: {
              accessStatus: true,
              expired: true,
              regDate: true,
            },
          });
          const accessStatus = registrationData?.accessStatus;
          if (accessStatus) {
            if (
              accessStatus === "ДОПУСК" ||
              accessStatus.toLowerCase().includes("снят")
            ) {
              const accessDate = registrationData?.expired
                ? new Date(registrationData.expired).toLocaleDateString(
                  "ru-RU",
                  {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  }
                )
                : "";
              row.getCell("G").value = accessStatus + " до " + accessDate;
            } else {
              const regDate = registrationData?.regDate
                ? new Date(registrationData.regDate).toLocaleDateString(
                  "ru-RU",
                  {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  }
                )
                : "";
              row.getCell("G").value = accessStatus + " от " + regDate;
            }
          } else {
            row.getCell("G").value = "Найден";
          }
        } catch (error) {
          console.error("Error fetching registration:", error);
          row.getCell("G").value = "Ошибка";
        }
      } else {
        row.getCell("G").value = "Не найден";
      }

      // Handle registration_four column (H)
      if (data.registration_four) {
        try {
          const registrationFourData = await prisma.registration.findUnique({
            where: {
              id: data.registration_four,
            },
            select: {
              accessStatus: true,
              expired: true,
              regDate: true,
            },
          });
          const accessStatus = registrationFourData?.accessStatus;
          if (accessStatus) {
            if (
              accessStatus === "ДОПУСК" ||
              accessStatus.toLowerCase().includes("снят")
            ) {
              const accessDate = registrationFourData?.expired
                ? new Date(registrationFourData.expired).toLocaleDateString(
                  "ru-RU",
                  {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  }
                )
                : "";
              row.getCell("H").value = accessStatus + " до " + accessDate;
            } else {
              const regDate = registrationFourData?.regDate
                ? new Date(registrationFourData.regDate).toLocaleDateString(
                  "ru-RU",
                  {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  }
                )
                : "";
              row.getCell("H").value = accessStatus + " от " + regDate;
            }
          } else {
            row.getCell("H").value = "Найден";
          }
        } catch (error) {
          console.error("Error fetching registration_four:", error);
          row.getCell("H").value = "Ошибка";
        }
      } else {
        row.getCell("H").value = "Не найден";
      }

      row.alignment = { horizontal: "center", vertical: "middle" };
      row.height = 20;

      // Apply borders to all cells in data rows
      row.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };

        // Left align text in name and place columns
        if (colNumber >= 2 && colNumber <= 4) {
          // Фам, Имя, Отч
          cell.alignment = { horizontal: "left", vertical: "middle" };
        } else if (colNumber === 6) {
          // Место работы
          cell.alignment = { horizontal: "left", vertical: "middle" };
        }
      });
    }

    // 16) Save to disk
    const fileName = `${uuidv4()}.xlsx`;
    const filePath = `./uploads/${fileName}`;
    await workbook.xlsx.writeFile(filePath);

    return res.status(200).json({
      code: 200,
      message: "Excel file exported successfully",
      link: `${SERVER_URL}/api/v1/download/${fileName}`,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: err.message,
    });
  } finally {

  }
};

/**
 * @swagger
 * /api/v1/registerFour/migrate/{id}:
 *   get:
 *     summary: Migrate temporary data to registration
 *     tags: [RegisterFour]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Temporary Data ID
 *     responses:
 *       200:
 *         description: Successfully retrieved temporary data
 *       404:
 *         description: Temporary data not found
 *       500:
 *         description: Internal server error
 */
exports.migrate = async (req, res) => {
  const { id } = req.params;

  try {
    const temporaryData = await prisma.temporaryData.findFirst({
      where: { id },
    });

    if (!temporaryData) {
      return res
        .status(404)
        .json({ code: 404, message: "Temporary data not found" });
    }

    if (temporaryData?.migration_status) {
      return res
        .status(400)
        .json({ code: 400, message: "Temporary data is already migrated" });
    }

    if (!temporaryData?.registration || !temporaryData?.registration_four) {
      return res
        .status(400)
        .json({ code: 400, message: "Temporary is not migrated" });
    }

    if (temporaryData?.registration) {
      const data = await prisma.registration.findMany({
        where: {
          id: {
            in: [temporaryData?.registration, temporaryData?.registration_four],
          },
        },
      });

      if (data.length === 0) {
        return res.status(400).json({
          code: 400,
          message: "Error data.length === 0 is not migrated",
        });
      }

      const registration = data.find((item) => item.model === "registration");
      const registration4 = data.find((item) => item.model === "registration4");

      if (!registration || !registration4) {
        return res
          .status(400)
          .json({ code: 400, message: "Registration is not migrated" });
      }

      await prisma.$transaction(async (tx) => {
        const externalNotesRegistration = registration?.additionalNotes
          ? registration?.additionalNotes +
          `\n   ` +
          (registration4?.notes ? registration4?.notes : "")
          : registration4?.notes
            ? registration4?.notes
            : "";
        const externalNotesRegistration4 = registration4?.additionalNotes
          ? registration4?.additionalNotes +
          `\n   ` +
          (registration?.notes ? registration?.notes : "")
          : registration?.notes
            ? registration?.notes
            : "";
        // externalNotesRegistration !== ""
        //   ? await tx.registration.update({
        //       where: { id: registration?.id },
        //       data: { externalNotes: externalNotesRegistration },
        //     })
        //   : "";
        // externalNotesRegistration !== ""
        //   ? await tx.registrationLog.create({
        //       data: {
        //         registrationId: registration?.id,
        //         fieldName: "externalNotes",
        //         oldValue: registration?.externalNotes || "",
        //         newValue: externalNotesRegistration,
        //         executorId: temporaryData?.executorId,
        //       },
        //     })
        //   : "";
        externalNotesRegistration !== "" &&
          registration?.additionalNotes !== externalNotesRegistration
          ? await tx.registration.update({
            where: { id: registration?.id },
            data: { additionalNotes: externalNotesRegistration },
          })
          : "";
        externalNotesRegistration4 !== "" &&
          registration4?.additionalNotes !== externalNotesRegistration4
          ? await tx.registration.update({
            where: { id: registration4?.id },
            data: { additionalNotes: externalNotesRegistration4 },
          })
          : "";
        externalNotesRegistration4 !== "" &&
          registration4?.additionalNotes !== externalNotesRegistration4
          ? await tx.registrationLog.create({
            data: {
              registrationId: registration4?.id,
              fieldName: "additionalNotes",
              oldValue: registration4?.additionalNotes || "",
              newValue: externalNotesRegistration4,
              executorId: temporaryData?.executorId,
            },
          })
          : "";
        registration?.additionalNotes !== externalNotesRegistration
          ? await tx.registrationLog.create({
            data: {
              registrationId: registration?.id,
              fieldName: "additionalNotes",
              oldValue: registration?.additionalNotes || "",
              newValue: externalNotesRegistration,
              executorId: temporaryData?.executorId,
            },
          })
          : "";
        await tx.temporaryData.update({
          where: { id },
          data: { migration_status: true },
        });
      });
      return res.status(200).json({
        code: 200,
        message: "Temporary data migrated successfully",
      });
    }
    return res.status(200).json({
      code: 200,
      message: "Temporary data retrieved successfully",
      data: temporaryData,
    });
  } catch (error) {
    console.error("Error fetching temporary data:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {

  }
};

/**
 * @swagger
 * /api/v1/registerFour/actionFast/{id}:
 *   post:
 *     summary: Migrate temporary data to registration
 *     tags: [RegisterFour]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Temporary Data ID
 *       - in: body
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *         description: Type
 *     responses:
 *       200:
 *         description: Successfully retrieved temporary data
 *       404:
 *         description: Temporary data not found
 *       500:
 *         description: Internal server error
 */
exports.actionFast = async (req, res) => {
  const { id } = req.params;
  const { type } = req.body;

  try {
    const temporaryData = await prisma.temporaryData.findFirst({
      where: { id, action_status: "fast" },
    });

    if (!temporaryData) {
      return res
        .status(404)
        .json({ code: 404, message: "Temporary data not found" });
    }

    if (!temporaryData?.registration_four) {
      return res
        .status(400)
        .json({ code: 400, message: "Registration four is not found" });
    }

    if (type === "fast") {
      const data = await prisma.registration.findFirst({
        where: {
          id: temporaryData?.registration_four,
        },
      });

      if (!data) {
        return res.status(400).json({
          code: 400,
          message: "Registration four data is not found",
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.registration.update({
          where: {
            id: temporaryData?.registration_four,
          },
          data: {
            regNumber: temporaryData?.regNumber,
          },
        });
        await tx.registrationLog.create({
          data: {
            registrationId: temporaryData?.registration_four,
            fieldName: "regNumber",
            oldValue: data?.regNumber || "",
            newValue: temporaryData?.regNumber || "",
            executorId: temporaryData?.executorId,
          },
        });
      });
      return res.status(200).json({
        code: 200,
        message: "Temporary data migrated successfully",
      });
    } else if (type === "slow") {
      const data = await prisma.registration.findFirst({
        where: {
          id: temporaryData?.registration_four,
        },
      });

      if (!data) {
        return res.status(400).json({
          code: 400,
          message: "Registration four data is not found",
        });
      }

      await prisma.temporaryData.update({
        where: { id },
        data: { regNumber: data?.regNumber },
      });
    }

    await prisma.temporaryData.update({
      where: { id },
      data: { action_status: "null" },
    });

    return res.status(200).json({
      code: 200,
      message: "Temporary data migrated successfully",
      // data: temporaryData,
    });
  } catch (error) {
    console.error("Error fetching temporary data:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {

  }
};

/**
 * @swagger
 * /api/v1/registerFour/save/{id}:
 *   get:
 *     summary: Save temporary data to registration or registration four
 *     tags: [RegisterFour]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Temporary Data ID
 *       - in: path
 *         name: save_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Save ID
 *     responses:
 *       200:
 *         description: Successfully retrieved temporary data
 *       404:
 *         description: Temporary data not found
 *       500:
 *         description: Internal server error
 */
exports.save = async (req, res) => {
  const { id } = req.params;
  const { save_id } = req.query;

  try {
    const temporaryData = await prisma.temporaryData.findFirst({
      where: { id },
    });

    if (!temporaryData) {
      return res
        .status(404)
        .json({ code: 404, message: "Temporary data not found" });
    }

    if (temporaryData?.found_status) {
      return res
        .status(400)
        .json({ code: 400, message: "Temporary data is already found" });
    }

    if (
      !(
        temporaryData?.registrationSimilarity.find(
          (item) => item.id === save_id
        ) ||
        temporaryData?.registration_four_similarity.find(
          (item) => item.id === save_id
        )
      )
    ) {
      return res
        .status(400)
        .json({ code: 400, message: "save_id data is not found" });
    }

    let checkRegistration = await prisma.registration.findFirst({
      where: {
        id: save_id,
      },
    });

    if (!checkRegistration) {
      checkRegistration = await prisma.relatives.findFirst({
        where: {
          id: save_id,
        },
      });
      if (!checkRegistration) {
        return res
          .status(400)
          .json({ code: 400, message: "Registration not found" });
      }
    }

    if (checkRegistration?.model === "registration") {
      await prisma.temporaryData.update({
        where: { id: id },
        data: { registration: save_id, found_status: true },
      });
    }

    if (checkRegistration?.model === "registration4") {
      await prisma.temporaryData.update({
        where: { id: id },
        data: { registration_four: save_id, found_status: true },
      });
    }

    if (checkRegistration?.model === MODEL_TYPE.RELATIVE) {
      await prisma.temporaryData.update({
        where: { id: id },
        data: { registration: checkRegistration?.registrationId },
      });
    }

    // await prisma.temporaryData.update({
    //   where: { id: id },
    //   data: {
    //     ...(checkRegistration?.model === MODEL_TYPE.REGISTRATION_FOUR
    //       ? { registration_four: save_id }
    //       : checkRegistration?.model === MODEL_TYPE.REGISTRATION
    //       ? { registration: save_id }
    //       : checkRegistration?.model === MODEL_TYPE.RELATIVE
    //       ? { registration: save_id }
    //       : {}),
    //   },
    // });

    return res.status(200).json({
      code: 200,
      message: "Temporary data saved successfully",
    });
  } catch (error) {
    console.error("Error fetching temporary data:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {

  }
};

/**
 * @swagger
 * /api/v1/registerFour/deploy/{id}:
 *   post:
 *     summary: Save temporary data to registration or registration four
 *     tags: [RegisterFour]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Temporary Data ID
 *       - in: path
 *         name: save_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Save ID
 *     responses:
 *       200:
 *         description: Successfully retrieved temporary data
 *       404:
 *         description: Temporary data not found
 *       500:
 *         description: Internal server error
 */
exports.deploy = async (req, res) => {
  const { id, type, form_reg } = req.body;
  const adminId = req.userId;

  try {
    if (type) {
      const validTypes = ["SESSION", "RESERVE", "RAPORT"];
      if (!validTypes.includes(type)) {
        return res.status(400).json({
          code: 400,
          message: "Invalid session type",
        });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const temporaryData_not_found = await tx.temporaryData.findMany({
        where: {
          OR: [
            {
              executorId: id,
              found_status: false,
            },
            {
              executorId: id,
              found_status: true,
              registration: { not: null },
              registration_four: null,
            },
          ],
        },
      });

      const temporaryData_found_four = await tx.temporaryData.findMany({
        where: {
          executorId: id,
          found_status: true,
          registration_four: { not: null },
        },
      });

      const year = new Date().getFullYear();
      let count = 0; // actual successfully saved count
      const allIds = [];

      // --- Update existing registration_four items ---
      for (const item of temporaryData_found_four) {
        try {
          // 1️⃣ Get the old registration data
          const oldRegistration = await tx.registration.findUnique({
            where: { id: item.registration_four },
          });

          if (!oldRegistration) continue;

          // 2️⃣ Prepare new registration data (all mapped from temporaryData)
          const updatedData = {
            form_reg: item?.form_reg ? item?.form_reg : oldRegistration?.form_reg,
            // ...(oldRegistration.form_reg !== item?.form_reg && {
            //   form_reg_log: `${oldRegistration.form_reg_log}, ${item?.form_reg}-${year}`,
            // }),
            form_reg_log: `${oldRegistration.form_reg_log}, ${item?.form_reg}-${year}`,
            regNumber: item?.regNumber || "",
            regDate: item?.regDate ? item?.regDate : oldRegistration?.regDate,
            fullName: item?.fullName ? item?.fullName?.trim() : oldRegistration?.fullName,
            firstName: item?.firstName ? item?.firstName?.trim() : oldRegistration?.firstName,
            lastName: item?.lastName ? item?.lastName?.trim() : oldRegistration?.lastName,
            fatherName: item?.fatherName ? item?.fatherName?.trim() : oldRegistration?.fatherName,
            birthPlace: item?.birthPlace ? item?.birthPlace?.trim() : oldRegistration?.birthPlace,
            workplace: item?.workplace ? item?.workplace?.trim() : oldRegistration?.workplace,
            position: item?.position ? item?.position?.trim() : oldRegistration?.position,
            pinfl: item?.pinfl ? item?.pinfl?.trim() : oldRegistration?.pinfl,
            birthDate: item?.birthDate ? item?.birthDate : oldRegistration?.birthDate,
            birthYear: item?.birthYear ? item?.birthYear : oldRegistration?.birthYear,
            residence: item?.residence ? item?.residence?.trim() : oldRegistration?.residence,
            recordNumber: item?.recordNumber ? item?.recordNumber?.trim() : oldRegistration?.recordNumber,
            // accessStatus: item?.accessStatus || "ПРОВЕРКА",
            // expired: item?.expired ? item?.expired : oldRegistration?.expired,
            completeStatus: MODEL_STATUS.WAITING,
            expiredDate: oldRegistration.expiredDate, // preserve if needed
            executorId: req.userId ? req.userId : oldRegistration?.executorId,
            or_tab: item?.initiatorId ? item?.initiatorId : oldRegistration?.or_tab,
          };

          // 3️⃣ Compare fields and write logs
          for (const key of Object.keys(updatedData)) {
            let oldValue = oldRegistration[key] ?? "";
            let newValue = updatedData[key] ?? "";

            // Special handling for executorId and or_tab to store full names in logs
            if (key === "executorId" && newValue !== null) {
              // Get full name for old value
              if (oldValue) {
                const oldUser = await tx.admin.findUnique({
                  where: { id: oldValue },
                });
                oldValue = oldUser
                  ? `${oldUser.first_name || ""} ${oldUser.last_name || ""
                    }`.trim()
                  : oldValue;
              }

              // Get full name for new value
              if (newValue) {
                const newUser = await tx.admin.findUnique({
                  where: { id: newValue },
                });
                newValue = newUser
                  ? `${newUser.first_name || ""} ${newUser.last_name || ""
                    }`.trim()
                  : newValue;
              }
            }
            if (key === "or_tab" && newValue !== null) {
              // Get full name for old value
              if (oldValue) {
                const oldUser = await tx.initiator.findUnique({
                  where: { id: oldValue },
                });
                oldValue = oldUser
                  ? `${oldUser.first_name || ""} ${oldUser.last_name || ""
                    }`.trim()
                  : oldValue;
              }

              // Get full name for new value
              if (newValue) {
                const newUser = await tx.initiator.findUnique({
                  where: { id: newValue },
                });
                newValue = newUser
                  ? `${newUser.first_name || ""} ${newUser.last_name || ""
                    }`.trim()
                  : newValue;
              }
            }

            // Normalize values to compare and log changes consistently (Date -> ISO string)
            const normalizeValue = (value) => {
              if (value instanceof Date) {
                //format dd.mm.yyyy hh:mm
                return String(value.getDate()).padStart(2, "0") +
                  "." +
                  String(value.getMonth() + 1).padStart(2, "0") +
                  "." +
                  value.getFullYear() //+
                // " " +
                // String(value.getHours()).padStart(2, "0") +
                // ":" +
                // String(value.getMinutes()).padStart(2, "0");
              }
              return safeString(value);
            };

            const normalizedOldValue = normalizeValue(oldValue);
            const normalizedNewValue = normalizeValue(newValue);

            if (normalizedOldValue === normalizedNewValue) {
              continue;
            }

            if (normalizedOldValue !== normalizedNewValue) {
              await tx.registrationLog.create({
                data: {
                  registrationId: item.registration_four,
                  fieldName: key,
                  oldValue: normalizedOldValue,
                  newValue: normalizedNewValue,
                  executorId: req.userId,
                },
              });
            }
          }

          // 4️⃣ Update registration
          await tx.registration.update({
            where: { id: item.registration_four },
            data: updatedData,
          });

          // 5️⃣ Delete from temporaryData
          if (!allIds.includes(item.registration_four))
            await tx.temporaryData.delete({ where: { id: item.id } });

          if (!allIds.includes(item.registration_four))
            allIds.push(item.registration_four);
          count++;
        } catch (error) {
          console.error("Error updating registration_four:", error);
          continue; // Skip failed update
        }
      }

      // --- Create new registrations for not_found items ---
      for (const item of temporaryData_not_found) {
        try {
          // 1️⃣ Check if record with same firstName, lastName, birthYear exists
          const existing = await tx.registration.findFirst({
            where: {
              firstName: item?.firstName || "",
              lastName: item?.lastName || "",
              fatherName: item?.fatherName || "",
              model: MODEL_TYPE.REGISTRATION_FOUR,
              birthYear: item?.birthDate
                ? new Date(item?.birthDate).getFullYear()
                : item?.birthYear || null,
            },
          });

          if (existing) {
            console.log("existing");
            console.log(existing);

            // Skip creation, don't delete from TemporaryData
            continue;
          }

          const getFormReg = await tx.form.findFirst({
            where: { name: item?.form_reg },
          });

          const data = {
            form_reg: item?.form_reg || "",
            form_reg_log: `${item?.form_reg}-${year}`,
            regNumber: item?.regNumber || "",
            regDate: item?.regDate || new Date(),
            regEndDate: null,
            fullName: item?.fullName || "",
            firstName: item?.firstName || "",
            lastName: item?.lastName || "",
            fatherName: item?.fatherName || "",
            birthPlace: item?.birthPlace || "",
            workplace: item?.workplace || "",
            position: item?.position || "",
            pinfl: item?.pinfl || "",
            birthDate: item?.birthDate || null,
            birthYear: item?.birthDate
              ? new Date(item?.birthDate).getFullYear()
              : item?.birthYear || null,
            conclusionRegNum: "",
            nationality: item?.nationality || "",
            residence: item?.residence || "",
            model: MODEL_TYPE.REGISTRATION_FOUR,
            notes: item?.notes || "",
            additionalNotes: item?.additionalNotes || "",
            externalNotes: item?.externalNotes || "",
            accessStatus: item?.accessStatus || "ПРОВЕРКА",
            expired: item?.expired || null,
            completeStatus: MODEL_STATUS.WAITING,
            expiredDate: getFormReg?.month
              ? new Date(
                new Date(item?.regDate).setMonth(new Date(item?.regDate).getMonth() + getFormReg?.month)
              )
              : null,
            recordNumber: item?.recordNumber || "",
            executorId: item?.executorId || "",
            or_tab: item?.initiatorId || "",
          };

          const registration = await tx.registration.create({ data });

          // Remove from TemporaryData after success
          await tx.temporaryData.delete({ where: { id: item.id } });

          allIds.push(registration.id);
          count++;
        } catch (error) {
          console.error("Error creating registration_four:", error);
          continue; // Skip failed create
        }
      }

      const temporaryData_found_model_reg = await tx.temporaryData.findMany({
        where: {
          executorId: id,
          found_status: true,
          registration: { not: null },
          registration_four: null,
        },
      });

      // --- Create new registrations for not_found items ---
      for (const item of temporaryData_found_model_reg) {
        try {
          allIds.push(item.registration);
          // Remove from TemporaryData after success
          await tx.temporaryData.delete({ where: { id: item.id } });

          count++;
        } catch (error) {
          console.error("Error creating registration_four:", error);
          continue; // Skip failed create
        }
      }

      // --- Create sessions if needed ---
      let sessionsResult = null;
      if (type && allIds.length > 0) {
        const existingSessions = await tx.session.findMany({
          where: { adminId, type },
          select: { registrationId: true },
        });

        const existingRegistrationIds = new Set(
          existingSessions.map((session) => session.registrationId)
        );

        const lastSession = await tx.session.findFirst({
          where: { adminId, type },
          orderBy: { order: "desc" },
        });
        let nextOrder = lastSession ? lastSession.order + 1 : 1;

        const createdSessions = [];

        for (const registrationId of allIds) {
          if (existingRegistrationIds.has(registrationId)) {
            console.log(
              `Session for registration ${registrationId} already exists, skipping.`
            );
            continue; // Skip if session already exists
          }

          const registration = await tx.registration.findUnique({
            where: { id: registrationId },
          });

          if (registration) {
            const sessionData = {
              registrationId,
              regNumber: registration.regNumber,
              fullName: registration.fullName,
              firstName: registration.firstName,
              lastName: registration.lastName,
              fatherName: registration.fatherName,
              birthYear: registration.birthYear,
              birthDate: registration.birthDate,
              birthPlace: registration.birthPlace,
              workplace: registration.workplace,
              position: registration.position,
              residence: registration.residence,
              model: registration.model,
              notes: registration.notes,
              additionalNotes: registration.additionalNotes,
              externalNotes: registration.externalNotes,
              adminId,
              type,
              order: nextOrder++,
            };

            const newSession = await tx.session.create({ data: sessionData });
            createdSessions.push(newSession);
          }
        }

        sessionsResult = {
          createdSessions,
          skippedDuplicates: allIds.length - createdSessions.length,
        };
      }

      return { count, ids: allIds, sessionsResult };
    });

    return res.status(200).json({
      code: 200,
      message: "Temporary data processed successfully",
      total: result.count,
      ids: result.ids,
      ...(result.sessionsResult && {
        sessionsAdded: result.sessionsResult.createdSessions.length,
        skippedDuplicates: result.sessionsResult.skippedDuplicates,
        sessions: result.sessionsResult.createdSessions,
      }),
    });
  } catch (error) {
    console.log("error", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {

  }
};

/**
 * @swagger
 * /api/v1/registerFour/delete:
 *   delete:
 *     summary: Delete temporary data
 *     tags: [RegisterFour]
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Temporary Data ID
 *     responses:
 *       200:
 *         description: Temporary data deleted successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
exports.deleteTemporaryData = async (req, res) => {
  try {
    const { id } = req.query;
    console.log("id", id);

    await prisma.temporaryData.delete({ where: { id: id } });
    return res.status(200).json({
      code: 200,
      message: "Temporary data deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting temporary data:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {

  }
};

/**
 * @swagger
 * /api/v1/registerFour/deleteAllTemporaryDataByFilter:
 *   post:
 *     summary: Delete temporary data
 *     tags: [RegisterFour]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *                 description: Executor ID
 *               status:
 *                 type: string
 *                 description: Status
 *               found_status:
 *                 type: string
 *                 description: Found Status (found | not_found)
 *     responses:
 *       200:
 *         description: Temporary data deleted successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
exports.deleteAllTemporaryDataByFilter = async (req, res) => {
  try {
    let { status, found_status, id } = req.body;

    // Qidiruv shartlarini dinamik ravishda yaratish
    const filters = {
      AND: [],
    };

    if (status) {
      filters.AND.push({ status: { equals: status } });
    }

    if (id) {
      filters.AND.push({ executorId: { equals: id } });
    }

    if (found_status && found_status === "found") {
      filters.AND.push({ found_status: { equals: true } });
    }

    if (found_status && found_status === "not_found") {
      filters.AND.push({ found_status: { equals: false } });
    }

    await prisma.temporaryData.deleteMany({
      where: filters,
    });
    return res.status(200).json({
      code: 200,
      message: "List of temporary data deleted successfully",
    });
  } catch (error) {
    console.error("Error fetching temporary data list:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {

  }
};

/**
 * @swagger
 * /api/v1/registerFour/upload-manual:
 *   post:
 *     summary: "Add registration data manually"
 *     tags: [RegisterFour]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *                 description: "First name of the person"
 *                 example: "John"
 *               lastName:
 *                 type: string
 *                 description: "Last name of the person"
 *                 example: "Doe"
 *               fatherName:
 *                 type: string
 *                 description: "Father's name"
 *                 example: "Smith"
 *               birthYear:
 *                 type: integer
 *                 description: "Birth year"
 *                 example: 1990
 *               birthPlace:
 *                 type: string
 *                 description: "Birth place"
 *                 example: "New York"
 *               position:
 *                 type: string
 *                 description: "Job position"
 *                 example: "Engineer"
 *               residence:
 *                 type: string
 *                 description: "Current residence"
 *                 example: "California"
 *               form_reg:
 *                 type: string
 *                 description: "Form registration type"
 *                 example: "4"
 *               regDate:
 *                 type: string
 *                 description: "Registration date"
 *                 example: "2025-02-04T00:00:00.000Z"
 *               regNumber:
 *                 type: string
 *                 description: "Registration number"
 *                 example: "45-6"
 *               workplace:
 *                 type: string
 *                 description: "Workplace"
 *                 example: "Aviation"
 *               or_tab:
 *                 type: integer
 *                 description: "Initiator ID"
 *                 example: 1
 *     responses:
 *       200:
 *         description: "Registration added successfully"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *       400:
 *         description: "Invalid data or missing required fields"
 *       500:
 *         description: "Internal server error"
 */
exports.addManualRegistration = async (req, res) => {
  try {
    let {
      firstName,
      lastName,
      fatherName = "",
      birthYear,
      birthPlace = "",
      position = "",
      residence = "",
      form_reg = "4",
      regDate = "2025-02-04T00:00:00.000Z",
      regNumber = "45-6",
      workplace = "Aviation",
      or_tab,
      recordNumber = "",
      pinfl = "",
    } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !birthYear || !or_tab) {
      return res.status(400).json({
        code: 400,
        message:
          "Missing required fields: firstName, lastName, birthYear, or_tab",
      });
    }

    const checkRegistration = await prisma.temporaryData.findFirst({
      where: {
        firstName: firstName?.trim(),
        lastName: lastName?.trim(),
        fatherName: fatherName?.trim(),
        birthYear: parseInt(birthYear),
      },
    });

    if (checkRegistration) {
      return res.status(400).json({
        code: 400,
        message:
          "Missing required fields: firstName, lastName, birthYear, or_tab",
      });
    }

    // Validate and parse birthYear
    const parsedBirthYear = parseInt(birthYear);
    if (
      isNaN(parsedBirthYear) ||
      parsedBirthYear < 1900 ||
      parsedBirthYear > new Date().getFullYear()
    ) {
      return res.status(400).json({
        code: 400,
        message: "Invalid birth year",
      });
    }

    // Find initiator
    const initiator = await prisma.initiator.findFirst({
      where: {
        id: or_tab,
      },
    });

    if (!initiator) {
      return res
        .status(400)
        .json({ code: 400, message: "Initiator not found" });
    }

    // Find form registration
    const form_reg_check = await prisma.form.findFirst({
      where: {
        name: form_reg,
      },
    });

    if (!form_reg_check) {
      return res.status(400).json({ code: 400, message: "Form reg not found" });
    }

    // Calculate expiration date
    const expiredDate = new Date();
    expiredDate.setMonth(expiredDate.getMonth() + form_reg_check?.month);

    // Prepare data object
    const form_reg_log = `${form_reg}-${new Date(
      regDate?.trim()
    ).getFullYear()}`;

    const order = await prisma.temporaryData.count({
      where: {
        executorId: req.userId,
      },
    });

    const data = {
      order: order + 1,
      firstName: firstName?.trim(),
      lastName: lastName?.trim(),
      fatherName: fatherName
        ? fatherName?.trim() === " "
          ? ""
          : fatherName?.trim()
        : "",
      fullName: `${lastName?.trim()} ${firstName?.trim()} ${fatherName ? (fatherName?.trim() === " " ? "" : fatherName?.trim()) : ""
        }`,
      form_reg: form_reg ? form_reg?.trim() : "4",
      form_reg_log: form_reg_log,
      regNumber: regNumber ? regNumber?.trim() : null,
      regDate: regDate ? regDate?.trim() : null,
      birthYear: parsedBirthYear,
      birthPlace: birthPlace
        ? birthPlace?.trim() === " "
          ? ""
          : birthPlace?.trim()
        : "",
      workplace: workplace ? workplace?.trim() : null,
      position: position
        ? position?.trim() === " "
          ? ""
          : position?.trim()
        : "",
      model: "registration4",
      residence: residence
        ? residence?.trim() === " "
          ? ""
          : residence?.trim()
        : "",
      recordNumber: recordNumber ? recordNumber?.trim() : "",
      pinfl: pinfl ? pinfl?.trim() : "",
      accessStatus: "ПРОВЕРКА",
      status: "not_checked",
      found_status: false,
      expiredDate: expiredDate,
      executor: { connect: { id: req.userId } },
      Initiator: { connect: { id: initiator?.id } },
    };

    // Check for existing registrations
    const startOfYear = new Date(
      `${safeString(data?.birthYear)}-01-01T00:00:00.000Z`
    );
    const endOfYear = new Date(
      `${safeString(data?.birthYear)}-12-31T23:59:59.999Z`
    );

    const filter = {
      OR: [
        {
          firstName: data?.firstName,
          lastName: data?.lastName,
          fatherName: data?.fatherName ? data?.fatherName : "",
          birthDate: {
            gte: new Date(startOfYear.setHours(0, 0, 0, 0)),
            lte: new Date(endOfYear.setHours(23, 59, 59, 999)),
          },
        },
        {
          firstName: data?.firstName,
          lastName: data?.lastName,
          fatherName: data?.fatherName ? data?.fatherName : "",
          birthYear: data?.birthYear ? parseInt(data?.birthYear) : null,
        },
      ].filter(Boolean),
    };

    const initial_data = await prisma.registration.findMany({
      where: { ...filter },
      orderBy: {
        model: "asc",
      },
    });

    const registration = initial_data.find(
      (item) => item?.model === "registration"
    );

    const registration4 = initial_data.find(
      (item) => item?.model === "registration4"
    );

    if (registration) {
      data.registration = registration.id;
      data.found_status = true;
      console.log("FOUND registration");
    }

    if (registration4) {
      data.registration_four = registration4.id;
      data.found_status = true;
      console.log("FOUND registration4");
    }

    if (!registration && !registration4) {
      const relatives_data = await prisma.relatives.findFirst({
        where: filter,
      });
      if (relatives_data) {
        data.relatives = relatives_data.id;
        console.log("FOUND relatives");
      }
    }

    // Similarity search
    data.registrationSimilarity = [];
    data.registration_four_similarity = [];

    // Enable pg_trgm extension
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);

    // Perform similarity search
    const results = await prisma.$queryRaw`
  WITH combined_results AS (
    -- Search in Registration table
    SELECT 
      "id",
      "fullName",
      "regNumber",
      "form_reg",
      "birthDate",
      "birthYear",
      "workplace",
      "position",
      "birthPlace",
      "model",
      "accessStatus",
      "expired",
      "completeStatus",
      "recordNumber",
      "expiredDate",
      'registration' as source_table,
      NULL as registration_id,
      NULL as "registrationId", -- Registration doesn't have registrationId
      round(
        (
          (
            CASE 
              WHEN "firstName" IS NOT NULL AND ${data?.firstName} IS NOT NULL
                   AND TRIM("firstName") != '' AND TRIM(${data?.firstName}) != ''
              THEN (1 - (levenshtein(LOWER("firstName"), LOWER(${data?.firstName}))::numeric
                / GREATEST(char_length("firstName"), char_length(${data?.firstName}))))
              ELSE 0.5
            END +
            CASE 
              WHEN "lastName" IS NOT NULL AND ${data?.lastName} IS NOT NULL
                   AND TRIM("lastName") != '' AND TRIM(${data?.lastName}) != ''
              THEN (1 - (levenshtein(LOWER("lastName"), LOWER(${data?.lastName}))::numeric
                / GREATEST(char_length("lastName"), char_length(${data?.lastName}))))
              ELSE 0.5
            END +
            CASE 
              WHEN "fatherName" IS NOT NULL AND ${data?.fatherName} IS NOT NULL
                   AND TRIM("fatherName") != '' AND TRIM(${data?.fatherName}) != ''
              THEN (1 - (levenshtein(LOWER("fatherName"), LOWER(${data?.fatherName}))::numeric
                / GREATEST(char_length("fatherName"), char_length(${data?.fatherName}))))
              ELSE 0.5
            END
          ) / 3 * 100
        )::numeric,
        2
      ) AS similarity_percentage
    FROM "Registration"
    WHERE
      (
        (
          CASE 
            WHEN "firstName" IS NOT NULL AND ${data?.firstName} IS NOT NULL
                 AND "firstName" != '' AND ${data?.firstName} != ''
            THEN (1 - (levenshtein(LOWER("firstName"), LOWER(${data?.firstName}))::numeric
              / GREATEST(char_length("firstName"), char_length(${data?.firstName}))))
            ELSE 0.5
          END +
          CASE 
            WHEN "lastName" IS NOT NULL AND ${data?.lastName} IS NOT NULL
                 AND "lastName" != '' AND ${data?.lastName} != ''
            THEN (1 - (levenshtein(LOWER("lastName"), LOWER(${data?.lastName}))::numeric
              / GREATEST(char_length("lastName"), char_length(${data?.lastName}))))
            ELSE 0.5
          END +
          CASE 
            WHEN "fatherName" IS NOT NULL AND ${data?.fatherName} IS NOT NULL
                 AND "fatherName" != '' AND ${data?.fatherName} != ''
            THEN (1 - (levenshtein(LOWER("fatherName"), LOWER(${data?.fatherName}))::numeric
              / GREATEST(char_length("fatherName"), char_length(${data?.fatherName}))))
            ELSE 0.5
          END
        ) / 3
      ) > 0.75

    UNION ALL

    -- Search in Relatives table with Registration accessStatus check
    SELECT 
      r."id",
      r."fullName",
      r."regNumber",
      NULL as "form_reg", -- Relatives doesn't have form_reg
      r."birthDate",
      r."birthYear",
      r."workplace",
      r."position",
      r."birthPlace",
      r."model",
      reg."accessStatus", -- Get accessStatus from Registration
      reg."expired", -- Get expired from Registration
      NULL as "completeStatus", -- Relatives doesn't have completeStatus
      NULL as "recordNumber", -- Relatives doesn't have recordNumber
      NULL as "expiredDate", -- Relatives doesn't have expiredDate
      'relatives' as source_table,
      r."registrationId" as registration_id,
      r."registrationId", -- Include registrationId field
      round(
        (
          (
            CASE 
              WHEN r."firstName" IS NOT NULL AND ${data?.firstName} IS NOT NULL
                   AND TRIM(r."firstName") != '' AND TRIM(${data?.firstName}) != ''
              THEN (1 - (levenshtein(LOWER(r."firstName"), LOWER(${data?.firstName}))::numeric
                / GREATEST(char_length(r."firstName"), char_length(${data?.firstName}))))
              ELSE 0.5
            END +
            CASE 
              WHEN r."lastName" IS NOT NULL AND ${data?.lastName} IS NOT NULL
                   AND TRIM(r."lastName") != '' AND TRIM(${data?.lastName}) != ''
              THEN (1 - (levenshtein(LOWER(r."lastName"), LOWER(${data?.lastName}))::numeric
                / GREATEST(char_length(r."lastName"), char_length(${data?.lastName}))))
              ELSE 0.5
            END +
            CASE 
              WHEN r."fatherName" IS NOT NULL AND ${data?.fatherName} IS NOT NULL
                   AND TRIM(r."fatherName") != '' AND TRIM(${data?.fatherName}) != ''
              THEN (1 - (levenshtein(LOWER(r."fatherName"), LOWER(${data?.fatherName}))::numeric
                / GREATEST(char_length(r."fatherName"), char_length(${data?.fatherName}))))
              ELSE 0.5
            END
          ) / 3 * 100
        )::numeric,
        2
      ) AS similarity_percentage
    FROM "Relatives" r
    LEFT JOIN "Registration" reg ON r."registrationId" = reg."id"
    WHERE
      -- Check Registration's accessStatus conditions
      -- (reg."accessStatus" ILIKE '%cyzn%' OR reg."accessStatus" = 'dopusk')
      -- AND
      -- Name similarity conditions
      (
        (
          CASE 
            WHEN r."firstName" IS NOT NULL AND ${data?.firstName} IS NOT NULL
                 AND r."firstName" != '' AND ${data?.firstName} != ''
            THEN (1 - (levenshtein(LOWER(r."firstName"), LOWER(${data?.firstName}))::numeric
              / GREATEST(char_length(r."firstName"), char_length(${data?.firstName}))))
            ELSE 0.5
          END +
          CASE 
            WHEN r."lastName" IS NOT NULL AND ${data?.lastName} IS NOT NULL
                 AND r."lastName" != '' AND ${data?.lastName} != ''
            THEN (1 - (levenshtein(LOWER(r."lastName"), LOWER(${data?.lastName}))::numeric
              / GREATEST(char_length(r."lastName"), char_length(${data?.lastName}))))
            ELSE 0.5
          END +
          CASE 
            WHEN r."fatherName" IS NOT NULL AND ${data?.fatherName} IS NOT NULL
                 AND r."fatherName" != '' AND ${data?.fatherName} != ''
            THEN (1 - (levenshtein(LOWER(r."fatherName"), LOWER(${data?.fatherName}))::numeric
              / GREATEST(char_length(r."fatherName"), char_length(${data?.fatherName}))))
            ELSE 0.5
          END
        ) / 3
      ) > 0.75
  )
  SELECT * FROM combined_results
  ORDER BY similarity_percentage DESC
  LIMIT 50
`;
    if (data?.order === 31) {
      console.log("results", results);
      console.log("data", data);
    }
    results.map(async (item) => {
      if (item?.model === "registration") {
        data.registrationSimilarity.push(item);
      }
      if (item?.model === "registration4") {
        data.registration_four_similarity.push(item);
      }
      if (item?.model === "relative") {
        // data.registration = item.registration_id;
        data.registrationSimilarity.push(item);
      }
    });

    // Apply all the status checking logic
    const registration_123_first = Boolean(
      registration &&
      (registration?.accessStatus === "ДОПУСК" ||
        registration?.accessStatus?.toLowerCase().includes("снят")) &&
      registration?.expired > new Date() &&
      registration?.expired
    );

    const registration_4_first = Boolean(
      registration4 &&
      (registration4?.accessStatus === "ДОПУСК" ||
        registration4?.accessStatus?.toLowerCase().includes("снят")) &&
      registration4?.expired > new Date() &&
      registration4?.expired
    );

    // Second check
    if (registration_123_first && !registration4) {
      data.status = "accepted";
    }

    // Third check
    if (!registration && registration_4_first) {
      data.status = "accepted";
    }

    // Fourth check
    const registration_4_second = Boolean(
      registration4 &&
      !(
        registration4?.accessStatus === "ДОПУСК" ||
        registration4?.accessStatus?.toLowerCase().includes("снят")
      )
    );

    if (!registration && registration_4_second) {
      data.status = "not_accepted";
    }

    // Fifth check
    const registration_123_third = Boolean(
      registration &&
      !(
        registration?.accessStatus === "ДОПУСК" ||
        registration?.accessStatus?.toLowerCase().includes("снят")
      )
    );

    if (registration_123_third && !registration4) {
      data.status = "not_checked";
    }

    // Sixth check
    const registration_123_fourth = Boolean(
      registration &&
      (((registration?.accessStatus === "ДОПУСК" ||
        registration?.accessStatus?.toLowerCase().includes("снят")) &&
        compareDates(registration?.expired, new Date(), {
          granularity: "date",
        }) === -1) ||
        registration?.accessStatus === "ПРОВЕРКА")
    );

    if (registration_123_fourth && !registration4) {
      data.status = "not_checked";
    }

    // Seventh check
    const registration_4_fourth = Boolean(
      registration4 &&
      (((registration4?.accessStatus === "ДОПУСК" ||
        registration4?.accessStatus?.toLowerCase().includes("снят")) &&
        compareDates(registration4?.expired, new Date(), {
          granularity: "date",
        }) === -1) ||
        registration4?.accessStatus === "ПРОВЕРКА")
    );

    if (!registration && registration_4_fourth) {
      data.status = "not_checked";
      data.action_status = "fast";
    }

    // Eighth check
    if (registration_123_first && registration_4_first) {
      data.status = "accepted";
    }

    // Ninth check
    const registration_nineth = Boolean(
      registration &&
      (registration.accessStatus === "ДОПУСК" ||
        registration.accessStatus?.toLowerCase().includes("снят")) &&
      compareDates(registration?.expired, new Date(), {
        granularity: "date",
      }) === 1 &&
      registration.expired
    );

    const registration4_nineth = Boolean(
      registration4 &&
      (registration4.accessStatus === "ДОПУСК" ||
        registration4.accessStatus?.toLowerCase().includes("снят") ||
        registration4.accessStatus
          ?.toLowerCase()
          .includes("сп прекращена")) &&
      compareDates(registration4?.expired, new Date(), {
        granularity: "date",
      }) === -1 &&
      registration4.expired
    );

    if (registration_nineth && registration4_nineth) {
      data.status = "accepted";
    }

    // Tenth check
    const registration_tenth = Boolean(
      registration &&
      (registration.accessStatus === "ДОПУСК" ||
        registration.accessStatus?.toLowerCase().includes("снят")) &&
      compareDates(registration?.expired, new Date(), {
        granularity: "date",
      }) === 1 &&
      registration.expired
    );

    const registration4_tenth = Boolean(
      registration4 &&
      (((registration4.accessStatus === "ДОПУСК" ||
        registration4.accessStatus?.toLowerCase().includes("снят")) &&
        (compareDates(registration4?.expired, new Date(), {
          granularity: "date",
        }) === -1 ||
          !registration4.expired)) ||
        registration4.accessStatus === "ПРОВЕРКА")
    );

    if (registration_tenth && registration4_tenth) {
      data.status = "not_checked";
      data.action_status = "fast";
    }

    // 11th check
    const registration_123_11th = Boolean(
      registration &&
      (registration.accessStatus === "ДОПУСК" ||
        registration.accessStatus?.toLowerCase().includes("снят")) &&
      compareDates(registration?.expired, new Date(), {
        granularity: "date",
      }) === -1 &&
      registration.expired
    );

    if (registration_123_11th && registration_4_first) {
      data.status = "accepted";
    }

    // 13th check
    if (registration_123_third && registration_4_second) {
      data.status = "not_accepted";
    }

    // 14th check
    if (registration_123_third && registration_4_first) {
      data.status = "not_checked";
    }

    // 15th check
    if (registration_123_third && registration4_nineth) {
      data.status = "not_checked";
    }

    // 16th check
    if (registration_123_third && registration_4_fourth) {
      data.status = "not_checked";
      data.action_status = "fast";
    }

    // 17th check
    if (registration_123_first && registration_4_second) {
      data.status = "not_checked";
    }

    // 18th check
    if (registration_123_11th && registration_4_second) {
      data.status = "not_accepted";
    }

    // 19th check
    if (registration_123_11th && registration4_nineth) {
      data.status = "not_checked";
    }

    // 20th check - annulirovan
    const registration_20th = Boolean(
      registration &&
      registration.accessStatus?.toLowerCase().includes("аннулирован")
    );

    const registration4_20th = Boolean(
      registration4 &&
      registration4.accessStatus?.toLowerCase().includes("аннулирован")
    );

    if (registration_20th && registration4_20th) {
      data.status = "not_checked";
    }

    // Clean up data before saving
    delete data.form_reg_log;
    delete data.expiredDate;

    // Save to temporary data
    const savedData = await prisma.temporaryData.create({
      data: { ...data },
    });

    return res.json({
      code: 200,
      message: "Registration added successfully",
      data: savedData,
    });
  } catch (error) {
    console.error("Error processing manual registration:", error);
    return res
      .status(500)
      .json({ code: 500, message: "Internal Server Error" });
  }
};
