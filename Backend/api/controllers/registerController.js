const { PrismaClient, Prisma } = require("@prisma/client");
const { RegistrationSchema } = require("../helpers/validator");
const { v4: uuidv4, validate: isUuid } = require("uuid");
const getCurrentDateTime = require("../helpers/time");
const safeString = require("../helpers/safeString");
const compareDates = require("../helpers/compareDates");
const e = require("express");
const path = require("path");
const fs = require("fs");
const os = require("os");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const archiver = require("archiver");
const multer = require("multer");
const csvParser = require("csv-parser");
const AdmZip = require("adm-zip");
const crypto = require("crypto");
const { extractFull } = require('node-7z');
const { MODEL_TYPE } = require("../helpers/constants");
const { buildSearchQuery, buildCountQuery } = require("../helpers/globalSearchQueryBuilder");
const {
  getBackupModelConfigs,
  getBackupModelConfigByCsvPrefix,
  buildCsvHeader,
  serializeRowForCsv,
  parseImportedRow,
  areRowsEquivalent,
  isEmptyValue
} = require("../helpers/backupHelper");
const { equal } = require("assert");


// Register archiver-zip-encrypted for password-protected ZIP files
const archiverZipEncrypted = require('archiver-zip-encrypted');
archiver.registerFormat('zip-encrypted', archiverZipEncrypted);

// Initialize Prisma Client
const prisma = require('../../db/database');

function ensureWritableDirSync(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  fs.accessSync(dirPath, fs.constants.W_OK);
  return dirPath;
}

function getBackupTempDir(...subPaths) {
  const candidates = [];

  if (process.platform === 'win32') {
    candidates.push(path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'GSPApp', 'temp'));
  }

  candidates.push(path.join(os.tmpdir(), 'gspapp', 'temp'));

  let lastError = null;

  for (const baseDir of candidates) {
    try {
      const writableBaseDir = ensureWritableDirSync(baseDir);
      if (subPaths.length === 0) {
        return writableBaseDir;
      }
      return ensureWritableDirSync(path.join(writableBaseDir, ...subPaths));
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Unable to resolve writable backup temp directory');
}

// Generate secure random password for ZIP encryption
function generateSecurePassword(length = 16) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{}|;:,.<>?';
  let password = '';
  const randomBytes = crypto.randomBytes(length);

  for (let i = 0; i < length; i++) {
    password += charset[randomBytes[i] % charset.length];
  }

  return password;
}

// Local helper to format dates consistently for logs (no GMT/timezone text)
function formatDateForLog(value) {
  if (value === null || value === undefined) return "";
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return String(value);
    // Format as dd.mm.yyyy using local date components (server local timezone)
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  } catch (_e) {
    return String(value);
  }
}

/**
 * @swagger
 * /api/v1/register/create:
 *   post:
 *     summary: Create a new registration
 *     tags: [Registration]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               regNumber:
 *                 type: string
 *                 example: "2030-1"
 *               regDate:
 *                 type: string
 *                 format: date
 *                 example: "2024-01-20T00:00:00Z"
 *               endDate:
 *                 type: string
 *                 format: date
 *                 example: "2024-04-20T00:00:00Z"
 *               form:
 *                 type: string
 *                 example: "О"
 *               conclusionDate:
 *                 type: string
 *                 format: date
 *                 example: "2024-04-20T00:00:00Z"
 *               conclusionRegNum:
 *                 type: string
 *                 example: "2024-1"
 *               conclusion_compr:
 *                 type: string
 *                 example: ""
 *               first_name:
 *                 type: string
 *                 example: "Abdulla"
 *               last_name:
 *                 type: string
 *                 example: "Abvaliyev"
 *               father_name:
 *                 type: string
 *                 example: "Eshquvatovich"
 *               nationality:
 *                 type: string
 *                 example: "Uzbek"
 *               birthDate:
 *                 type: string
 *                 format: date
 *                 example: "1980-12-12T00:00:00Z"
 *               pinfl:
 *                 type: string
 *                 example: "12345678901234"
 *               birthPlace:
 *                 type: string
 *                 example: "Санкт-Петербург"
 *               residence:
 *                 type: string
 *                 example: "Санкт-Петербург"
 *               workplace:
 *                 type: string
 *                 example: "пенсионер"
 *               position:
 *                 type: string
 *                 example: "пенсионер"
 *               accessStatus:
 *                 type: string
 *                 example: "ОТКАЗ"
 *               notes:
 *                 type: string
 *                 example: "от отец - Пушкин"
 *               additionalNotes:
 *                 type: string
 *                 example: "text"
 *               moreNotes:
 *                 type: string
 *                 example: "text"
 *               recordNumber:
 *                 type: string
 *                 example: "3925h2dsa"
 *               or_tab:
 *                 type: string
 *                 example: "41d9a3c5-1042-4049-9872-f0f666297675"
 *     responses:
 *       201:
 *         description: Registration created successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
exports.createRegistration = async (req, res) => {
  try {
    // Foydalanuvchi kiritgan ma'lumotlarni olish
    const {
      regNumber,
      regDate,
      form_reg,
      conclusionRegNum,
      conclusion_compr,
      first_name,
      last_name,
      father_name,
      nationality,
      birthDate,
      birthYear,
      birthPlace,
      residence,
      workplace,
      position,
      pinfl,
      passport,
      completeStatus,
      accessStatus,
      model = "registration",
      notes,
      additionalNotes,
      externalNotes,
      recordNumber,
      or_tab,
    } = req.body;

    // Kiritilgan ma'lumotlarni tekshirish
    if (!regNumber || !father_name || !last_name || !first_name) {
      return res.status(400).json({
        code: 400,
        message:
          "Registration number, father name, first name and last name are required",
      });
    }
    if (model === "registration") {
      const checkRegNumber = await prisma.registration.findFirst({
        where: { regNumber: regNumber },
      });

      if (checkRegNumber) {
        return res
          .status(400)
          .json({ code: 400, message: "Registration number already exists" });
      }
    }

    const getWorkPlace = await prisma.workPlace.findFirst({
      where: { name: workplace },
    });

    if (!getWorkPlace) {
      return res
        .status(400)
        .json({ code: 400, message: "Workplace not found" });
    }

    const getInitiator = await prisma.initiator.findFirst({
      where: { id: or_tab },
    });

    if (!getInitiator) {
      return res
        .status(400)
        .json({ code: 400, message: "Initiator not found" });
    }

    const checkFormReg = await prisma.form.findFirst({
      where: { name: form_reg },
    });

    if (!checkFormReg) {
      return res.status(400).json({ code: 400, message: "Form not found" });
    }

    const checkFullName = await prisma.registration.findFirst({
      where: {
        lastName: last_name,
        firstName: first_name,
        fatherName: father_name,
        model: model,
      },
    });

    if (checkFullName) {
      return res
        .status(400)
        .json({ code: 400, message: "Full name already exists" });
    }

    // Ro'yxatga olish ma'lumotlarini tayyorlash
    const registrationData = {
      regNumber: regNumber ? regNumber.trim() : "",
      regDate: regDate ? new Date(regDate) : new Date(),
      expiredDate: regDate
        ? new Date(
          new Date(regDate).setMonth(
            new Date(regDate).getMonth() + checkFormReg?.month
          )
        )
        : new Date(
          new Date().setMonth(new Date().getMonth() + checkFormReg?.month)
        ),
      completeStatus: completeStatus ? completeStatus.trim() : "",
      form_reg: form_reg ? form_reg.trim() : "",
      form_reg_log: `${form_reg}-${new Date(regDate).getFullYear()}`,
      conclusionRegNum: conclusionRegNum ? conclusionRegNum.trim() : "",
      conclusion_compr: conclusion_compr ? conclusion_compr.trim() : "",
      fullName: `${last_name} ${first_name} ${father_name}`,
      firstName: first_name ? first_name.trim() : "",
      lastName: last_name ? last_name.trim() : "",
      fatherName: father_name ? father_name.trim() : "",
      birthPlace: birthPlace ? birthPlace.trim() : "",
      nationality: nationality ? nationality.trim() : "",
      residence: residence ? residence.trim() : "",
      workplace: workplace ? workplace.trim() : "",
      position: position ? position.trim() : "",
      accessStatus: accessStatus ? accessStatus.trim() : "",
      notes: notes ? notes.trim() : "",
      externalNotes: externalNotes ? externalNotes.trim() : "",
      pinfl: pinfl ? pinfl.trim() : "",
      passport: passport ? passport.trim() : "",
      model: model ? model.trim() : "",
      additionalNotes: additionalNotes ? additionalNotes.trim() : "",
      executorId: req.userId,
      recordNumber: recordNumber ? recordNumber.trim() : "",
      whoAdd: req.userId,
      or_tab: or_tab ? or_tab.trim() : "",
    };

    if (birthDate) {
      registrationData.birthDate = new Date(birthDate);
    }
    if (birthYear) {
      registrationData.birthYear = parseInt(birthYear);
    }

    // Validatsiya
    const validationResult = RegistrationSchema.safeParse(registrationData);
    if (!validationResult.success) {
      return res
        .status(400)
        .json({ code: 400, message: validationResult.error.message });
    }

    // Database transaction to create both registration and relative
    const result = await prisma.$transaction(async (prisma) => {
      // Ro'yxatga olishni bazaga qo'shish
      const newRegistration = await prisma.registration.create({
        data: registrationData,
      });

      // Automatically create a relative record with the same data
      // const relativeData = {
      //   registrationId: newRegistration.id,
      //   regNumber: regNumber ? regNumber.trim() : "",
      //   relationDegree: "Неизвестно",
      //   fullName: `${last_name} ${first_name} ${father_name}`,
      //   firstName: first_name ? first_name.trim() : "",
      //   lastName: last_name ? last_name.trim() : "",
      //   fatherName: father_name ? father_name.trim() : "",
      //   nationality: nationality ? nationality.trim() : "",
      //   birthPlace: birthPlace ? birthPlace.trim() : "",
      //   residence: residence ? residence.trim() : "",
      //   workplace: workplace ? workplace.trim() : "",
      //   position: position ? position.trim() : "",
      //   model: "relative",
      //   notes: notes ? notes.trim() : "",
      //   additionalNotes: additionalNotes ? additionalNotes.trim() : "",
      //   externalNotes: externalNotes ? externalNotes.trim() : "",
      //   accessStatus: accessStatus ? accessStatus.trim() : "",
      //   or_tab: or_tab ? or_tab.trim() : "",
      //   pinfl: pinfl ? pinfl.trim() : "",
      //   executorId: req.userId,
      //   whoAdd: req.userId,
      // };

      // // Add birth date and year if provided
      // if (birthDate) {
      //   relativeData.birthDate = new Date(birthDate);
      // }
      // if (birthYear) {
      //   relativeData.birthYear = parseInt(birthYear);
      // }

      // // Create the relative record
      // const newRelative = await prisma.relatives.create({
      //   data: relativeData,
      // });

      return { registration: newRegistration /*, relative: newRelative */ };
    });

    // Yangi ro'yxatga olishni qaytarish
    return res.status(201).json({
      code: 201,
      message: "Registration created successfully",
      data: result?.registration,
    });
  } catch (error) {
    console.error("Error during registration creation:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {
    // Prisma clientni uzish

  }
};

/**
 * @swagger
 * /api/v1/register/get/{id}:
 *   get:
 *     summary: Get registration by ID
 *     tags: [Registration]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Registration ID
 *     responses:
 *       200:
 *         description: Registration found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 regNumber:
 *                   type: string
 *                   example: "2024-1"
 *                 fullName:
 *                   type: string
 *                   example: "Пушкин А"
 *       404:
 *         description: Registration not found
 *       500:
 *         description: Internal server error
 */
exports.getRegistrationById = async (req, res) => {
  try {
    const { id } = req.params;
    // Ro'yxatga olishni ID orqali olish
    const registration = await prisma.registration.findUnique({
      where: { id: id },
      include: {
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
      },
    });

    if (!registration) {
      return res
        .status(404)
        .json({ code: 404, message: "Registration not found" });
    }

    const getLogFormReg = await prisma.registrationLog.findMany({
      select: {
        id: true,
        newValue: true,
        oldValue: true,
        createdAt: true,
      },
      where: {
        registrationId: id,
        fieldName: "form_reg",
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    let getLogFormRegResult = getLogFormReg
      // .slice(0, getLogFormReg.length > 1 ? -1 : undefined)
      .map((item, index) => {
        return index === 0
          ? `${item.oldValue}`
          : `${item.oldValue}-${getCurrentDateTime.getDateStringWithFormat(
            item.createdAt,
            "year"
          )}`;
        // return `${item.oldValue}-${getCurrentDateTime.getDateStringWithFormat(
        //   item.createdAt,
        //   "year"
        // )}`;
      })
      .join(",");
    if (getLogFormRegResult !== "") {
      getLogFormRegResult = getLogFormRegResult + "," + registration.form_reg;
    }
    return res.status(200).json({
      code: 200,
      message: "Registration found",
      data: registration,
      form_reg: getLogFormRegResult,
    });
  } catch (error) {
    console.error("Error fetching registration by ID:", error);
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
 * /api/v1/register/getProverka/{id}:
 *   get:
 *     summary: Get registration by ID
 *     tags: [Registration]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Registration ID
 *     responses:
 *       200:
 *         description: Registration found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 regNumber:
 *                   type: string
 *                   example: "2024-1"
 *                 fullName:
 *                   type: string
 *                   example: "Пушкин А"
 *       404:
 *         description: Registration not found
 *       500:
 *         description: Internal server error
 */
exports.getRegistrationByIdProverka = async (req, res) => {
  try {
    const { id } = req.params;

    // Ro'yxatga olishni ID orqali olish
    const registration = await prisma.registration.findUnique({
      where: { id: id },
      select: {
        regNumber: true,
        form_reg: true,
        regDate: true,
        regEndDate: true,
        expired: true,
        accessStatus: true,
      },
    });

    if (!registration) {
      const relative = await prisma.relatives.findUnique({
        where: { id: id },
        select: {
          regNumber: true,
          registration: {
            select: {
              form_reg: true,
              regDate: true,
              regEndDate: true,
              expired: true,
              accessStatus: true,
            },
          },
        },
      });

      if (relative) {
        // Combine relative's regNumber with registration data
        const responseData = {
          regNumber: relative.regNumber,
          form_reg: relative.registration?.form_reg,
          regDate: relative.registration?.regDate,
          regEndDate: relative.registration?.regEndDate,
          expired: relative.registration?.expired,
          accessStatus: relative.registration?.accessStatus,
        };

        return res.status(200).json({
          code: 200,
          message: "Registration found",
          data: responseData,
        });
      } else {
        return res
          .status(404)
          .json({ code: 404, message: "Registration not found" });
      }
    }

    return res.status(200).json({
      code: 200,
      message: "Registration found",
      data: registration,
    });
  } catch (error) {
    console.error("Error fetching registration by ID:", error);
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
 * /api/v1/register/list:
 *   post:
 *     summary: Get paginated list of registrations with filtering options
 *     tags: [Registration]
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
 *               regNumber:
 *                 type: string
 *                 description: Filter by registration number
 *               fullName:
 *                 type: string
 *                 description: Filter by full name
 *               firstName:
 *                 type: string
 *                 description: Filter by first name
 *               lastName:
 *                 type: string
 *                 description: Filter by last name
 *               fatherName:
 *                 type: string
 *                 description: Filter by father's name
 *               form_reg:
 *                 type: string
 *                 description: Filter by registration form
 *               birthDate:
 *                 type: string
 *                 format: date
 *                 description: Filter by birth date
 *               birthPlace:
 *                 type: string
 *                 description: Filter by birth place
 *               residence:
 *                 type: string
 *                 description: Filter by residence
 *               workplace:
 *                 type: string
 *                 description: Filter by workplace
 *               model:
 *                 type: string
 *                 description: Filter by model
 *                 default: registration
 *               position:
 *                 type: string
 *                 description: Filter by position
 *               recordNumber:
 *                 type: string
 *                 description: Filter by record number
 *     responses:
 *       200:
 *         description: Successfully retrieved list of registrations
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
 *                   example: "List of registrations"
 *                 total_pages:
 *                   type: integer
 *                   example: 5
 *                 total_registrations:
 *                   type: integer
 *                   example: 50
 *                 registrations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       regNumber:
 *                         type: string
 *                       fullName:
 *                         type: string
 *                       firstName:
 *                         type: string
 *                       lastName:
 *                         type: string
 *                       fatherName:
 *                         type: string
 *                       birthDate:
 *                         type: string
 *                         format: date
 *                       workplace:
 *                         type: string
 *                       position:
 *                         type: string
 *       400:
 *         description: Bad request - Invalid parameters
 *       500:
 *         description: Internal server error
 */
exports.getRegistrationList = async (req, res) => {
  try {
    let { pageNumber = 1, pageSize = 10 } = req.query;
    // Ensure we don't reference `data` before it's initialized.
    const body = req.body || {};
    const data = body.data || {};
    let {
      regNumber,
      fullName,
      firstName,
      lastName,
      fatherName,
      form_reg,
      birthDate,
      birthPlace,
      residence,
      workplace,
      model = data?.params?.model || "registration",
      position,
      passport,
      recordNumber,
      sort = data?.sort || null
    } = body;

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

    const normalizeNameSearchTerm = (value) => {
      if (value === null || value === undefined) return null;
      const term = String(value).replace(/%/g, "").replace(/\*/g, "%").trim();
      return term === "" ? null : term;
    };

    const normalizedFirstName = normalizeNameSearchTerm(firstName);
    const normalizedLastName = normalizeNameSearchTerm(lastName);
    const normalizedFatherName = normalizeNameSearchTerm(fatherName);

    // Qidiruv shartlarini dinamik ravishda va xavfsiz yarating
    const andConditions = [];

    if (regNumber) {
      andConditions.push({
        regNumber: {
          contains: String(regNumber)
            .replace(/%/g, "")
            .replace(/\*/g, "%")
            .trim(),
          mode: "insensitive",
        },
      });
    }

    if (fullName) {
      andConditions.push({
        fullName: {
          contains: String(fullName).replace(/%/g, "").replace(/\*/g, "%").trim(),
          mode: "insensitive",
        },
      });
    }

    if (form_reg) {
      andConditions.push({ form_reg: { contains: String(form_reg).trim(), mode: "insensitive" } });
    }

    if (birthDate) {
      andConditions.push({
        birthDate: {
          gte: new Date(`${parseInt(birthDate, 10) - 1}-01-01T00:00:00Z`),
          lt: new Date(`${parseInt(birthDate, 10) + 1}-01-01T00:00:00Z`),
        },
      });
    }

    if (birthPlace) {
      andConditions.push({
        birthPlace: {
          contains: String(birthPlace)
            .replace(/%/g, "")
            .replace(/\*/g, "%")
            .trim(),
          mode: "insensitive",
        },
      });
    }

    if (residence) {
      andConditions.push({
        residence: {
          contains: String(residence)
            .replace(/%/g, "")
            .replace(/\*/g, "%")
            .trim(),
          mode: "insensitive",
        },
      });
    }

    if (workplace) {
      andConditions.push({
        workplace: {
          contains: String(workplace)
            .replace(/%/g, "")
            .replace(/\*/g, "%")
            .trim(),
          mode: "insensitive",
        },
      });
    }

    if (position) {
      andConditions.push({
        position: {
          contains: String(position).replace(/%/g, "").replace(/\*/g, "%").trim(),
          mode: "insensitive",
        },
      });
    }

    if (recordNumber) {
      andConditions.push({
        recordNumber: {
          contains: String(recordNumber)
            .replace(/%/g, "")
            .replace(/\*/g, "%")
            .trim(),
          mode: "insensitive",
        },
      });
    }

    if (passport) {
      andConditions.push({
        passport: {
          contains: String(passport)
            .replace(/%/g, "")
            .replace(/\*/g, "%")
            .trim(),
          mode: "insensitive",
        },
      });
    }

    // Only add model filter when model is a non-empty string
    if (typeof model === "string" && model !== "") {
      andConditions.push({ model: { equals: model } });
    }

    if (normalizedFirstName || normalizedLastName || normalizedFatherName) {
      const nameSqlConditions = [];

      if (normalizedFirstName) {
        nameSqlConditions.push(
          Prisma.sql`lower(trim(coalesce("firstName", ''))) LIKE '%' || lower(trim(${normalizedFirstName})) || '%'`
        );
      }
      if (normalizedLastName) {
        nameSqlConditions.push(
          Prisma.sql`lower(trim(coalesce("lastName", ''))) LIKE '%' || lower(trim(${normalizedLastName})) || '%'`
        );
      }
      if (normalizedFatherName) {
        nameSqlConditions.push(
          Prisma.sql`lower(trim(coalesce("fatherName", ''))) LIKE '%' || lower(trim(${normalizedFatherName})) || '%'`
        );
      }

      if (nameSqlConditions.length > 0) {
        const matchingNameIds = await prisma.$queryRaw`
          SELECT "id"
          FROM "Registration"
          WHERE ${Prisma.join(nameSqlConditions, " AND ")}
        `;

        andConditions.push({ id: { in: matchingNameIds.map((item) => item.id) } });
      }
    }

    const filters = andConditions.length > 0 ? { AND: andConditions } : {};

    console.log(sort);

    let registrations;
    let totalRegistrations;

    // Parse sort into array of {field, direction} entries.
    // Accepts: single {field: 'asc'}, array [{field: 'asc'}, ...], or null.
    const parseSortEntries = (s) => {
      if (!s) return [];
      const parseOne = (obj) => {
        if (!obj || typeof obj !== "object") return null;
        const entries = Object.entries(obj);
        if (entries.length !== 1) return null;
        const [field, directionOrObj] = entries[0];
        let direction = "asc";
        if (typeof directionOrObj === "string") direction = directionOrObj;
        else if (directionOrObj && typeof directionOrObj === "object" && typeof directionOrObj.sort === "string") {
          direction = directionOrObj.sort;
        }
        return { field, direction: direction?.toLowerCase() === "desc" ? "desc" : "asc" };
      };
      if (Array.isArray(s)) return s.map(parseOne).filter(Boolean);
      const single = parseOne(s);
      return single ? [single] : [];
    };

    const sortEntries = parseSortEntries(sort);

    // Cyrillic-friendly ordering for name fields using Intl.Collator.
    const nameSortableFields = new Set(["fullName", "firstName", "lastName", "fatherName"]);
    const hasNameSort = sortEntries.some(e => nameSortableFields.has(e.field));
    const hasBirthDateSort = sortEntries.some((e) => e.field === "birthDate");

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

    if (sortEntries.length > 0 && (hasNameSort || hasBirthDateSort)) {
      // Need in-memory sort for Cyrillic names and birthDate fallback to birthYear.
      const toSelect = { id: true };
      for (const e of sortEntries) toSelect[e.field] = true;
      if (hasBirthDateSort) {
        toSelect.birthDate = true;
        toSelect.birthYear = true;
      }
      const allForSort = await prisma.registration.findMany({
        where: filters,
        select: toSelect,
      });

      const collator = new Intl.Collator(["ru", "uk", "kk", "uz"], {
        sensitivity: "base",
        numeric: true,
        usage: "sort",
      });

      allForSort.sort((a, b) => {
        for (const entry of sortEntries) {
          let cmp = 0;

          if (entry.field === "birthDate") {
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
              if (entry.direction === "desc") {
                cmp = -cmp;
              }
            }
          } else {
            const av = (a[entry.field] || "").toString();
            const bv = (b[entry.field] || "").toString();

            if (nameSortableFields.has(entry.field)) {
              cmp = collator.compare(av, bv);
            } else {
              cmp = av < bv ? -1 : av > bv ? 1 : 0;
            }

            if (cmp !== 0 && entry.direction === "desc") {
              cmp = -cmp;
            }
          }

          if (cmp !== 0) return cmp;
        }
        // Deterministic tie-breaker for stable pagination.
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });

      totalRegistrations = allForSort.length;

      const offset = (pageNumber - 1) * pageSize;
      const pageIds = allForSort.slice(offset, offset + pageSize).map((r) => r.id);

      if (pageIds.length === 0) {
        registrations = [];
      } else {
        const unordered = await prisma.registration.findMany({
          where: { id: { in: pageIds } },
          include: {
            executor: {
              select: { id: true, first_name: true, last_name: true, username: true },
            },
            Initiator: {
              select: { id: true, first_name: true, last_name: true },
            },
          },
        });
        const pos = new Map(pageIds.map((id, i) => [id, i]));
        unordered.sort((a, b) => pos.get(a.id) - pos.get(b.id));
        registrations = unordered;
      }
    } else {
      // DB-side ordering (no Cyrillic name fields or no sort at all)
      const orderBy = sortEntries.length > 0
        ? sortEntries.map(e => ({ [e.field]: e.direction }))
        : [{ createdAt: "desc" }];
      registrations = await prisma.registration.findMany({
        where: filters,
        skip: (pageNumber - 1) * pageSize,
        take: pageSize,
        orderBy,
        include: {
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
        },
      });
      totalRegistrations = await prisma.registration.count({ where: filters });
    }

    const totalPages = Math.ceil(totalRegistrations / pageSize);

    // Truncate notes and additionalNotes fields if they exceed 600 characters
    const processedRegistrations = registrations.map(registration => {
      const processed = { ...registration };
      if (processed.notes && processed.notes.length > 600) {
        processed.notes = processed.notes.slice(0, 600) + "...";
      }
      if (processed.additionalNotes && processed.additionalNotes.length > 600) {
        processed.additionalNotes = processed.additionalNotes.slice(0, 600) + "...";
      }
      if (processed.conclusion_compr && processed.conclusion_compr.length > 600) {
        processed.conclusion_compr = processed.conclusion_compr.slice(0, 600) + "...";
      }
      return processed;
    });

    return res.status(200).json({
      code: 200,
      message: "List of registrations",
      total_pages: totalPages,
      total_registrations: totalRegistrations,
      registrations: processedRegistrations,
    });
  } catch (error) {
    console.error("Error fetching registration list:", error);
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
 * /api/v1/register/updateregnumber/{id}:
 *   post:
 *     summary: Update registration number
 *     tags: [Registration]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Registration ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               regNumber:
 *                 type: string
 *                 example: "2024-1"
 *     responses:
 *       200:
 *         description: Registration number updated successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
exports.updateRegistrationNumber = async (req, res) => {
  const { id } = req.params;
  const { regNumber } = req.body;
  const executorId = req.userId;

  if (!regNumber || !id) {
    return res.status(400).json({ message: "regNumber and id are required" });
  }
  try {
    await prisma.$transaction(async (prisma) => {
      // Relatives jadvalidagi regNumberni yangilash
      await prisma.relatives.updateMany({
        where: { registrationId: id },
        data: { regNumber: regNumber },
      });

      // Registration jadvalidagi regNumberni yangilash
      const updatedRegistration = await prisma.registration.update({
        where: { id: id },
        data: { regNumber: regNumber },
      });

      // RegistrationLog jadvaliga yozuv qo'shish
      await prisma.registrationLog.create({
        data: {
          registrationId: id,
          fieldName: "regNumber",
          oldValue: updatedRegistration.regNumber,
          newValue: regNumber,
          executorId: executorId,
        },
      });
    });

    return res.status(200).json({
      message: "Registration number updated successfully",
    });
  } catch (error) {
    console.error("Error updating registration number:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  } finally {

  }
};

/**
 * @swagger
 * /api/v1/register/checkregnumber:
 *   get:
 *     summary: "Ro'yxatga olish raqamini tekshirish"
 *     tags: [Registration]
 *     parameters:
 *       - in: query
 *         name: regNumber
 *         schema:
 *           type: string
 *           default: "832-22х"
 *         required: true
 *         description: "Ro'yxatga olish raqami"
 *       - in: query
 *         name: id
 *         schema:
 *           type: string
 *           default: "1"
 *         description: "Ro'yxatga olish ID"
 *     responses:
 *       200:
 *         description: "Ro'yxatga olish raqami mavjud"
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
 *                   example: "Registration number exists"
 *       404:
 *         description: "Ro'yxatga olish raqami topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.checkRegistrationNumber = async (req, res) => {
  try {
    // Foydalanuvchi kiritgan ma'lumotlarni olish
    const { regNumber, id } = req.query;

    if (id !== "undefined") {
      const registration = await prisma.registration.findFirst({
        where: { id: id },
      });
      if (registration) {
        return res.status(200).json({
          code: 200,
          message: "Registration number not found",
        });
      }
      if (registration.regNumber === regNumber) {
        return res.status(200).json({
          code: 200,
          message: "Registration number not found",
        });
      }
      const registrationCheck = await prisma.registration.findFirst({
        where: { regNumber },
      });
      if (registrationCheck) {
        return res.status(400).json({
          code: 400,
          message: "Registration number exists",
        });
      }
      return res.status(200).json({
        code: 200,
        message: "Registration number not found",
      });
    }
    // Kiritilgan ma'lumotlarni tekshirish
    if (!regNumber) {
      return res
        .status(400)
        .json({ code: 400, message: "Registration number is required" });
    }

    // Ro'yxatga olish raqamini bazadan tekshirish
    const registration = await prisma.registration.findFirst({
      where: { regNumber },
    });

    // Agar ro'yxatga olish raqami topilsa
    if (registration) {
      return res.status(400).json({
        code: 400,
        message: "Registration number exists",
      });
    }

    // Agar ro'yxatga olish raqami topilmasa
    return res.status(200).json({
      code: 200,
      message: "Registration number not found",
    });
  } catch (error) {
    console.error("Error checking registration number:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {
    // Prisma clientni uzish

  }
};

/**
 * @swagger
 * /api/v1/register/findByNames:
 *   get:
 *     summary: "Ism, familiya va otasining ismini tekshirish"
 *     tags: [Registration]
 *     parameters:
 *       - in: query
 *         name: first_name
 *         schema:
 *           type: string
 *           default: "Азамат"
 *         required: false
 *         description: "Ism"
 *       - in: query
 *         name: last_name
 *         schema:
 *           type: string
 *           default: "Мустафаев"
 *         required: false
 *         description: "Familiya"
 *       - in: query
 *         name: father_name
 *         schema:
 *           type: string
 *           default: "Abdillo"
 *         required: false
 *         description: "Otasining ismi"
 *       - in: query
 *         name: fullName
 *         schema:
 *           type: string
 *           default: "Abdillo"
 *         required: false
 *         description: "Мустафаев Азамат Abdillo угли R626 R658 R690 R722 R754 R78"
 *     responses:
 *       200:
 *         description: "Abdollo, Abdullo va Abdillo"
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
 *                   example: "Names exist"
 *       404:
 *         description: "Ism, familiya yoki otasining ismi topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.findByNames = async (req, res) => {
  try {
    // Foydalanuvchi kiritgan ma'lumotlarni olish
    let { first_name, last_name, father_name, fullName } = req.query;

    first_name = first_name ? String(first_name).trim() : "";
    last_name = last_name ? String(last_name).trim() : "";
    father_name = father_name ? String(father_name).trim() : "";
    fullName = fullName ? String(fullName).trim() : "";
    // Dinamik qidiruv shartlarini yaratish
    const searchConditions = {};
    if (first_name) {
      searchConditions.firstName = { contains: first_name };
    }
    if (last_name) {
      searchConditions.lastName = { contains: last_name };
    }
    if (father_name) {
      searchConditions.fatherName = { contains: father_name };
    }
    if (fullName) {
      searchConditions.fullName = { contains: fullName };
    }

    // Ism, familiya va otasining ismini bazadan tekshirish
    const registration = await prisma.registration.findMany({
      take: 10,
      where: searchConditions,
      include: {
        executor: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
          },
        },
        Form: {
          select: {
            id: true,
            name: true,
          },
        },
        Initiator: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
          },
        },
      },
    });

    // Agar ism, familiya va otasining ismi topilsa
    if (registration.length > 0) {
      return res.status(200).json({
        code: 200,
        message: "Names exist",
        data: registration,
      });
    }

    // Agar ism, familiya yoki otasining ismi topilmasa
    return res.status(404).json({
      code: 404,
      message: "Names not found",
    });
  } catch (error) {
    console.error("Error checking names:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {
    // Prisma clientni uzish

  }
};

/**
 * @swagger
 * /api/v1/register/findByNamesTrgm:
 *   get:
 *     summary: "Ism, familiya va otasining ismini tekshirish"
 *     tags: [Registration]
 *     parameters:
 *       - in: query
 *         name: first_name
 *         schema:
 *           type: string
 *           default: "Азамат"
 *         required: false
 *         description: "Ism"
 *       - in: query
 *         name: last_name
 *         schema:
 *           type: string
 *           default: "Мустафаев"
 *         required: false
 *         description: "Familiya"
 *       - in: query
 *         name: father_name
 *         schema:
 *           type: string
 *           default: "Abdillo"
 *         required: false
 *         description: "Otasining ismi"
 *       - in: query
 *         name: fullName
 *         schema:
 *           type: string
 *           default: "Abdillo"
 *         required: false
 *         description: "Мустафаев Азамат Abdillo угли R626 R658 R690 R722 R754 R78"
 *     responses:
 *       200:
 *         description: "Abdollo, Abdullo va Abdillo"
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
 *                   example: "Names exist"
 *       404:
 *         description: "Ism, familiya yoki otasining ismi topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.findByNamesTrgm = async (req, res) => {
  try {
    // Extract and clean query parameters
    let { first_name, last_name, father_name, fullName } = req.query;

    first_name = first_name ? String(first_name).trim() : "";
    last_name = last_name ? String(last_name).trim() : "";
    father_name = father_name ? String(father_name).trim() : "";
    fullName = fullName ? String(fullName).trim() : "";

    // Generate raw SQL query for similarity-based search
    let similarityQuery = `
      SELECT *
      FROM "Registration"
      WHERE 1=1
    `;

    const params = [];
    if (first_name) {
      similarityQuery += ` AND similarity("firstName", $${params.length + 1
        }) > 0.4`;
      params.push(first_name);
    }
    if (last_name) {
      similarityQuery += ` AND similarity("lastName", $${params.length + 1
        }) > 0.4`;
      params.push(last_name);
    }
    if (father_name) {
      similarityQuery += ` AND similarity("fatherName", $${params.length + 1
        }) > 0.4`;
      params.push(father_name);
    }
    if (fullName) {
      similarityQuery += ` AND similarity(("firstName" || ' ' || "lastName" || ' ' || "fatherName"), $${params.length + 1
        }) > 0.4`;
      params.push(fullName);
    }

    similarityQuery += `
      ORDER BY
        GREATEST(
          similarity("firstName", COALESCE($1, '')),
          similarity("lastName", COALESCE($2, '')),
          similarity("fatherName", COALESCE($3, '')),
          similarity(("firstName" || ' ' || "lastName" || ' ' || "fatherName"), COALESCE($4, ''))
        ) DESC
      LIMIT 10;
    `;

    // Execute raw query
    const registration = await prisma.$queryRawUnsafe(
      similarityQuery,
      ...params
    );

    // Check and respond based on results
    if (registration.length > 0) {
      return res.status(200).json({
        code: 200,
        message: "Records found",
        data: registration,
      });
    }

    return res.status(404).json({
      code: 404,
      message: "No records found",
    });
  } catch (error) {
    console.error("Error finding records:", error);
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
 * /api/v1/register/update/{id}:
 *   put:
 *     summary: "Ro'yxatga olish ma'lumotlarini yangilash"
 *     tags: [Registration]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Ro'yxatga olish IDsi"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               regNumber:
 *                 type: string
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               fatherName:
 *                 type: string
 *               birthDate:
 *                 type: string
 *                 format: date
 *               workplace:
 *                 type: string
 *               position:
 *                 type: string
 *             example:
 *               regNumber: "2024-1"
 *               firstName: "Alsu"
 *               lastName: "Sharipova"
 *               fatherName: "Sharipov"
 *               birthDate: "1993-05-05"
 *               workplace: "Company"
 *               position: "Manager"
 *     responses:
 *       200:
 *         description: "Ro'yxatga olish ma'lumotlari muvaffaqiyatli yangilandi"
 *       400:
 *         description: "Xato: Barcha kiritishlar talab qilinadi yoki noto'g'ri ma'lumotlar"
 *       404:
 *         description: "Ro'yxatga olish topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.updateRegistration = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      regNumber,
      first_name,
      last_name,
      father_name,
      nationality,
      birthDate,
      birthYear,
      birthPlace,
      residence,
      workplace,
      position,
      pinfl,
      passport,
      accessStatus,
      additionalNotes,
      completeStatus,
      conclusionRegNum,
      conclusion_compr,
      form_reg,
      notes,
      model,
      or_tab,
      is_edit,
      recordNumber,
      externalNotes,
      regDate,
      regEndDate,
    } = req.body;

    if (!id) {
      return res
        .status(400)
        .json({ code: 400, message: "Registration ID is required" });
    }

    const currentRegistration = await prisma.registration.findUnique({
      where: { id },
      include: {
        Initiator: true,
        executor: true,
      },
    });
    if (!currentRegistration) {
      return res
        .status(404)
        .json({ code: 404, message: "Registration not found" });
    }

    const checkFullName = await prisma.registration.findFirst({
      where: {
        AND: [
          { lastName: last_name },
          { firstName: first_name },
          { fatherName: father_name },
          { model: currentRegistration?.model },
          { id: { not: id } },
        ],
      },
    });

    if (checkFullName) {
      return res
        .status(400)
        .json({ code: 400, message: "Full name already exists" });
    }

    const data = {};
    const logs = [];

    let fullName = ``;

    // Normalize dates for proper comparison when validating completed state
    // Validate date ordering using helper
    const cmpForValidation = compareDates(regDate, regEndDate, { granularity: 'date' });
    if (completeStatus === "COMPLETED" && (regEndDate == null || cmpForValidation === 1)) {
      return res
        .status(400)
        .json({ code: 400, message: "RegDate must be less than RegEndDate" });
    }

    const form = await prisma.form.findUnique({ where: { name: form_reg } });
    //////////////////////////////////////////////////
    if (is_edit) {
      if (!form) {
        return res.status(400).json({ code: 400, message: "Form not found" });
      }
      const nextMonthDate = new Date(
        new Date().setMonth(
          new Date().getMonth() + (form.month ? form.month : 1)
        )
      );
      data.expiredDate = nextMonthDate;
      // data.form_reg_log =
      //   currentRegistration.form_reg_log +
      //   ", " +
      //   form_reg +
      //   "-" +
      //   getCurrentDateTime.getDateStringWithFormat(regDate, "year");
      // if (
      //   (accessStatus === "ДОПУСК" ||
      //     accessStatus.toLowerCase().includes("снят")) &&
      //   completeStatus === "COMPLETED"
      // ) {
      //   data.expired = new Date(
      //     new Date(regEndDate).setMonth(new Date(regEndDate).getMonth() + form.length)
      //   );
      // } else {
      //   data.expired = null;
      // }
    }
    //////////////////////////////////////////////////
    if (
      (accessStatus === "ДОПУСК" ||
        accessStatus.toLowerCase().includes("снят")) &&
      currentRegistration?.accessStatus !== accessStatus
    ) {
      data.expired = new Date(
        new Date(regEndDate).setMonth(
          new Date(regEndDate).getMonth() + form.length
        )
      );
    } else {
      data.expired = null;
    }

    if (completeStatus !== "COMPLETED") {
      data.expired = null;
    }

    if (
      regNumber !== currentRegistration?.regNumber &&
      regNumber.trim() !== ""
    ) {
      data.regNumber = regNumber.trim();
      logs.push({
        registrationId: id,
        fieldName: "regNumber",
        oldValue: currentRegistration?.regNumber ? currentRegistration.regNumber : "",
        newValue: regNumber,
        executorId: req.userId,
      });
    }

    if (
      first_name !== currentRegistration?.firstName &&
      first_name.trim() !== ""
    ) {
      data.firstName = first_name ? first_name.trim() : "";
      logs.push({
        registrationId: id,
        fieldName: "firstName",
        oldValue: currentRegistration?.firstName ? currentRegistration.firstName : "",
        newValue: first_name ? first_name.trim() : "",
        executorId: req.userId,
      });
    }

    if (
      externalNotes !== currentRegistration?.externalNotes
    ) {
      data.externalNotes = externalNotes ? externalNotes.trim() : "";
      logs.push({
        registrationId: id,
        fieldName: "externalNotes",
        oldValue: currentRegistration?.externalNotes ? currentRegistration.externalNotes : "",
        newValue: externalNotes ? externalNotes : "",
        executorId: req.userId,
      });
    }
    if (
      nationality !== currentRegistration?.nationality
    ) {
      data.nationality = nationality ? nationality.trim() : "";
      logs.push({
        registrationId: id,
        fieldName: "nationality",
        oldValue: currentRegistration?.nationality ? currentRegistration.nationality : "",
        newValue: nationality ? nationality.trim() : "",
        executorId: req.userId,
      });
    }

    // if (
    //   model !== currentRegistration?.model &&
    //   model != null &&
    //   model.trim() !== ""
    // ) {
    //   data.model = model.trim();
    //   logs.push({
    //     registrationId: id,
    //     fieldName: "model",
    //     oldValue: currentRegistration?.model || "",
    //     newValue: model || "",
    //     executorId: req.userId,
    //   });
    // }

    if (
      birthPlace !== currentRegistration?.birthPlace
    ) {
      data.birthPlace = birthPlace ? birthPlace.trim() : "";
      logs.push({
        registrationId: id,
        fieldName: "birthPlace",
        oldValue: currentRegistration?.birthPlace ? currentRegistration.birthPlace : "",
        newValue: birthPlace ? birthPlace.trim() : "",
        executorId: req.userId,
      });
    }

    if (
      pinfl !== currentRegistration?.pinfl
    ) {
      data.pinfl = pinfl ? pinfl.trim() : "";
      logs.push({
        registrationId: id,
        fieldName: "pinfl",
        oldValue: currentRegistration?.pinfl ? currentRegistration.pinfl : "",
        newValue: pinfl ? pinfl.trim() : "",
        executorId: req.userId,
      });
    }

    if (
      passport !== currentRegistration?.passport
    ) {
      data.passport = passport ? passport.trim() : "";
      logs.push({
        registrationId: id,
        fieldName: "passport",
        oldValue: currentRegistration?.passport ? currentRegistration.passport : "",
        newValue: passport ? passport.trim() : "",
        executorId: req.userId,
      });
    }

    if (
      residence !== currentRegistration?.residence
    ) {
      data.residence = residence ? residence.trim() : "";
      logs.push({
        registrationId: id,
        fieldName: "residence",
        oldValue: currentRegistration?.residence ? currentRegistration.residence : "",
        newValue: residence ? residence.trim() : "",
        executorId: req.userId,
      });
    }

    if (
      last_name !== currentRegistration?.lastName
    ) {
      data.lastName = last_name ? last_name.trim() : "";
      logs.push({
        registrationId: id,
        fieldName: "lastName",
        oldValue: currentRegistration?.lastName ? currentRegistration.lastName : "",
        newValue: last_name ? last_name.trim() : "",
        executorId: req.userId,
      });
    }

    if (
      father_name !== currentRegistration?.fatherName
    ) {
      data.fatherName = father_name ? father_name.trim() : "";
      logs.push({
        registrationId: id,
        fieldName: "fatherName",
        oldValue: currentRegistration?.fatherName || "",
        newValue: father_name ? father_name.trim() : "",
        executorId: req.userId,
      });
    }

    if (compareDates(birthDate, currentRegistration?.birthDate, { granularity: 'date' }) !== 0) {
      data.birthDate = birthDate ? birthDate : null;
      logs.push({
        registrationId: id,
        fieldName: "birthDate",
        oldValue: formatDateForLog(currentRegistration?.birthDate),
        newValue: formatDateForLog(birthDate),
        executorId: req.userId,
      });
    }

    if (birthYear !== currentRegistration?.birthYear && currentRegistration?.model === MODEL_TYPE.REGISTRATION_FOUR) {
      data.birthYear = birthYear ? parseInt(birthYear) : null;
      logs.push({
        registrationId: id,
        fieldName: "birthYear",
        oldValue: safeString(currentRegistration?.birthYear),
        newValue: safeString(birthYear),
        executorId: req.userId,
      });
    }

    if (
      workplace !== currentRegistration?.workplace
    ) {
      data.workplace = workplace ? workplace.trim() : "";
      logs.push({
        registrationId: id,
        fieldName: "workplace",
        oldValue: currentRegistration?.workplace || "",
        newValue: workplace ? workplace.trim() : "",
        executorId: req.userId,
      });
    }

    if (
      position !== currentRegistration?.position
    ) {
      data.position = position ? position.trim() : "";
      logs.push({
        registrationId: id,
        fieldName: "position",
        oldValue: currentRegistration?.position || "",
        newValue: position ? position.trim() : "",
        executorId: req.userId,
      });
    }

    // Yangi qo'shilgan maydonlar uchun
    if (
      accessStatus !== currentRegistration?.accessStatus &&
      accessStatus.trim() !== ""
    ) {
      data.accessStatus = accessStatus ? accessStatus.trim() : "";
      logs.push({
        registrationId: id,
        fieldName: "accessStatus",
        oldValue: currentRegistration?.accessStatus || "",
        newValue: accessStatus ? accessStatus.trim() : "",
        executorId: req.userId,
      });
      if (
        (accessStatus === "ДОПУСК" ||
          accessStatus.toLowerCase().includes("снят")) &&
        completeStatus === "COMPLETED"
      ) {
        const nextDate = new Date(
          new Date(regEndDate).setFullYear(
            new Date(regEndDate).getFullYear() + (form.length ? form.length : 1)
          )
        );
        data.expired = nextDate;
      } else {
        data.expired = null;
      }
    }

    if (
      additionalNotes !== currentRegistration?.additionalNotes
    ) {
      data.additionalNotes = additionalNotes ? additionalNotes.trim() : "";
      logs.push({
        registrationId: id,
        fieldName: "additionalNotes",
        oldValue: currentRegistration?.additionalNotes || "",
        newValue: additionalNotes ? additionalNotes.trim() : "",
        executorId: req.userId,
      });
    }
    if (
      completeStatus !== currentRegistration?.completeStatus &&
      completeStatus.trim() !== ""
    ) {
      data.completeStatus = completeStatus ? completeStatus.trim() : "";
      logs.push({
        registrationId: id,
        fieldName: "completeStatus",
        oldValue: currentRegistration?.completeStatus || "",
        newValue: completeStatus ? completeStatus.trim() : "",
        executorId: req.userId,
      });
      if (completeStatus !== "COMPLETED") {
        data.expiredDate = new Date(
          new Date(regDate).setMonth(
            new Date(regDate).getMonth() + (form.month ? form.month : 1)
          )
        );
      } else {
        data.expiredDate = null;
      }
    }
    if (
      conclusionRegNum !== currentRegistration?.conclusionRegNum
    ) {
      data.conclusionRegNum = conclusionRegNum ? conclusionRegNum.trim() : "";
      logs.push({
        registrationId: id,
        fieldName: "conclusionRegNum",
        oldValue: currentRegistration?.conclusionRegNum || "",
        newValue: conclusionRegNum ? conclusionRegNum : "",
        executorId: req.userId,
      });
    }

    if (
      conclusion_compr !== currentRegistration?.conclusion_compr
    ) {
      data.conclusion_compr = conclusion_compr ? conclusion_compr.trim() : "";
      logs.push({
        registrationId: id,
        fieldName: "conclusion_compr",
        oldValue: currentRegistration?.conclusion_compr || "",
        newValue: conclusion_compr ? conclusion_compr.trim() : "",
        executorId: req.userId,
      });
    }

    if (
      form_reg !== currentRegistration?.form_reg &&
      regDate !== currentRegistration?.regDate &&
      regDate !== null &&
      form_reg != null
    ) {
      data.form_reg = form_reg ? form_reg.trim() : "";
      logs.push({
        registrationId: id,
        fieldName: "form_reg",
        oldValue: currentRegistration?.form_reg || "",
        newValue: form_reg ? form_reg.trim() : "",
        executorId: req.userId,
      });
      if (true) {
        data.form_reg_log =
          currentRegistration?.form_reg_log +
          ", " +
          form_reg +
          "-" +
          getCurrentDateTime.getDateStringWithFormat(
            currentRegistration?.regDate,
            "year"
          );
      }
      const nextMonthDateForm = new Date(
        new Date(regDate).setMonth(
          new Date(regDate).getMonth() + (form.month ? form.month : 1)
        )
      );
      data.expiredDate = nextMonthDateForm;
    }

    if (
      notes !== currentRegistration?.notes
    ) {
      if (notes === null) {
        data.notes = ""
      } else {
        data.notes = notes.trim();
      }
      logs.push({
        registrationId: id,
        fieldName: "notes",
        oldValue: currentRegistration?.notes || "",
        newValue: notes || "",
        executorId: req?.userId,
      });
    }

    if (isUuid(or_tab) && or_tab != null && or_tab.trim() !== "") {
      if (or_tab !== currentRegistration?.or_tab) {
        data.or_tab = or_tab.trim();
        const Initiator = await prisma.Initiator.findUnique({
          where: { id: or_tab },
        });
        if (!Initiator) {
          return res
            .status(400)
            .json({ code: 400, message: "Initiator not found" });
        }
        logs.push({
          registrationId: id,
          fieldName: "or_tab",
          oldValue:
            currentRegistration?.Initiator?.first_name +
            " " +
            currentRegistration?.Initiator?.last_name || "",
          newValue: Initiator?.first_name + " " + Initiator?.last_name || "",
          executorId: req?.userId,
        });
      }
    }

    if (
      recordNumber !== currentRegistration?.recordNumber
    ) {
      data.recordNumber = recordNumber ? recordNumber.trim() : "";
      logs.push({
        registrationId: id,
        fieldName: "recordNumber",
        oldValue: currentRegistration?.recordNumber || "",
        newValue: recordNumber ? recordNumber.trim() : "",
        executorId: req.userId,
      });
    }

    if (compareDates(regDate, currentRegistration?.regDate, { granularity: 'date' }) !== 0) {
      data.regDate = regDate ? regDate : null;
      if (completeStatus !== "COMPLETED") {
        data.expiredDate = new Date(
          new Date(regDate).setMonth(
            new Date(regDate).getMonth() + (form.month ? form.month : 1)
          )
        );
      }
      logs.push({
        registrationId: id,
        fieldName: "regDate",
        oldValue: safeString(currentRegistration?.regDate),
        newValue: safeString(regDate),
        executorId: req.userId,
      });
    }


    if (compareDates(regEndDate, currentRegistration?.regEndDate, { granularity: 'date' }) !== 0) {
      data.regEndDate = regEndDate ? regEndDate : null;
      logs.push({
        registrationId: id,
        fieldName: "regEndDate",
        oldValue: safeString(currentRegistration?.regEndDate),
        newValue: safeString(regEndDate),
        executorId: req.userId,
      });
      if (
        (accessStatus === "ДОПУСК" ||
          accessStatus.toLowerCase().includes("снят")) &&
        completeStatus === "COMPLETED"
      ) {
        const nextDate = new Date(
          new Date(regEndDate).setFullYear(
            new Date(regEndDate).getFullYear() + (form.length ? form.length : 1)
          )
        );
        data.expired = nextDate;
      } else {
        data.expired = null;
      }
    }

    if (Object.keys(data).length === 0) {
      return res
        .status(400)
        .json({ code: 400, message: "No changes to update" });
    }
    // console.log(Object.keys(data));


    if (isUuid(req.userId) && req.userId != null && Object.keys(data).some(key => ["regDate", "regEndDate", "form_reg"].includes(key))) {
      if (req.userId !== currentRegistration?.executorId) {
        data.executorId = req.userId;
        const admin = await prisma.admin.findUnique({
          where: { id: req.userId },
        });
        if (!admin) {
          return res
            .status(400)
            .json({ code: 400, message: "Admin not found" });
        }
        logs.push({
          registrationId: id,
          fieldName: "executorId",
          oldValue:
            currentRegistration?.Initiator?.first_name +
            " " +
            currentRegistration?.Initiator?.last_name || "",
          newValue: admin?.first_name + " " + admin?.last_name || "",
          executorId: req?.userId,
        });
      }
    }

    if (data.firstName || data.lastName || data.fatherName) {
      fullName = `${data.lastName ? data.lastName : currentRegistration?.lastName
        } ${data.firstName ? data.firstName : currentRegistration?.firstName} ${data.fatherName ? data.fatherName : currentRegistration?.fatherName
        }`;
      data.fullName = fullName;
    }
    if (compareDates(regDate, regEndDate, { granularity: 'date' }) === 1) {
      if (completeStatus === "COMPLETED") {
        return res
          .status(400)
          .json({ code: 400, message: "RegDate must be less than RegEndDate" });
      }
    }

    const transactionPromises = [
      prisma.registration.update({
        where: { id },
        data,
      }),
      data?.regNumber
        ? prisma.relatives.updateMany({
          where: { registrationId: id },
          data: { regNumber: data?.regNumber },
        })
        : null,
      data?.or_tab
        ? prisma.relatives.updateMany({
          where: { registrationId: id },
          data: { or_tab: data?.or_tab },
        })
        : null,
      ...logs.map((log) => prisma.registrationLog.create({ data: log })),
    ].filter(Boolean); // null qiymatlarni olib tashlash

    await prisma.$transaction(transactionPromises);

    return res.status(200).json({
      code: 200,
      message: "Registration updated successfully",
      data: data,
    });
  } catch (error) {
    console.error("Error updating registration:", error);
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
 * /api/v1/register/logs:
 *   post:
 *     summary: Get logs of a registration
 *     tags: [Registration]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *                 example: "1"
 *               field:
 *                 type: string
 *                 example: "regNumber"
 *               pageNumber:
 *                 type: integer
 *                 example: 1
 *               pageSize:
 *                 type: integer
 *                 example: 10
 *     responses:
 *       200:
 *         description: List of logs
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
 *                   example: "List of logs"
 *                 logs:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       fieldName:
 *                         type: string
 *                       oldValue:
 *                         type: string
 *                       newValue:
 *                         type: string
 *                       executorId:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
exports.getRegistrationLogs = async (req, res) => {
  try {
    const { id, field } = req.body;

    let { pageNumber = 1, pageSize = 10 } = req.body;

    pageNumber = parseInt(pageNumber);
    pageSize = parseInt(pageSize);

    if (!id) {
      return res
        .status(400)
        .json({ code: 400, message: "Registration ID is required" });
    }

    const skip = (pageNumber - 1) * pageSize;
    const take = pageSize;

    const logs = await prisma.registrationLog.findMany({
      where: {
        registrationId: id,
        fieldName: field ? field : undefined,
      },
      include: {
        executor: {
          select: {
            first_name: true,
            last_name: true,
          },
        },
      },
      skip,
      take,
      orderBy: {
        createdAt: "desc",
      },
    });

    const totalCount = await prisma.registrationLog.count({
      where: {
        registrationId: id,
        fieldName: field ? field : undefined,
      },
    });

    return res.status(200).json({
      code: 200,
      message: "List of logs",
      logs,
      totalCount,
    });
  } catch (error) {
    console.error("Error fetching registration logs:", error);
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
 * /api/v1/register/logGetById/{logId}:
 *   get:
 *     summary: Get a single log by log ID
 *     tags: [Registration]
 *     parameters:
 *       - in: path
 *         name: logId
 *         required: true
 *         schema:
 *           type: string
 *         description: Log ID
 *     responses:
 *       200:
 *         description: Log found
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
 *                   example: "Log found"
 *                 log:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     fieldName:
 *                       type: string
 *                     oldValue:
 *                       type: string
 *                     newValue:
 *                       type: string
 *                     executorId:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: Log not found
 *       500:
 *         description: Internal server error
 */
exports.getRegistrationLogById = async (req, res) => {
  try {
    const { logId } = req.params;

    // Logni ID orqali olish
    const log = await prisma.registrationLog.findUnique({
      where: { id: logId },
      include: {
        executor: {
          select: {
            first_name: true,
            last_name: true,
          },
        },
      },
    });

    if (!log) {
      return res.status(404).json({ code: 404, message: "Log not found" });
    }

    return res.status(200).json({
      code: 200,
      message: "Log found",
      log,
    });
  } catch (error) {
    console.error("Error fetching log by ID:", error);
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
 * /api/v1/register/globalSearch:
 *   post:
 *     summary: "Global qidiruvni amalga oshirish"
 *     tags: [Registration]
 *     parameters:
 *       - in: query
 *         name: pageNumber
 *         schema:
 *           type: integer
 *           default: 1
 *         required: false
 *         description: "Sahifa raqami"
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 10
 *         required: false
 *         description: "Har bir sahifadagi elementlar soni"
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *                 description: "Ism bo'yicha qidiruv"
 *               lastName:
 *                 type: string
 *                 description: "Familiya bo'yicha qidiruv"
 *               fatherName:
 *                 type: string
 *                 description: "Otasining ismi bo'yicha qidiruv"
 *               birthPlace:
 *                 type: string
 *                 description: "Tug'ilgan joy bo'yicha qidiruv"
 *               workPlace:
 *                 type: string
 *                 description: "Ish joyi bo'yicha qidiruv"
 *               regNumber:
 *                 type: string
 *                 description: "Registratsiya raqami bo'yicha qidiruv"
 *               formReg:
 *                 type: string
 *                 description: "Form registratsiyasi bo'yicha qidiruv"
 *               id:
 *                 type: string
 *                 description: "ID bo'yicha qidiruv"
 *               notes:
 *                 type: string
 *                 description: "Izoh bo'yicha qidiruv"
 *     responses:
 *       200:
 *         description: "Qidiruv natijalari muvaffaqiyatli qaytarildi"
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
 *                   example: "Qidiruv natijalari"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       modelName:
 *                         type: string
 *                       fullName:
 *                         type: string
 *                       firstName:
 *                         type: string
 *                       lastName:
 *                         type: string
 *                       fatherName:
 *                         type: string
 *                       birthPlace:
 *                         type: string
 *                       workPlace:
 *                         type: string
 *       400:
 *         description: "Xato: Noto'g'ri parametrlar"
 *       500:
 *         description: "Ichki server xatosi"
 */

exports.globalSearch = async (req, res) => {
  try {
    let { pageNumber = 1, pageSize = 10 } = req.query;
    let {
      firstName,
      firstNameStatus,
      lastName,
      lastNameStatus,
      fatherName,
      fatherNameStatus,
      birthPlace,
      birthPlaceStatus,
      workPlace,
      workPlaceStatus,
      regNumber,
      regNumberStatus,
      form_reg,
      pinfl,
      pinflStatus,
      passport,
      passportStatus,
      form_regStatus,
      birth_date_start,
      birth_date_end,
      birth_dateStatus,
      register_date_start,
      register_date_end,
      register_date_startStatus,
      register_end_date_start,
      register_end_date_end,
      register_end_dateStatus,
      accessStatus,
      accessStatusStatus,
      conclusionRegNum,
      conclusionRegNumStatus,
      residence,
      residenceStatus,
      completeStatus,
      completeStatusStatus,
      notes,
      notesStatus,
      model,
      modelStatus,
      or_tab,
      or_tabStatus,
      position,
      positionStatus,
      recordNumber,
      recordNumberStatus,
      executorId,
      executorIdStatus,
      sortField,
      sortOrder,
      sortFields,
    } = req.body;

    pageNumber = parseInt(pageNumber, 10);
    pageSize = parseInt(pageSize, 10);

    // Normalize sort params to array format: [{field, order}]
    let validSortFields = [];
    if (Array.isArray(sortFields) && sortFields.length > 0) {
      // New format: array of {field, order}
      validSortFields = sortFields
        .filter(e => e && typeof e.field === 'string' && e.field)
        .map(e => ({
          field: e.field,
          order: e.order && ['ASC', 'DESC'].includes(e.order.toUpperCase()) ? e.order.toUpperCase() : 'ASC',
        }));
    } else if (sortField) {
      // Legacy format: single sortField/sortOrder strings
      const validSortOrder = sortOrder && ['ASC', 'DESC'].includes(sortOrder.toUpperCase())
        ? sortOrder.toUpperCase()
        : 'ASC';
      validSortFields = [{ field: sortField, order: validSortOrder }];
    }

    let filter = "";

    if (firstName) {
      filter += `search_first_name := '${firstName.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (firstNameStatus) {
      filter += `search_first_name_status := '${safeString(firstNameStatus)}'::boolean, `;
    }

    if (lastName) {
      filter += `search_last_name := '${lastName.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (lastNameStatus) {
      filter += `search_last_name_status := '${safeString(lastNameStatus)}'::boolean, `;
    }

    if (fatherName) {
      filter += `search_father_name := '${fatherName.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (fatherNameStatus) {
      filter += `search_father_name_status := '${safeString(fatherNameStatus)}'::boolean, `;
    }

    if (birthPlace) {
      filter += `search_birth_place := '${birthPlace.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (birthPlaceStatus) {
      filter += `search_birth_place_status := '${safeString(birthPlaceStatus)}'::boolean, `;
    }

    if (workPlace) {
      filter += `search_work_place := '${workPlace.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (workPlaceStatus) {
      filter += `search_work_place_status := '${safeString(workPlaceStatus)}'::boolean, `;
    }

    if (pinfl) {
      filter += `search_pinfl := '${pinfl.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (pinflStatus) {
      filter += `search_pinfl_status := '${safeString(pinflStatus)}'::boolean, `;
    }

    if (passport) {
      filter += `search_passport := '${passport.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (passportStatus) {
      filter += `search_passport_status := '${safeString(passportStatus)}'::boolean, `;
    }

    if (regNumber) {
      filter += `search_reg_number := '${regNumber.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (regNumberStatus) {
      filter += `search_reg_number_status := '${safeString(regNumberStatus)}'::boolean, `;
    }

    if (form_reg) {
      filter += `search_form_reg := '${form_reg.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (form_regStatus) {
      filter += `search_form_reg_status := '${safeString(form_regStatus)}'::boolean, `;
    }

    if (notes) {
      filter += `search_notes := '${notes.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (notesStatus) {
      filter += `search_notes_status := '${safeString(notesStatus)}'::boolean, `;
    }

    if (register_date_start) {
      filter += `search_reg_date_start := '${register_date_start}', `;
    }

    if (register_date_end) {
      filter += `search_reg_date_end := '${register_date_end}', `;
    }

    if (register_date_startStatus) {
      filter += `search_reg_date_status := '${safeString(register_date_startStatus)}'::boolean, `;
    }

    if (register_end_date_start) {
      filter += `search_reg_end_date_start := '${register_end_date_start}', `;
    }

    if (register_end_date_end) {
      filter += `search_reg_end_date_end := '${register_end_date_end}', `;
    }

    if (register_end_dateStatus) {
      filter += `search_reg_end_date_status := '${safeString(register_end_dateStatus)}'::boolean, `;
    }

    if (birth_date_start) {
      filter += `search_birth_date_start := '${birth_date_start}', `;
    }

    if (birth_date_end) {
      filter += `search_birth_date_end := '${birth_date_end}', `;
    }

    if (birth_dateStatus) {
      filter += `search_birth_date_status := '${safeString(birth_dateStatus)}'::boolean, `;
    }

    if (conclusionRegNum) {
      filter += `search_conclusion_reg_num := '${conclusionRegNum.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (conclusionRegNumStatus) {
      filter += `search_conclusion_reg_num_status := '${safeString(conclusionRegNumStatus)}'::boolean, `;
    }

    if (residence) {
      filter += `search_residence := '${residence.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (residenceStatus) {
      filter += `search_residence_status := '${safeString(residenceStatus)}'::boolean, `;
    }

    //it is not working

    if (accessStatus) {
      filter += `search_access_status := '${accessStatus.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (accessStatusStatus) {
      filter += `search_access_status_status := '${safeString(accessStatusStatus)}'::boolean, `;
    }

    if (completeStatus) {
      filter += `search_complete_status := '${completeStatus.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (completeStatusStatus) {
      filter += `search_complete_status_status := '${safeString(completeStatusStatus)}'::boolean, `;
    }

    if (model) {
      filter += `search_model := '${model.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (modelStatus) {
      filter += `search_model_status := '${safeString(modelStatus)}'::boolean, `;
    }

    if (or_tab) {
      filter += `search_or_tab := '${or_tab.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (or_tabStatus) {
      filter += `search_or_tab_status := '${safeString(or_tabStatus)}'::boolean, `;
    }

    if (executorId) {
      filter += `search_executor_id := '${executorId.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (executorIdStatus) {
      filter += `search_executor_id_status := '${safeString(executorIdStatus)}'::boolean, `;
    }

    if (position) {
      filter += `search_position := '${position.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (positionStatus) {
      filter += `search_position_status := '${safeString(positionStatus)}'::boolean, `;
    }

    if (recordNumber) {
      filter += `search_record_number := '${recordNumber.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (recordNumberStatus) {
      filter += `search_record_number_status := '${safeString(recordNumberStatus)}'::boolean, `;
    }

    if (
      isNaN(pageNumber) ||
      isNaN(pageSize) ||
      pageNumber < 1 ||
      pageSize < 10
    ) {
      return res.status(400).json({ message: "Invalid pagination parameters" });
    }

    console.log("Search params:", req.body);

    // Build search parameters object for the query builder
    const searchParams = {
      firstName,
      firstNameStatus,
      lastName,
      lastNameStatus,
      fatherName,
      fatherNameStatus,
      birthPlace,
      birthPlaceStatus,
      workPlace,
      workPlaceStatus,
      pinfl,
      pinflStatus,
      passport,
      passportStatus,
      regNumber,
      regNumberStatus,
      form_reg,
      form_regStatus,
      notes,
      notesStatus,
      register_date_start,
      register_date_end,
      register_date_startStatus,
      register_end_date_start,
      register_end_date_end,
      register_end_dateStatus,
      birth_date_start,
      birth_date_end,
      birth_dateStatus,
      conclusionRegNum,
      conclusionRegNumStatus,
      residence,
      residenceStatus,
      accessStatus,
      accessStatusStatus,
      completeStatus,
      completeStatusStatus,
      model,
      modelStatus,
      or_tab,
      or_tabStatus,
      executorId,
      executorIdStatus,
      position,
      positionStatus,
      recordNumber,
      recordNumberStatus,
    };

    // Build and execute the query using inline SQL (replaces search_recordsv25 function)
    const query = buildSearchQuery(searchParams, pageNumber, pageSize, validSortFields);

    let results = await prisma.$queryRawUnsafe(query);
    results = results.map((item) => ({
      ...item,
      conclusion_compr: item.conclusion_compr?.length > 600 ? item.conclusion_compr.slice(0, 600) + "..." : item.conclusion_compr,
      notes: item.notes?.length > 600 ? item.notes.slice(0, 600) + "..." : item.notes,
      additionalNotes: item.additionalNotes?.length > 600 ? item.additionalNotes.slice(0, 600) + "..." : item.additionalNotes,
    }));

    return res.status(200).json({
      code: 200,
      message: "Search results",
      data: results,
    });
  } catch (error) {
    console.error("Error during global search:", error);
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
 * /api/v1/register/globalSearchCount:
 *   post:
 *     summary: "Global qidiruvni amalga oshirish"
 *     tags: [Registration]
 *     parameters:
 *       - in: query
 *         name: pageNumber
 *         schema:
 *           type: integer
 *           default: 1
 *         required: false
 *         description: "Sahifa raqami"
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 10
 *         required: false
 *         description: "Har bir sahifadagi elementlar soni"
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *                 description: "Ism bo'yicha qidiruv"
 *               lastName:
 *                 type: string
 *                 description: "Familiya bo'yicha qidiruv"
 *               fatherName:
 *                 type: string
 *                 description: "Otasining ismi bo'yicha qidiruv"
 *               birthPlace:
 *                 type: string
 *                 description: "Tug'ilgan joy bo'yicha qidiruv"
 *               workPlace:
 *                 type: string
 *                 description: "Ish joyi bo'yicha qidiruv"
 *               regNumber:
 *                 type: string
 *                 description: "Registratsiya raqami bo'yicha qidiruv"
 *               formReg:
 *                 type: string
 *                 description: "Form registratsiyasi bo'yicha qidiruv"
 *               id:
 *                 type: string
 *                 description: "ID bo'yicha qidiruv"
 *               notes:
 *                 type: string
 *                 description: "Izoh bo'yicha qidiruv"
 *     responses:
 *       200:
 *         description: "Qidiruv natijalari muvaffaqiyatli qaytarildi"
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
 *                   example: "Qidiruv natijalari"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       modelName:
 *                         type: string
 *                       fullName:
 *                         type: string
 *                       firstName:
 *                         type: string
 *                       lastName:
 *                         type: string
 *                       fatherName:
 *                         type: string
 *                       birthPlace:
 *                         type: string
 *                       workPlace:
 *                         type: string
 *       400:
 *         description: "Xato: Noto'g'ri parametrlar"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.globalSearchCount = async (req, res) => {
  try {
    let { pageNumber = 1, pageSize = 10 } = req.query;
    let {
      firstName,
      firstNameStatus,
      lastName,
      lastNameStatus,
      fatherName,
      fatherNameStatus,
      birthPlace,
      birthPlaceStatus,
      workPlace,
      workPlaceStatus,
      regNumber,
      regNumberStatus,
      form_reg,
      form_regStatus,
      birth_date_start,
      birth_date_end,
      birth_dateStatus,
      register_date_start,
      register_date_end,
      register_date_startStatus,
      register_end_date_start,
      register_end_date_end,
      register_end_dateStatus,
      accessStatus,
      accessStatusStatus,
      conclusionRegNum,
      conclusionRegNumStatus,
      completeStatus,
      completeStatusStatus,
      residence,
      residenceStatus,
      model,
      modelStatus,
      pinfl,
      pinflStatus,
      passport,
      passportStatus,
      or_tab,
      or_tabStatus,
      executorId,
      executorIdStatus,
      position,
      positionStatus,
      recordNumber,
      recordNumberStatus,
      notes,
      notesStatus,
    } = req.body;

    pageNumber = parseInt(pageNumber, 10);
    pageSize = parseInt(pageSize, 10);

    let filter = "";

    if (firstName) {
      filter += `search_first_name := '${firstName.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (firstNameStatus) {
      filter += `search_first_name_status := '${safeString(firstNameStatus)}'::boolean, `;
    }

    if (lastName) {
      filter += `search_last_name := '${lastName.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (lastNameStatus) {
      filter += `search_last_name_status := '${safeString(lastNameStatus)}'::boolean, `;
    }

    if (fatherName) {
      filter += `search_father_name := '${fatherName.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (fatherNameStatus) {
      filter += `search_father_name_status := '${safeString(fatherNameStatus)}'::boolean, `;
    }

    if (birthPlace) {
      filter += `search_birth_place := '${birthPlace.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (birthPlaceStatus) {
      filter += `search_birth_place_status := '${safeString(birthPlaceStatus)}'::boolean, `;
    }

    if (workPlace) {
      filter += `search_work_place := '${workPlace.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (workPlaceStatus) {
      filter += `search_work_place_status := '${safeString(workPlaceStatus)}'::boolean, `;
    }

    if (pinfl) {
      filter += `search_pinfl := '${pinfl.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (pinflStatus) {
      filter += `search_pinfl_status := '${safeString(pinflStatus)}'::boolean, `;
    }

    if (passport) {
      filter += `search_passport := '${passport.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (passportStatus) {
      filter += `search_passport_status := '${safeString(passportStatus)}'::boolean, `;
    }

    if (regNumber) {
      filter += `search_reg_number := '${regNumber.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (regNumberStatus) {
      filter += `search_reg_number_status := '${safeString(regNumberStatus)}'::boolean, `;
    }

    if (form_reg) {
      filter += `search_form_reg := '${form_reg.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (form_regStatus) {
      filter += `search_form_reg_status := '${safeString(form_regStatus)}'::boolean, `;
    }

    if (notes) {
      filter += `search_notes := '${notes.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (notesStatus) {
      filter += `search_notes_status := '${safeString(notesStatus)}'::boolean, `;
    }

    if (register_date_start) {
      filter += `search_reg_date_start := '${new Date(
        new Date(register_date_start).setUTCHours(0, 0, 0, 0)
      ).toISOString()}', `;
    }

    if (register_date_end) {
      filter += `search_reg_date_end := '${new Date(
        new Date(register_date_end).setUTCHours(23, 59, 59, 999)
      ).toISOString()}', `;
    }

    if (register_date_startStatus) {
      filter += `search_reg_date_status := '${safeString(register_date_startStatus)}'::boolean, `;
    }

    if (register_end_date_start) {
      filter += `search_reg_end_date_start := '${new Date(
        new Date(register_end_date_start).setUTCHours(0, 0, 0, 0)
      ).toISOString()}', `;
    }

    if (register_end_date_end) {
      filter += `search_reg_end_date_end := '${new Date(
        new Date(register_end_date_end).setUTCHours(23, 59, 59, 999)
      ).toISOString()}', `;
    }

    if (register_end_dateStatus) {
      filter += `search_reg_end_date_status := '${safeString(register_end_dateStatus)}'::boolean, `;
    }

    if (birth_date_start) {
      filter += `search_birth_date_start := '${new Date(
        new Date(birth_date_start).setUTCHours(0, 0, 0, 0)
      ).toISOString()}', `;
    }

    if (birth_date_end) {
      filter += `search_birth_date_end := '${new Date(
        new Date(birth_date_end).setUTCHours(23, 59, 59, 999)
      ).toISOString()}', `;
    }

    if (birth_dateStatus) {
      filter += `search_birth_date_status := '${safeString(birth_dateStatus)}'::boolean, `;
    }

    if (conclusionRegNum) {
      filter += `search_conclusion_reg_num := '${conclusionRegNum.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (conclusionRegNumStatus) {
      filter += `search_conclusion_reg_num_status := '${safeString(conclusionRegNumStatus)}'::boolean, `;
    }

    if (residence) {
      filter += `search_residence := '${residence.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (residenceStatus) {
      filter += `search_residence_status := '${safeString(residenceStatus)}'::boolean, `;
    }

    //it is not working

    if (accessStatus) {
      filter += `search_access_status := '${accessStatus.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (accessStatusStatus) {
      filter += `search_access_status_status := '${safeString(accessStatusStatus)}'::boolean, `;
    }

    if (completeStatus) {
      filter += `search_complete_status := '${completeStatus.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (completeStatusStatus) {
      filter += `search_complete_status_status := '${safeString(completeStatusStatus)}'::boolean, `;
    }

    if (model) {
      filter += `search_model := '${model.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (modelStatus) {
      filter += `search_model_status := '${safeString(modelStatus)}'::boolean, `;
    }

    if (or_tab) {
      filter += `search_or_tab := '${or_tab.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (or_tabStatus) {
      filter += `search_or_tab_status := '${safeString(or_tabStatus)}'::boolean, `;
    }

    if (executorId) {
      filter += `search_executor_id := '${executorId.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (executorIdStatus) {
      filter += `search_executor_id_status := '${safeString(executorIdStatus)}'::boolean, `;
    }

    if (position) {
      filter += `search_position := '${position.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (positionStatus) {
      filter += `search_position_status := '${safeString(positionStatus)}'::boolean, `;
    }

    if (recordNumber) {
      filter += `search_record_number := '${recordNumber.trim()
        .replace(/%/g, "")
        .replace(/\*/g, "%")}'::text, `;
    }

    if (recordNumberStatus) {
      filter += `search_record_number_status := '${safeString(recordNumberStatus)}'::boolean, `;
    }

    // Build search parameters object for the query builder
    const searchParams = {
      firstName,
      firstNameStatus,
      lastName,
      lastNameStatus,
      fatherName,
      fatherNameStatus,
      birthPlace,
      birthPlaceStatus,
      workPlace,
      workPlaceStatus,
      pinfl,
      pinflStatus,
      passport,
      passportStatus,
      regNumber,
      regNumberStatus,
      form_reg,
      form_regStatus,
      notes,
      notesStatus,
      register_date_start,
      register_date_end,
      register_date_startStatus,
      register_end_date_start,
      register_end_date_end,
      register_end_dateStatus,
      birth_date_start,
      birth_date_end,
      birth_dateStatus,
      conclusionRegNum,
      conclusionRegNumStatus,
      residence,
      residenceStatus,
      accessStatus,
      accessStatusStatus,
      completeStatus,
      completeStatusStatus,
      model,
      modelStatus,
      or_tab,
      or_tabStatus,
      executorId,
      executorIdStatus,
      position,
      positionStatus,
      recordNumber,
      recordNumberStatus,
    };

    // Build and execute the count query using inline SQL (replaces search_records_countv12 function)
    const countQuery = buildCountQuery(searchParams);

    const countResults = await prisma.$queryRawUnsafe(countQuery);
    const totalCount = parseInt(countResults[0]?.total_count, 10);

    return res.status(200).json({
      code: 200,
      message: "Search results count",
      totalCount: totalCount,
    });
  } catch (error) {
    console.error("Error during global search:", error);
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
 * /api/v1/register/getByIds:
 *   post:
 *     summary: Get registrations by list of IDs
 *     tags: [Registration]
 *     parameters:
 *       - in: query
 *         name: pageNumber
 *         schema:
 *           type: integer
 *           default: 1
 *         required: false
 *         description: "Sahifa raqami"
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 10
 *         required: false
 *         description: "Har bir sahifadagi elementlar soni"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["1", "2", "3"]
 *     responses:
 *       200:
 *         description: Registrations found
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
 *                   example: "Registrations found"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       regNumber:
 *                         type: string
 *                       fullName:
 *                         type: string
 *       404:
 *         description: Registrations not found
 *       500:
 *         description: Internal server error
 */
exports.getRegistrationsByIds = async (req, res) => {
  try {
    const { ids } = req.body;
    const { pageNumber = 1, pageSize = 10 } = req.query;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        code: 400,
        message: "IDs are required and should be an array",
      });
    }

    // Registratsiyalarni IDlar ro'yxati orqali olish
    const registrations = await prisma.registration.findMany({
      where: {
        id: { in: ids },
      },
      orderBy: {
        createdAt: "asc",
      },
      // take: 5,
    });

    // Relativlarni IDlar ro'yxati orqali olish
    const relatives = await prisma.relatives.findMany({
      where: {
        id: { in: ids },
      },
      orderBy: {
        createdAt: "asc",
      },
      // take: 5,
    });

    if (registrations.length === 0 && relatives.length === 0) {
      return res
        .status(404)
        .json({ code: 404, message: "Registrations and relatives not found" });
    }
    let data = [];
    let data2 = [];
    data = registrations.map((registration) => ({
      ...data,
      fullName: registration.fullName,
      firstName: registration.firstName,
      lastName: registration.lastName,
      fatherName: registration.fatherName,
      birthPlace: registration.birthPlace,
      birthDate: registration.birthDate,
      residence: registration.residence,
      birthYear: registration.birthYear,
      workplace: registration.workplace,
      regNumber: registration.regNumber,
      formReg: registration.formReg,
      id: registration.id,
      notes: registration.notes,
      model: registration.model,
      additionalNotes: registration.additionalNotes,
      excutor: registration.executorId,
      or_tab: registration.or_tab,
      updatedAt: registration.updatedAt,
    }));

    data2 = relatives.map((relative) => ({
      ...data2,
      fullName: relative.fullName,
      firstName: relative.firstName,
      lastName: relative.lastName,
      fatherName: relative.fatherName,
      birthPlace: relative.birthPlace,
      birthDate: relative.birthDate,
      birthYear: relative.birthYear,
      residence: relative.residence,
      workplace: relative.workplace,
      regNumber: relative.regNumber,
      formReg: relative.formReg,
      id: relative.id,
      notes: relative.notes,
      model: relative.model,
      additionalNotes: relative.additionalNotes,
      excutor: relative.executorId,
      or_tab: relative.or_tab,
      updatedAt: relative.updatedAt,
    }));

    return res.status(200).json({
      code: 200,
      message: "Registrations and relatives found",
      data: data.concat(data2),
    });
  } catch (error) {
    console.error("Error fetching registrations and relatives by IDs:", error);
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
 * /api/v1/registration/delete/{id}:
 *   delete:
 *     summary: "Ro'yxatga olishni ID bo'yicha o'chirish"
 *     tags: [Registration]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Ro'yxatga olish IDsi"
 *     responses:
 *       200:
 *         description: "Ro'yxatga olish muvaffaqiyatli o'chirildi"
 *       404:
 *         description: "Ro'yxatga olish topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.deleteRegistration = async (req, res) => {
  try {
    // Get the ID from the request parameters
    const { id } = req.params;
    const executorId = req.userId;

    // Check admin permissions
    const admin = await prisma.admin.findUnique({
      where: { id: executorId },
      include: {
        AdminServiceAccess: {
          include: {
            service: true
          }
        }
      }
    });

    if (!admin) {
      return res.status(404).json({
        code: 404,
        message: "Admin not found",
      });
    }

    // Check if admin is superAdmin - superAdmins can delete any registration
    const isSuperAdmin = admin.role === "superAdmin";

    // If not superAdmin, check for service code 4 access
    if (!isSuperAdmin) {
      const hasService4Access = admin.AdminServiceAccess.some(
        access => access.service?.code === 4
      );

      if (!hasService4Access) {
        return res.status(433).json({
          code: 433,
          message: "You don't have permission to delete registrations",
        });
      }
    }

    // Find the registration record
    const registration = await prisma.registration.findUnique({
      where: { id },
      include: {
        executor: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
          },
        },
        Initiator: true,
        RegistrationLog: true,
      },
    });

    if (!registration) {
      return res.status(404).json({
        code: 404,
        message: "Registration not found",
      });
    }

    // Check if the model is registration4 when not superAdmin
    if (!isSuperAdmin && registration.model !== "registration4") {
      return res.status(434).json({
        code: 434,
        message: "You can only delete registration4 type records",
      });
    }

    // Find related relatives
    const relatives = await prisma.relatives.findMany({
      where: { registrationId: id },
      include: {
        executor: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
          },
        },
      },
    });

    // Construct the transaction array
    const transactionOperations = [
      // Archive relatives if they exist
      ...relatives.map((relative) =>
        prisma.archive.create({
          data: {
            name: relative.fullName,
            data: relative,
            executorId: executorId,
          },
        })
      ),
      ...relatives.map((relative) =>
        prisma.relatives.delete({
          where: { id: relative.id },
        })
      ),

      // Archive the registration record
      prisma.archive.create({
        data: {
          name: registration.fullName,
          data: registration,
          executorId: executorId,
        },
      }),

      // Delete the registration record
      prisma.registration.delete({
        where: { id },
      }),
    ];

    // Run all operations in a single transaction
    await prisma.$transaction(transactionOperations);

    // Return success response
    return res.status(200).json({
      code: 200,
      message: "Registration deleted successfully",
    });
  } catch (err) {
    console.error("Error during registration deletion:", err);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: err.message,
    });
  } finally {
    // Disconnect Prisma client

  }
};;

/**
 * @swagger
 * /api/v1/register/workplaces:
 *   get:
 *     summary: "Ro'yxatga olish ish joylarini olish"
 *     tags: [Registration]
 *     parameters:
 *       - in: query
 *         name: workplace
 *         schema:
 *           type: string
 *         required: true
 *         description: "Ish joyi nomi"
 *       - in: query
 *         name: pageNumber
 *         schema:
 *           type: integer
 *           default: 1
 *         required: false
 *         description: "Sahifa raqami"
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 10
 *         required: false
 *         description: "Har bir sahifadagi elementlar soni"
 *     responses:
 *       200:
 *         description: "Ish joylari muvaffaqiyatli qaytarildi"
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
 *                   example: "Workplaces found"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *       404:
 *         description: "Ish joylari topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.getWorkPlaces = async (req, res) => {
  try {
    const { workplace, pageNumber = 1, pageSize = 5 } = req.query;

    // Sahifa raqami va o'lchamini raqamga aylantirish
    const page = parseInt(pageNumber, 10);
    const size = parseInt(pageSize, 10);

    if (isNaN(page) || isNaN(size) || page < 1 || size < 1 || size > 101) {
      return res
        .status(400)
        .json({ code: 400, message: "Invalid pagination parameters" });
    }

    // Ish joylarini qidirish
    const workPlaces = await prisma.registration.findMany({
      where: {
        workplace: {
          contains: workplace,
          mode: "insensitive",
        },
      },
      select: {
        workplace: true,
      },
      groupBy: {
        workplace: true,
      },
      orderBy: {
        workplace: "asc",
      },
      skip: (page - 1) * size,
      take: size,
    });

    if (workplace && workPlaces.length === 0) {
      return res
        .status(404)
        .json({ code: 404, message: "No workplaces found" });
    }

    return res.status(200).json({
      code: 200,
      message: "Workplaces found",
      data: workPlaces,
    });
  } catch (error) {
    console.error("Error fetching workplaces:", error);
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
 * /api/v1/auth/backup:
 *   post:
 *     summary: "Ma'lumotlarni eksport qilish (Backup)"
 *     description: "Barcha registratsiya va qarindoshlik ma'lumotlarini CSV yoki JSON formatida eksport qilish. Faqat superAdmin huquqiga ega foydalanuvchilar uchun."
 *     tags: [Auth]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               format:
 *                 type: string
 *                 enum: [csv, json]
 *                 default: csv
 *                 description: "Eksport format - CSV yoki JSON"
 *               compress:
 *                 type: boolean
 *                 default: false
 *                 description: "Fayllarni ZIP formatida siqish"
 *             example:
 *               format: "csv"
 *               compress: true
 *     responses:
 *       200:
 *         description: "Ma'lumotlar muvaffaqiyatli eksport qilindi"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     registrations:
 *                       type: integer
 *                       description: "Registratsiyalar soni"
 *                       example: 1500
 *                     relatives:
 *                       type: integer
 *                       description: "Qarindoshlar soni"
 *                       example: 3200
 *                     exportedAt:
 *                       type: string
 *                       format: date-time
 *                       description: "Eksport qilingan vaqt"
 *                 registrations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       regNumber:
 *                         type: string
 *                       fullName:
 *                         type: string
 *                       firstName:
 *                         type: string
 *                       lastName:
 *                         type: string
 *                       fatherName:
 *                         type: string
 *                       nationality:
 *                         type: string
 *                       pinfl:
 *                         type: string
 *                       birthDate:
 *                         type: string
 *                         format: date-time
 *                       birthPlace:
 *                         type: string
 *                       residence:
 *                         type: string
 *                       workplace:
 *                         type: string
 *                       position:
 *                         type: string
 *                       status:
 *                         type: string
 *                       completeStatus:
 *                         type: string
 *                       executor:
 *                         type: object
 *                         properties:
 *                           username:
 *                             type: string
 *                           first_name:
 *                             type: string
 *                           last_name:
 *                             type: string
 *                       Initiator:
 *                         type: object
 *                         properties:
 *                           first_name:
 *                             type: string
 *                           last_name:
 *                             type: string
 *                           father_name:
 *                             type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                 relatives:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       regNumber:
 *                         type: string
 *                       relationDegree:
 *                         type: string
 *                       fullName:
 *                         type: string
 *                       firstName:
 *                         type: string
 *                       lastName:
 *                         type: string
 *                       fatherName:
 *                         type: string
 *                       nationality:
 *                         type: string
 *                       pinfl:
 *                         type: string
 *                       birthDate:
 *                         type: string
 *                         format: date-time
 *                       birthPlace:
 *                         type: string
 *                       residence:
 *                         type: string
 *                       workplace:
 *                         type: string
 *                       position:
 *                         type: string
 *                       familyStatus:
 *                         type: string
 *                       registrationId:
 *                         type: string
 *                       executor:
 *                         type: object
 *                         properties:
 *                           username:
 *                             type: string
 *                           first_name:
 *                             type: string
 *                           last_name:
 *                             type: string
 *                       Initiator:
 *                         type: object
 *                         properties:
 *                           first_name:
 *                             type: string
 *                           last_name:
 *                             type: string
 *                           father_name:
 *                             type: string
 *                       registration:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           regNumber:
 *                             type: string
 *                           fullName:
 *                             type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *           application/zip:
 *             schema:
 *               type: string
 *               format: binary
 *               description: "ZIP fayl CSV fayllar bilan (format: csv va compress: true bo'lganda)"
 *       400:
 *         description: "Noto'g'ri so'rov parametrlari"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 400
 *                 message:
 *                   type: string
 *                   example: "Invalid request parameters"
 *       401:
 *         description: "Autentifikatsiya talab qilinadi"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 401
 *                 message:
 *                   type: string
 *                   example: "Authentication required"
 *       403:
 *         description: "Ruxsat etilmagan - faqat superAdmin huquqi"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 403
 *                 message:
 *                   type: string
 *                   example: "Access forbidden - superAdmin role required"
 *       500:
 *         description: "Ichki server xatosi"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Internal server error during export"
 *                 message:
 *                   type: string
 *                   example: "Error details"
 */
const BACKUP_BATCH_SIZE = 500;
const RESTORE_TRANSACTION_TIMEOUT_MS = 600000;
const VALID_RESTORE_MODES = new Set(['upsert', 'insert_only', 'update_only']);

const backupModelConfigs = getBackupModelConfigs();

function getBackupModelConfigForFile(fileName) {
  const lowered = String(fileName || '').toLowerCase();
  for (const config of backupModelConfigs) {
    const prefix = config.csvPrefix.toLowerCase();
    if (lowered === `${prefix}.csv` || lowered.startsWith(`${prefix}_`)) {
      return config;
    }
  }

  // Legacy compatibility for previously exported CSV names.
  if (lowered.startsWith('registrations_')) {
    return getBackupModelConfigByCsvPrefix('registrations');
  }
  if (lowered.startsWith('relatives_')) {
    return getBackupModelConfigByCsvPrefix('relatives');
  }

  return null;
}

function parseCsvFile(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

function normalizeRestoreMode(mode) {
  if (typeof mode !== 'string') {
    return 'upsert';
  }
  return VALID_RESTORE_MODES.has(mode) ? mode : 'upsert';
}

function buildJsonRowsMap(body) {
  const result = new Map();
  const modelsSection = body && typeof body.models === 'object' && body.models !== null ? body.models : null;

  for (const config of backupModelConfigs) {
    const candidates = [
      body?.[config.jsonKey],
      body?.[config.csvPrefix],
      body?.[config.prismaModel],
      modelsSection?.[config.jsonKey],
      modelsSection?.[config.csvPrefix],
      modelsSection?.[config.prismaModel]
    ];

    const rows = candidates.find((value) => Array.isArray(value));
    if (rows) {
      result.set(config.prismaModel, rows);
    }
  }

  return result;
}

function buildRestoreStats(rowsByModel) {
  const modelStats = {};

  for (const config of backupModelConfigs) {
    const total = (rowsByModel.get(config.prismaModel) || []).length;
    modelStats[config.jsonKey] = {
      total,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0
    };
  }

  return modelStats;
}

function buildWhereForMatcher(config, matcher, parsedRow) {
  const where = {};

  for (const key of matcher) {
    const value = parsedRow[key];
    if (isEmptyValue(value)) {
      return null;
    }
    where[key] = value;
  }

  return where;
}

async function findExistingRecord(tx, config, parsedRow) {
  const delegate = tx[config.prismaModel];
  const include = config.prismaModel === 'raportLink' ? { registrations: { select: { id: true } } } : undefined;

  const idValue = parsedRow[config.idField];
  if (!isEmptyValue(idValue) && (config.idField !== 'id' || isUuid(String(idValue)))) {
    const foundById = await delegate.findUnique({
      where: { [config.idField]: idValue },
      ...(include ? { include } : {})
    });
    if (foundById) {
      return { record: foundById, conflict: null };
    }
  }

  for (const matcher of config.uniqueMatchers || []) {
    const where = buildWhereForMatcher(config, matcher, parsedRow);
    if (!where) {
      continue;
    }

    const candidates = await delegate.findMany({
      where,
      take: 2,
      ...(include ? { include } : {})
    });

    if (candidates.length === 1) {
      return { record: candidates[0], conflict: null };
    }

    if (candidates.length > 1) {
      return {
        record: null,
        conflict: `Ambiguous conflict match by [${matcher.join(', ')}]`
      };
    }
  }

  return { record: null, conflict: null };
}

function buildWriteData(config, parsedRow) {
  const data = {};

  for (const field of config.fields) {
    if (field.key === config.idField) {
      continue;
    }

    if (field.key === 'createdAt' || field.key === 'updatedAt' || field.key === 'registrationIds') {
      continue;
    }

    let value = parsedRow[field.key];

    if (field.type === 'completeStatus' && isEmptyValue(value)) {
      value = 'WAITING';
    }

    if (field.type === 'sessionType' && isEmptyValue(value)) {
      value = 'SESSION';
    }

    if (value !== undefined) {
      data[field.key] = value;
    }
  }

  return data;
}

async function resolveRelativeRegistrationId(tx, parsedRow, registrationIdMap) {
  const originalRegistrationId = parsedRow.registrationId;
  if (isEmptyValue(originalRegistrationId)) {
    if (isEmptyValue(parsedRow.regNumber)) {
      return null;
    }

    const byRegNumber = await tx.registration.findMany({
      where: { regNumber: parsedRow.regNumber },
      select: { id: true },
      take: 2
    });

    if (byRegNumber.length === 1) {
      return byRegNumber[0].id;
    }

    return null;
  }

  const mappedRegistrationId = registrationIdMap.get(originalRegistrationId) || originalRegistrationId;

  const direct = await tx.registration.findUnique({
    where: { id: mappedRegistrationId },
    select: { id: true }
  });

  if (direct) {
    return direct.id;
  }

  if (!isEmptyValue(parsedRow.regNumber)) {
    const byRegNumber = await tx.registration.findMany({
      where: { regNumber: parsedRow.regNumber },
      select: { id: true },
      take: 2
    });

    if (byRegNumber.length === 1) {
      return byRegNumber[0].id;
    }
  }

  return null;
}

function buildRestoreResponseData(modelStats) {
  const response = {
    models: modelStats,
    restoredAt: new Date().toISOString()
  };

  if (modelStats.registrations) {
    response.registrations = modelStats.registrations;
  }

  if (modelStats.relatives) {
    response.relatives = modelStats.relatives;
  }

  return response;
}

async function restoreRowsByModel(rowsByModel, { mode = 'upsert', skipExisting = false } = {}) {
  const normalizedMode = normalizeRestoreMode(mode);
  const errors = [];
  const modelStats = buildRestoreStats(rowsByModel);
  const registrationIdMap = new Map();

  await prisma.$transaction(async (tx) => {
    for (const config of backupModelConfigs) {
      const delegate = tx[config.prismaModel];
      const rawRows = rowsByModel.get(config.prismaModel) || [];
      if (rawRows.length === 0) {
        continue;
      }

      const currentStats = modelStats[config.jsonKey];

      for (let index = 0; index < rawRows.length; index++) {
        try {
          const parsedRow = parseImportedRow(config, rawRows[index]);

          if (config.prismaModel === 'relatives') {
            const resolvedRegistrationId = await resolveRelativeRegistrationId(tx, parsedRow, registrationIdMap);
            if (!resolvedRegistrationId && !isEmptyValue(parsedRow.registrationId)) {
              currentStats.failed++;
              errors.push(`[${config.jsonKey}] row ${index}: registrationId '${parsedRow.registrationId}' is not resolvable`);
              continue;
            }
            parsedRow.registrationId = resolvedRegistrationId;
          }

          const existing = await findExistingRecord(tx, config, parsedRow);
          if (existing.conflict) {
            currentStats.failed++;
            errors.push(`[${config.jsonKey}] row ${index}: ${existing.conflict}`);
            continue;
          }

          if (existing.record) {
            if (normalizedMode === 'insert_only') {
              if (skipExisting) {
                currentStats.skipped++;
              } else {
                currentStats.failed++;
                errors.push(`[${config.jsonKey}] row ${index}: record already exists`);
              }

              if (config.prismaModel === 'registration' && !isEmptyValue(parsedRow.id)) {
                registrationIdMap.set(parsedRow.id, existing.record.id);
              }

              continue;
            }

            const writeData = buildWriteData(config, parsedRow);
            const isSame = areRowsEquivalent(config, parsedRow, existing.record);

            if (!isSame) {
              await delegate.update({
                where: { [config.idField]: existing.record[config.idField] },
                data: writeData
              });
              currentStats.updated++;
            } else {
              currentStats.skipped++;
            }

            if (config.prismaModel === 'raportLink' && Array.isArray(parsedRow.registrationIds)) {
              const relationIds = parsedRow.registrationIds.filter((value) => typeof value === 'string' && value.length > 0);
              const availableRegistrations = relationIds.length === 0
                ? []
                : await tx.registration.findMany({
                  where: { id: { in: relationIds } },
                  select: { id: true }
                });

              await tx.raportLink.update({
                where: { id: existing.record.id },
                data: {
                  registrations: {
                    set: availableRegistrations.map((registration) => ({ id: registration.id }))
                  }
                }
              });
            }

            if (config.prismaModel === 'registration' && !isEmptyValue(parsedRow.id)) {
              registrationIdMap.set(parsedRow.id, existing.record.id);
            }

            continue;
          }

          if (normalizedMode === 'update_only') {
            currentStats.skipped++;
            continue;
          }

          const writeData = buildWriteData(config, parsedRow);
          const createData = {
            ...writeData
          };

          if (
            !isEmptyValue(parsedRow[config.idField]) &&
            (config.idField !== 'id' || isUuid(String(parsedRow[config.idField])))
          ) {
            createData[config.idField] = parsedRow[config.idField];
          }

          const created = await delegate.create({ data: createData });
          currentStats.created++;

          if (config.prismaModel === 'raportLink' && Array.isArray(parsedRow.registrationIds)) {
            const relationIds = parsedRow.registrationIds.filter((value) => typeof value === 'string' && value.length > 0);
            const availableRegistrations = relationIds.length === 0
              ? []
              : await tx.registration.findMany({
                where: { id: { in: relationIds } },
                select: { id: true }
              });

            await tx.raportLink.update({
              where: { id: created.id },
              data: {
                registrations: {
                  set: availableRegistrations.map((registration) => ({ id: registration.id }))
                }
              }
            });
          }

          if (config.prismaModel === 'registration' && !isEmptyValue(parsedRow.id)) {
            registrationIdMap.set(parsedRow.id, created.id);
          }
        } catch (error) {
          currentStats.failed++;
          errors.push(`[${config.jsonKey}] row ${index}: ${error.message}`);
        }
      }
    }
  }, { timeout: RESTORE_TRANSACTION_TIMEOUT_MS });

  return {
    modelStats,
    errors
  };
}

/**
 * @swagger
 * /api/v1/auth/backup:
 *   post:
 *     summary: "Ma'lumotlarni eksport qilish (Backup)"
 *     description: "Barcha registratsiya va qarindoshlik ma'lumotlarini CSV yoki JSON formatida eksport qilish. Faqat superAdmin huquqiga ega foydalanuvchilar uchun."
 *     tags: [Auth]
 */
exports.exportData = async (req, res) => {
  try {
    const { format = 'csv' } = req.body || {};

    if (!['csv', 'json'].includes(format)) {
      return res.status(400).json({
        code: 400,
        message: 'Invalid format. Allowed formats: csv, json'
      });
    }

    if (format === 'json') {
      const payload = {};
      const counts = {};

      for (const config of backupModelConfigs) {
        const data = await prisma[config.prismaModel].findMany({
          ...(config.include ? { include: config.include } : {})
        });
        payload[config.jsonKey] = data;
        counts[config.jsonKey] = data.length;
      }

      return res.json({
        success: true,
        data: {
          counts,
          exportedAt: new Date().toISOString(),
          modelCount: backupModelConfigs.length
        },
        ...payload
      });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const tempDir = getBackupTempDir();
    const csvPaths = [];
    const exportedCounts = {};

    for (const config of backupModelConfigs) {
      const csvPath = path.join(tempDir, `${config.csvPrefix}_${timestamp}.csv`);
      csvPaths.push(csvPath);

      const csvWriter = createCsvWriter({
        path: csvPath,
        header: buildCsvHeader(config),
        encoding: 'utf8'
      });

      let skip = 0;
      let total = 0;

      while (true) {
        const batch = await prisma[config.prismaModel].findMany({
          ...(config.include ? { include: config.include } : {}),
          skip,
          take: BACKUP_BATCH_SIZE
        });

        if (batch.length === 0) {
          break;
        }

        await csvWriter.writeRecords(batch.map((row) => serializeRowForCsv(config, row)));

        total += batch.length;
        skip += batch.length;

        if (batch.length < BACKUP_BATCH_SIZE) {
          break;
        }
      }

      exportedCounts[config.jsonKey] = total;
    }

    const zipPassword = generateSecurePassword(16);
    const zipPath = path.join(tempDir, `export_${timestamp}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip-encrypted', {
      zlib: { level: 6 },
      encryptionMethod: 'aes256',
      password: zipPassword
    });

    output.on('close', () => {
      res.setHeader('X-Backup-Password', zipPassword);
      res.setHeader('X-Backup-Info', JSON.stringify({
        password: zipPassword,
        message: 'IMPORTANT: Save this password securely! It cannot be recovered if lost.',
        filename: `export_${timestamp}.zip`,
        exportedAt: new Date().toISOString(),
        models: backupModelConfigs.map((config) => config.jsonKey),
        counts: exportedCounts
      }));
      res.setHeader('Content-Disposition', `attachment; filename="export_${timestamp}.zip"`);
      res.setHeader('Content-Type', 'application/zip');

      res.sendFile(zipPath, (err) => {
        for (const filePath of [...csvPaths, zipPath]) {
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          } catch (cleanupError) {
            console.error('Error cleaning up backup files:', cleanupError);
          }
        }

        if (err && !res.headersSent) {
          console.error('Error sending ZIP file:', err);
          res.status(500).json({ error: 'Error sending backup file' });
        }
      });
    });

    archive.on('error', (archiveError) => {
      for (const filePath of [...csvPaths, zipPath]) {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (_) {
          // noop
        }
      }

      if (!res.headersSent) {
        res.status(500).json({
          error: 'Error creating backup archive',
          message: archiveError.message
        });
      }
    });

    archive.pipe(output);
    for (const filePath of csvPaths) {
      archive.file(filePath, { name: path.basename(filePath) });
    }
    archive.finalize();
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      error: 'Internal server error during export',
      message: error.message
    });
  }
};

/**
 * @swagger
 * /api/v1/auth/restore:
 *   post:
 *     summary: "Backup faylidan ma'lumotlarni tiklash (Restore)"
 *     tags: [Auth]
 */
exports.importData = async (req, res) => {
  try {
    if (req.body?.mode && !VALID_RESTORE_MODES.has(req.body.mode)) {
      return res.status(400).json({
        code: 400,
        message: `Invalid mode. Allowed: ${Array.from(VALID_RESTORE_MODES).join(', ')}`
      });
    }

    const mode = normalizeRestoreMode(req.body?.mode);
    const skipExisting = Boolean(req.body?.skipExisting);

    const rowsByModel = buildJsonRowsMap(req.body || {});
    if (rowsByModel.size === 0) {
      return res.status(400).json({
        code: 400,
        message: 'Invalid request body - expected at least one model array in payload'
      });
    }

    const { modelStats, errors } = await restoreRowsByModel(rowsByModel, {
      mode,
      skipExisting
    });

    res.json({
      success: true,
      message: 'Data restored successfully',
      data: buildRestoreResponseData(modelStats),
      ...(errors.length > 0 ? { errors } : {})
    });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({
      error: 'Internal server error during import',
      message: error.message
    });
  }
};

// Configure multer for file uploads
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      cb(null, getBackupTempDir('uploads'));
    } catch (error) {
      cb(error);
    }
  }
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed' || (file.originalname || '').toLowerCase().endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP files are allowed'));
    }
  }
});

/**
 * @swagger
 * /api/v1/auth/restore-from-zip:
 *   post:
 *     summary: "ZIP fayldan ma'lumotlarni tiklash (Restore from ZIP)"
 *     tags: [Auth]
 */
exports.restoreFromZip = async (req, res) => {
  const uploadedFilePath = req.file ? req.file.path : null;
  const extractDir = uploadedFilePath ? path.join(path.dirname(uploadedFilePath), `extract_${Date.now()}`) : null;
  const password = req.body?.password;

  try {
    if (!req.file) {
      return res.status(400).json({
        code: 400,
        message: 'No file uploaded. Please upload a ZIP file.'
      });
    }

    if (!password) {
      return res.status(400).json({
        code: 400,
        message: 'Password is required. Please provide the backup password.'
      });
    }

    if (!fs.existsSync(extractDir)) {
      fs.mkdirSync(extractDir, { recursive: true });
    }

    try {
      const sevenBin = require('7zip-bin').path7za;
      const stream = extractFull(uploadedFilePath, extractDir, {
        password,
        $bin: sevenBin
      });

      await new Promise((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
      });
    } catch (zipError) {
      try {
        if (fs.existsSync(extractDir)) {
          fs.rmSync(extractDir, { recursive: true, force: true });
        }
      } catch (cleanupErr) {
        console.error('Error cleaning up after ZIP extraction failure:', cleanupErr);
      }

      const errorMessage = zipError.message || String(zipError);
      return res.status(400).json({
        code: 400,
        message: errorMessage.includes('password') || errorMessage.includes('Wrong password')
          ? 'Incorrect password. Please check your backup password and try again.'
          : 'Failed to extract ZIP file. Please verify the password is correct.',
        error: errorMessage
      });
    }

    const allCsvFiles = fs.readdirSync(extractDir).filter((fileName) => fileName.toLowerCase().endsWith('.csv'));
    const rowsByModel = new Map();
    const ignoredFiles = [];

    for (const fileName of allCsvFiles) {
      const config = getBackupModelConfigForFile(fileName);
      if (!config) {
        ignoredFiles.push(fileName);
        continue;
      }

      const filePath = path.join(extractDir, fileName);
      const rows = await parseCsvFile(filePath);
      rowsByModel.set(config.prismaModel, rows);
    }

    if (rowsByModel.size === 0) {
      return res.status(400).json({
        code: 400,
        message: 'ZIP file does not contain any recognized backup CSV files.'
      });
    }

    const { modelStats, errors } = await restoreRowsByModel(rowsByModel, {
      mode: 'upsert',
      skipExisting: false
    });

    res.json({
      success: true,
      message: 'Data restored successfully from ZIP',
      data: {
        ...buildRestoreResponseData(modelStats),
        ignoredFiles
      },
      ...(errors.length > 0 ? { errors } : {})
    });
  } catch (error) {
    console.error('Restore from ZIP error:', error);
    res.status(500).json({
      error: 'Internal server error during restore from ZIP',
      message: error.message
    });
  } finally {
    try {
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        fs.unlinkSync(uploadedFilePath);
      }
      if (extractDir && fs.existsSync(extractDir)) {
        fs.rmSync(extractDir, { recursive: true, force: true });
      }
    } catch (cleanupError) {
      console.error('Error cleaning up temporary files:', cleanupError);
    }
  }
};

// Export multer upload middleware for use in routes
exports.uploadZipFile = upload.single('file');

exports.updateStatusAll = async (req, res) => {
  try {
    const {
      id,
      regEndDate,
      completeStatus,
      accessStatus
    } = req.body || {};
    const executorId = req.userId;

    // Fetch registrations to update (only model registration4)
    const registrations = await prisma.registration.findMany({
      where: {
        id: id,
        model: MODEL_TYPE.REGISTRATION_FOUR
      }
    });

    if (!registrations.length) {
      return res.status(404).json({
        status: 404,
        message: "No registrations found for given ids",
      });
    }

    const updateRegistration = await prisma.registration.findMany({
      where: {
        regNumber: registrations[0]?.regNumber,
        model: MODEL_TYPE.REGISTRATION_FOUR,
        OR: [
          { notes: null },
          { notes: "" },
        ],
      },
    });

    if (updateRegistration.length === 0) {
      return res.status(404).json({
        status: 404,
        message: "No registrations found for the given regNumber",
      });
    }

    // Validate enum for completeStatus if provided
    const allowedCompleteStatuses = ["WAITING", "IN_PROGRESS", "COMPLETED", "EXPIRED"];
    if (completeStatus && !allowedCompleteStatuses.includes(completeStatus)) {
      return res.status(400).json({
        status: 400,
        message: `Invalid completeStatus value. Allowed: ${allowedCompleteStatuses.join(", ")}`
      });
    }

    const getForm = await prisma.form.findFirst({
      where: {
        name: registrations[0]?.form_reg
      }
    });

    // Normalize incoming regEndDate to a date-only value (no time) and compute nextDate in UTC
    const base = new Date(regEndDate);
    const yearsToAdd = getForm.length ? getForm.length : 1;
    const nextDate = new Date(Date.UTC(
      base.getUTCFullYear() + yearsToAdd,
      base.getUTCMonth(),
      base.getUTCDate(),
      0, 0, 0, 0
    ));

    const results = await prisma.$transaction(async (tx) => {
      const updatedItems = [];

      for (const reg of updateRegistration) {
        const updateData = {};
        const logs = [];
        updateData.completeStatus = completeStatus;

        if (accessStatus === "ДОПУСК" || (typeof accessStatus === 'string' && accessStatus.includes("снят"))) {
          updateData.expired = nextDate;
          logs.push({
            registrationId: reg.id,
            fieldName: "expired",
            oldValue: reg.expired ? reg.expired.toISOString() : "",
            newValue: nextDate ? nextDate.toISOString() : "",
            executorId,
          });
        }

        if (true) {
          updateData.completeStatus = completeStatus;
          logs.push({
            registrationId: reg.id,
            fieldName: "completeStatus",
            oldValue: reg.completeStatus || "",
            newValue: completeStatus,
            executorId,
          });
        }
        if (true) {
          updateData.accessStatus = accessStatus;
          logs.push({
            registrationId: reg.id,
            fieldName: "accessStatus",
            oldValue: reg.accessStatus || "",
            newValue: accessStatus,
            executorId,
          });
        }
        if (true) {
          // Always overwrite regEndDate when performing this bulk update (store as date-only)
          const onlyDate = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 0, 0, 0, 0));
          updateData.regEndDate = onlyDate;
          if (true) {
            logs.push({
              registrationId: reg.id,
              fieldName: "regEndDate",
              oldValue: formatDateForLog(reg.regEndDate),
              newValue: formatDateForLog(regEndDate),
              executorId,
            });
          }
        }

        if (Object.keys(updateData).length === 0) {
          // Nothing to update for this registration
          updatedItems.push(reg);
          continue;
        }
        const updated = await tx.registration.update({
          where: { id: reg.id },
          data: updateData,
        });
        // Create logs
        for (const log of logs) {
          await tx.registrationLog.create({ data: log });
        }
        updatedItems.push(updated);
      }

      return updatedItems;
    });

    return res.status(200).json({
      status: 200,
      message: "Registration statuses updated successfully",
      count: results.length,
      // data: results,
    });
  } catch (error) {
    console.error("updateStatusAll error:", error);
    res.status(500).json({
      status: 500,
      message: "Internal server error during bulk update",
      error: error.message,
    });
  } finally {

  }
};

