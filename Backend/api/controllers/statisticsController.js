const { PrismaClient } = require("@prisma/client");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  VerticalAlign,
  BorderStyle,
  PageOrientation
} = require("docx");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { getDateDayString, formatRussianDateTime } = require("../helpers/time");
const safeString = require("../helpers/safeString");
const { SERVER_URL } = require("../helpers/constants");
const { group } = require("console");

// Initialize Prisma Client
const prisma = require('../../db/database');

// Helper: format a date in ru-RU using UTC to avoid local timezone day shifts
function toRuDateUTC(dateLike) {
  if (!dateLike) return "";
  const d = new Date(dateLike);
  return d.toLocaleDateString("ru-RU", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function parsePositiveInt(value, defaultValue) {
  if (value === undefined || value === null || value === "") return defaultValue;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function getMonthlyBuckets(count) {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const buckets = [];

  for (let i = count - 1; i >= 0; i--) {
    const point = new Date(Date.UTC(currentYear, currentMonth - i, 1));
    const y = point.getUTCFullYear();
    const m = point.getUTCMonth();

    buckets.push({
      month: m + 1,
      year: y,
      startDate: new Date(Date.UTC(y, m, 1)),
      endDate: new Date(Date.UTC(y, m + 1, 0)),
    });
  }

  return buckets;
}

function getYearlyBuckets(count) {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const buckets = [];

  for (let i = count - 1; i >= 0; i--) {
    const y = currentYear - i;

    buckets.push({
      month: null,
      year: y,
      startDate: new Date(Date.UTC(y, 0, 1)),
      endDate: new Date(Date.UTC(y, 11, 31)),
    });
  }

  return buckets;
}

/**
 * @swagger
 * /api/v1/statistics/counted_records:
 *   post:
 *     summary: "Get counted registration records grouped by month or year"
 *     tags: [Statistics]
 *     security:
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - x_axis
 *             properties:
 *               x_axis:
 *                 type: string
 *                 enum: [MONTH, YEAR]
 *                 example: MONTH
 *               month:
 *                 type: integer
 *                 default: 18
 *                 example: 18
 *               year:
 *                 type: integer
 *                 default: 6
 *                 example: 6
 *     responses:
 *       200:
 *         description: "Counted records fetched successfully"
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
 *                   example: Counted records fetched successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       month:
 *                         type: integer
 *                         nullable: true
 *                         example: 2
 *                       year:
 *                         type: integer
 *                         example: 2026
 *                       open_count:
 *                         type: integer
 *                         example: 10
 *                       close_count:
 *                         type: integer
 *                         example: 4
 *                       access_count:
 *                         type: integer
 *                         example: 2
 *                       otk1_count:
 *                         type: integer
 *                         example: 1
 *       400:
 *         description: "Validation error"
 *       500:
 *         description: "Internal server error"
 */
exports.countedRecords = async (req, res) => {
  try {
    const { x_axis, month, year } = req.body || {};
    const axis = typeof x_axis === "string" ? x_axis.toUpperCase().trim() : "";

    if (!["MONTH", "YEAR"].includes(axis)) {
      return res.status(400).json({
        code: 400,
        message: "x_axis must be one of: MONTH, YEAR",
      });
    }

    const monthCount = parsePositiveInt(month, 18);
    const yearCount = parsePositiveInt(year, 6);
    if (monthCount === null || yearCount === null) {
      return res.status(400).json({
        code: 400,
        message: "month and year must be positive integers",
      });
    }

    const buckets = axis === "MONTH" ? getMonthlyBuckets(monthCount) : getYearlyBuckets(yearCount);

    const data = await Promise.all(
      buckets.map(async (bucket) => {
        const { startDate, endDate } = bucket;

        const [open_count, close_count, access_count, otk1_count] = await Promise.all([
          prisma.registration.count({
            where: {
              regDate: { gte: startDate, lte: endDate },
            },
          }),
          prisma.registration.count({
            where: {
              regEndDate: { gte: startDate, lte: endDate },
            },
          }),
          prisma.registration.count({
            where: {
              regEndDate: { gte: startDate, lte: endDate },
              OR: [
                { accessStatus: "ДОПУСК" },
                { accessStatus: { contains: "снят" } },
                { accessStatus: { contains: "СНЯТ" } },
              ],
            },
          }),
          prisma.registration.count({
            where: {
              regEndDate: { gte: startDate, lte: endDate },
              AND: [{ accessStatus: { contains: "ОТКАЗ-1" } }],
            },
          }),
        ]);

        return {
          month: bucket.month,
          year: bucket.year,
          open_count,
          close_count,
          access_count,
          otk1_count,
        };
      })
    );

    return res.status(200).json({
      code: 200,
      message: "Counted records fetched successfully",
      data,
    });
  } catch (error) {
    console.error("Error fetching counted records:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * @swagger
 * /api/v1/statistics/reportStatements:
 *   post:
 *     summary: "IDlar massivi asosida hujjat yaratish"
 *     tags: [Statistics]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               workplaces:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Веймар", "Равон", "Туронэлектромонтаж АО"]
 *               startDate:
 *                 type: string
 *                 example: "2000-01-01T00:00:00.000Z"
 *               endDate:
 *                 type: string
 *                 example: "2024-12-31T23:59:59.999Z"
 *               form_reg_req:
 *                 type: string
 *                 example: "registration"
 *     responses:
 *       200:
 *         description: "Hujjat muvaffaqiyatli yaratildi va saqlandi"
 *       400:
 *         description: "Xato: IDlar talab qilinadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.reportStatements = async (req, res) => {
  try {
    let { startDate, endDate, workplaces } = req.body;
    const form_reg_req = "registration";

    // Normalize start/end to local day boundaries and keep as Date objects
    // Using toISOString here caused timezone shifts (off-by-one day).
    // Validate presence first
    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ code: 400, message: "Start and end dates are required" });
    }

    const start = startDate;
    const end = endDate;
    // Keep Date objects for Prisma queries (Prisma accepts JS Date)
    startDate = start;
    endDate = end;

    const statusReg = workplaces.includes("all") ? true : false;

    if (!workplaces || !Array.isArray(workplaces) || workplaces.length === 0) {
      return res
        .status(400)
        .json({ code: 400, message: "Workplaces are required" });
    }

    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ code: 400, message: "Start and end dates are required" });
    }

    workplaces = workplaces.filter((item, index, self) => {
      return self.indexOf(item) === index;
    });

    if (workplaces.includes("all")) {
      workplaces = await prisma.registration.findMany({
        // where: {
        //   name: { not: "Неизвестно" },
        // },
        select: {
          workplace: true,
        },
        orderBy: {
          workplace: "asc"
        },
        distinct: ["workplace"]
      });
      workplaces = workplaces.map((item) => item.workplace);
    }

    let statements = [];

    for (const workplace of workplaces) {
      try {
        const form_reg = await prisma.form.findMany({
          where: {
            type: { equals: form_reg_req },
            status: { equals: true },
          },
          select: {
            name: true,
          },
        });
        const form_reg_names = form_reg.map((item) => item.name);
        const open_count = await prisma.registration.count({
          where: {
            form_reg: { in: form_reg_names },
            workplace: { equals: workplace },
            regDate: { gte: startDate, lte: endDate },
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        const close_count = await prisma.registration.count({
          where: {
            form_reg: { in: form_reg_names },
            workplace: { equals: workplace },
            OR: [
              { regEndDate: { gte: startDate, lte: endDate } },
              // { regEndDate: null }
            ]
          }
        });

        const km_count = await prisma.registration.count({
          where: {
            form_reg: { in: form_reg_names },
            workplace: { equals: workplace },
            // regDate: { gte: startDate, lte: endDate },////////////////////////////////////qanday buladi
            regEndDate: { gte: startDate, lte: endDate },
            AND: [{ notes: { not: null } }, { notes: { not: "" } }],
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        const access_count = await prisma.registration.count({
          where: {
            form_reg: { in: form_reg_names },
            workplace: { equals: workplace },
            // regDate: { gte: startDate, lte: endDate },////////////////////////////////////qanday buladi
            regEndDate: { gte: startDate, lte: endDate },
            OR: [
              { accessStatus: "ДОПУСК" },
              { accessStatus: { contains: "снят" } },
              { accessStatus: { contains: "СНЯТ" } },
            ],
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        const eliminete_count = await prisma.registration.count({
          where: {
            form_reg: { in: form_reg_names },
            workplace: { equals: workplace },
            // regDate: { gte: startDate, lte: endDate },////////////////////////////////////qanday buladi
            regEndDate: { gte: startDate, lte: endDate },
            AND: [
              { accessStatus: { not: "ДОПУСК" } },
              { accessStatus: { not: { contains: "снят" } } },
              { accessStatus: { not: { contains: "СНЯТ" } } },
            ],
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        const otk1_count = await prisma.registration.count({
          where: {
            form_reg: { in: form_reg_names },
            workplace: { equals: workplace },
            // regDate: { gte: startDate, lte: endDate },////////////////////////////////////qanday buladi
            regEndDate: { gte: startDate, lte: endDate },
            AND: [{ accessStatus: { contains: "ОТКАЗ-1" } }],
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        const sum = open_count + close_count + km_count + access_count + eliminete_count + otk1_count;

        if (sum > 0) {
          statements.push({
            workplace: workplace,
            open_count: open_count,
            close_count: close_count,
            km_count: km_count,
            access_count: access_count,
            eliminete_count: eliminete_count,
            otk1_count: otk1_count,
          });
        }
      } catch (error) {
        console.log(error);
      }
    }

    const collator = new Intl.Collator(['uz-Cyrl', 'ru', 'uk', 'kk'], {
      sensitivity: 'base',
      numeric: true,
      usage: 'sort',
    });

    statements = statements.sort((a, b) => collator.compare(a.workplace || '', b.workplace || ''));

    if (statusReg) {
      statements.push({
        workplace: "ВСЕГО:",
        open_count: statements.reduce((acc, curr) => acc + curr.open_count, 0),
        close_count: statements.reduce((acc, curr) => acc + curr.close_count, 0),
        km_count: statements.reduce((acc, curr) => acc + curr.km_count, 0),
        access_count: statements.reduce(
          (acc, curr) => acc + curr.access_count,
          0
        ),
        eliminete_count: statements.reduce(
          (acc, curr) => acc + curr.eliminete_count,
          0
        ),
        otk1_count: statements.reduce((acc, curr) => acc + curr.otk1_count, 0),
      });
    }
    if (statusReg) {
      try {
        const form_reg_new = await prisma.form.findMany({
          where: {
            type: { equals: "registration4" },
            // status: { equals: true },
          },
          select: {
            name: true,
          },
        });

        const form_reg_names_new = form_reg_new.map((item) => item.name);

        const open_count = await prisma.registration.count({
          where: {
            form_reg: { in: form_reg_names_new },
            // workplace: { in: workplaces },
            regDate: { gte: startDate, lte: endDate },
          },
          orderBy: {
            createdAt: "desc",
          },
        });

        const close_count = await prisma.registration.count({
          where: {
            form_reg: { in: form_reg_names_new },
            // workplace: { in: workplaces },
            regEndDate: { gte: startDate, lte: endDate },
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        const km_count = await prisma.registration.count({
          where: {
            form_reg: { in: form_reg_names_new },
            // workplace: { in: workplaces },
            // regDate: { gte: startDate, lte: endDate },////////////////////////////////////qanday buladi
            regEndDate: { gte: startDate, lte: endDate },
            AND: [{ notes: { not: null } }, { notes: { not: "" } }],
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        const access_count = await prisma.registration.count({
          where: {
            form_reg: { in: form_reg_names_new },
            // workplace: { in: workplaces },
            // regDate: { gte: startDate, lte: endDate },////////////////////////////////////qanday buladi
            regEndDate: { gte: startDate, lte: endDate },
            OR: [
              { accessStatus: "ДОПУСК" },
              { accessStatus: { contains: "снят" } },
              { accessStatus: { contains: "СНЯТ" } },
            ],
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        const eliminete_count = await prisma.registration.count({
          where: {
            form_reg: { in: form_reg_names_new },
            // workplace: { in: workplaces },
            // regDate: { gte: startDate, lte: endDate },////////////////////////////////////qanday buladi
            regEndDate: { gte: startDate, lte: endDate },
            AND: [
              { accessStatus: { not: "ДОПУСК" } },
              { accessStatus: { not: { contains: "снят" } } },
              { accessStatus: { not: { contains: "СНЯТ" } } },
            ],
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        const otk1_count = await prisma.registration.count({
          where: {
            form_reg: { in: form_reg_names_new },
            // workplace: { in: workplaces },
            // regDate: { gte: startDate, lte: endDate },////////////////////////////////////qanday buladi
            regEndDate: { gte: startDate, lte: endDate },
            AND: [{ accessStatus: { contains: "ОТКАЗ-1" } }],
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        const sum = open_count + close_count + km_count + access_count + eliminete_count + otk1_count;
        if (true) {
          statements.push({
            workplace: `Иные объекты, ведомства, организации (СП Ф-${form_reg_names_new.join()})`,
            open_count: open_count,
            close_count: close_count,
            km_count: km_count,
            access_count: access_count,
            eliminete_count: eliminete_count,
            otk1_count: otk1_count,
          });
        }
      } catch (error) {
        console.log(error);
      }
    }

    const startDateDoc = toRuDateUTC(startDate);
    const endDateDoc = toRuDateUTC(endDate);

    if (statements.length <= 0) {
      return res.status(404).json({
        code: 404,
        message: "No data found for the specified criteria",
      });
    }

    if (statements.length === 0) {
      return res.status(404).json({
        code: 404,
        message: "No data found for the specified criteria",
      });

    }

    // Exclude placeholder workplace 'yuyu' from aggregated totals
    const totalSource = statements.filter(s => s.workplace !== 'ВСЕГО:');
    statements.push({
      workplace: `ВСЕГО (СП Ф-Р, О${statusReg ? `, У` : ``})`,
      open_count: totalSource.reduce((acc, curr) => acc + curr.open_count, 0),
      close_count: totalSource.reduce((acc, curr) => acc + curr.close_count, 0),
      km_count: totalSource.reduce((acc, curr) => acc + curr.km_count, 0),
      access_count: totalSource.reduce((acc, curr) => acc + curr.access_count, 0),
      eliminete_count: totalSource.reduce((acc, curr) => acc + curr.eliminete_count, 0),
      otk1_count: totalSource.reduce((acc, curr) => acc + curr.otk1_count, 0),
    });

    const doc = reportStatementsFunction(
      `Статистика по объектам, привлекаемым ведомствам, учреждениям и организациям (за период: ${startDateDoc} - ${endDateDoc}):`,
      statements
    );

    const combinedDoc = new Document({
      sections: [...doc.sections],
    });
    // Generate the document buffer
    const buffer = await Packer.toBuffer(combinedDoc);

    // Tasodifiy nom yaratish
    const randomFileName = `${uuidv4()}.docx`;
    const filePath = path.join(__dirname, "../../uploads", randomFileName);

    // Save the document to the file system
    console.log(req.userId);

    const raport = await prisma.raport.create({
      data: {
        name: "отчет по ведомствам",
        executorId: req.userId,
        link: SERVER_URL + "/api/v1/download/" + randomFileName,
        notes: "test",
      },
    });
    await prisma.raportLink.create({
      data: {
        raportId: raport.id,
        code: "test",
        delete: true,
        display: false,
      },
    });

    fs.writeFileSync(filePath, buffer);

    return res.status(200).json({
      code: 200,
      message: "Document generated and saved successfully",
      link: SERVER_URL + "/api/v1/download/" + randomFileName,
    });

  } catch (error) {
    console.log("error");
    console.error("Error generating report:", error);
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
 * /api/v1/statistics/reportFromForm:
 *   post:
 *     summary: "IDlar massivi asosida hujjat yaratish"
 *     tags: [Statistics]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               workplaces:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Веймар", "Равон", "Туронэлектромонтаж АО"]
 *               startDate:
 *                 type: string
 *                 example: "2000-01-01T00:00:00.000Z"
 *               endDate:
 *                 type: string
 *                 example: "2024-12-31T23:59:59.999Z"
 *               form_reg_req:
 *                 type: string
 *                 example: "registration"
 *     responses:
 *       200:
 *         description: "Hujjat muvaffaqiyatli yaratildi va saqlandi"
 *       400:
 *         description: "Xato: IDlar talab qilinadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.reportFromForm = async (req, res) => {
  try {
    // const { workplaces, form_reg_req = "registration" } = req.body;
    let { startDate, endDate } = req.body;

    // Use the exact UTC instants provided by the frontend to avoid day shifts
    startDate = new Date(startDate);
    endDate = new Date(endDate);

    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ code: 400, message: "Start and end dates are required" });
    }

    const form_registration = await prisma.form.findMany({
      where: {
        type: { equals: "registration" },
        status: { equals: true },
      },
    });

    const form_registration_names = form_registration.map((item) => item.name);

    const form_registration4 = await prisma.form.findMany({
      where: {
        type: { equals: "registration4" },
        status: { equals: true },
      },
    });

    const form_registration4_names = form_registration4.map(
      (item) => item.name
    );

    console.log("form_registration4_names");
    console.log(form_registration4_names);

    const statements = [];

    for (const current_form of form_registration_names) {
      try {
        const open_count = await prisma.registration.count({
          where: {
            form_reg: { equals: current_form },
            regDate: { gte: startDate, lte: endDate },
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        const close_count = await prisma.registration.count({
          where: {
            form_reg: { equals: current_form },
            regEndDate: { gte: startDate, lte: endDate },
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        const km_count = await prisma.registration.count({
          where: {
            form_reg: { equals: current_form },
            regEndDate: { gte: startDate, lte: endDate },
            AND: [{ notes: { not: null } }, { notes: { not: "" } }],
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        const access_count = await prisma.registration.count({
          where: {
            form_reg: { equals: current_form },
            regEndDate: { gte: startDate, lte: endDate },
            OR: [
              { accessStatus: "ДОПУСК" },
              { accessStatus: { contains: "снят" } },
              { accessStatus: { contains: "СНЯТ" } },
            ],
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        const eliminete_count = await prisma.registration.count({
          where: {
            form_reg: { equals: current_form },
            regEndDate: { gte: startDate, lte: endDate },
            AND: [
              { accessStatus: { not: "ДОПУСК" } },
              { accessStatus: { not: { contains: "снят" } } },
              { accessStatus: { not: { contains: "СНЯТ" } } },
            ],
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        const otk1_count = await prisma.registration.count({
          where: {
            form_reg: { equals: current_form },
            regEndDate: { gte: startDate, lte: endDate },
            AND: [{ accessStatus: { contains: "ОТКАЗ-1" } }],
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        const pov_otkz = await prisma.registration.count({
          where: {
            form_reg: { equals: current_form },
            regEndDate: { gte: startDate, lte: endDate },
            OR: [
              { accessStatus: { contains: "повт" } },
              { accessStatus: { contains: "ПОВТ" } },
            ],
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        const pov_otkz1 = await prisma.registration.count({
          where: {
            form_reg: { equals: current_form },
            regEndDate: { gte: startDate, lte: endDate },
            OR: [
              { accessStatus: { contains: "повт" } },
              { accessStatus: { contains: "ПОВТ" } },
            ],
            AND: [{ accessStatus: { contains: "ОТКАЗ-1" } }],
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        statements.push({
          name: current_form,
          open_count: open_count,
          close_count: close_count,
          km_count: km_count,
          access_count: access_count,
          eliminete_count: eliminete_count,
          otk1_count: otk1_count,
          pov_otkz: pov_otkz,
          pov_otkz1: pov_otkz1,
        });
      } catch (error) {
        console.log(error);
      }
    }
    statements.push({
      name: "ВСЕГО:",
      open_count: statements.reduce((acc, curr) => acc + curr.open_count, 0),
      close_count: statements.reduce((acc, curr) => acc + curr.close_count, 0),
      km_count: statements.reduce((acc, curr) => acc + curr.km_count, 0),
      access_count: statements.reduce(
        (acc, curr) => acc + curr.access_count,
        0
      ),
      eliminete_count: statements.reduce(
        (acc, curr) => acc + curr.eliminete_count,
        0
      ),
      otk1_count: statements.reduce((acc, curr) => acc + curr.otk1_count, 0),
      pov_otkz: statements.reduce((acc, curr) => acc + curr.pov_otkz, 0),
      pov_otkz1: statements.reduce((acc, curr) => acc + curr.pov_otkz1, 0),
    });
    const statements4 = [];
    for (const current_form of form_registration4_names) {
      try {
        const open_count = await prisma.registration.count({
          where: {
            form_reg: { equals: current_form },
            regDate: { gte: startDate, lte: endDate },
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        const close_count = await prisma.registration.count({
          where: {
            form_reg: { equals: current_form },
            regEndDate: { gte: startDate, lte: endDate },
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        const km_count = await prisma.registration.count({
          where: {
            form_reg: { equals: current_form },
            regEndDate: { gte: startDate, lte: endDate },
            AND: [{ notes: { not: null } }, { notes: { not: "" } }],
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        const access_count = await prisma.registration.count({
          where: {
            form_reg: { equals: current_form },
            regEndDate: { gte: startDate, lte: endDate },
            OR: [
              { accessStatus: "ДОПУСК" },
              { accessStatus: { contains: "снят" } },
              { accessStatus: { contains: "СНЯТ" } },
            ],
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        const eliminete_count = await prisma.registration.count({
          where: {
            form_reg: { equals: current_form },
            regEndDate: { gte: startDate, lte: endDate },
            AND: [
              { accessStatus: { not: "ДОПУСК" } },
              { accessStatus: { not: { contains: "снят" } } },
              { accessStatus: { not: { contains: "СНЯТ" } } },
            ],
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        const otk1_count = await prisma.registration.count({
          where: {
            form_reg: { equals: current_form },
            regEndDate: { gte: startDate, lte: endDate },
            AND: [{ accessStatus: { contains: "ОТКАЗ-1" } }],
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        const pov_otkz = await prisma.registration.count({
          where: {
            form_reg: { equals: current_form },
            regEndDate: { gte: startDate, lte: endDate },
            OR: [
              { accessStatus: { contains: "повт" } },
              { accessStatus: { contains: "ПОВТ" } },
            ],
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        const pov_otkz1 = await prisma.registration.count({
          where: {
            form_reg: { equals: current_form },
            regEndDate: { gte: startDate, lte: endDate },
            OR: [
              { accessStatus: { contains: "повт" } },
              { accessStatus: { contains: "ПОВТ" } },
            ],
            AND: [{ accessStatus: { contains: "ОТКАЗ-1" } }],
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        statements4.push({
          name: current_form,
          open_count: open_count,
          close_count: close_count,
          km_count: km_count,
          access_count: access_count,
          eliminete_count: eliminete_count,
          otk1_count: otk1_count,
          pov_otkz: pov_otkz,
          pov_otkz1: pov_otkz1,
        });
      } catch (error) {
        console.log(error);
      }
    }

    statements4.push({
      name: "ВСЕГО:",
      open_count: statements4.reduce((acc, curr) => acc + curr.open_count, 0) + statements[statements.length - 1].open_count,
      close_count: statements4.reduce((acc, curr) => acc + curr.close_count, 0) + statements[statements.length - 1].close_count,
      km_count: statements4.reduce((acc, curr) => acc + curr.km_count, 0) + statements[statements.length - 1].km_count,
      access_count: statements4.reduce(
        (acc, curr) => acc + curr.access_count,
        0
      ) + statements[statements.length - 1].access_count,
      eliminete_count: statements4.reduce(
        (acc, curr) => acc + curr.eliminete_count,
        0
      ) + statements[statements.length - 1].eliminete_count,
      otk1_count: statements4.reduce((acc, curr) => acc + curr.otk1_count, 0) + statements[statements.length - 1].otk1_count,
      pov_otkz: statements4.reduce((acc, curr) => acc + curr.pov_otkz, 0) + statements[statements.length - 1].pov_otkz,
      pov_otkz1: statements4.reduce((acc, curr) => acc + curr.pov_otkz1, 0) + statements[statements.length - 1].pov_otkz1
    });

    statements.push(...statements4);
    const startDateDoc = toRuDateUTC(startDate);
    const endDateDoc = toRuDateUTC(endDate);

    const doc = reportStatementsFormFunction(
      `Статистика по формам (${form_registration_names.join(", ")},${form_registration4_names.join(", ")}) спецпроверок (${startDateDoc} - ${endDateDoc})`,
      statements
    );

    const combinedDoc = new Document({
      sections: [...doc.sections],
    });
    // Generate the document buffer
    const buffer = await Packer.toBuffer(combinedDoc);

    // Tasodifiy nom yaratish
    const randomFileName = `${uuidv4()}.docx`;
    const filePath = path.join(__dirname, "../../uploads", randomFileName);

    // Save the document to the file system

    const raport = await prisma.raport.create({
      data: {
        name: `Отчет по формам (${form_registration_names.join(", ")},${form_registration4_names.join(", ")}) спецпроверок (${startDateDoc} - ${endDateDoc})`,
        executorId: req.userId,
        link: SERVER_URL + "/api/v1/download/" + randomFileName,
        notes: `Отчет по формам (${form_registration_names.join(", ")},${form_registration4_names.join(", ")}) спецпроверок (${startDateDoc} - ${endDateDoc})`,
      },
    });

    await prisma.raportLink.create({
      data: {
        raportId: raport.id,
        code: `Отчет по формам (${form_registration_names.join(", ")},${form_registration4_names.join(", ")}) спецпроверок (${startDateDoc} - ${endDateDoc})`,
        delete: true,
        display: false,
      },
    });

    // data.forEach(async (item) => {
    //   const registration = await prisma.registration.findUnique({
    //     where: { id: item.id },
    //   });
    //   const code =
    //     registration?.regNumber + " " + "ф-" + registration?.form_reg;

    //   await prisma.registration.update({
    //     where: { id: item.id },
    //     data: {
    //       accessStatus: "ПРОВЕРКА",
    //       completeStatus: "COMPLETED",
    //       expired: null,
    //       conclusionRegNum: code,
    //       expiredDate: null,
    //     },
    //   });
    //   await prisma.raportLink.create({
    //     data: {
    //       raportId: raport.id,
    //       registrationId: item.id,
    //       code: code,
    //     },
    //   });
    // });

    fs.writeFileSync(filePath, buffer);

    return res.status(200).json({
      code: 200,
      message: "Document generated and saved successfully",
      link: SERVER_URL + "/api/v1/download/" + randomFileName,
    });
  } catch (error) {
    console.log("error");
    console.error("Error generating report:", error);
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
 * /api/v1/statistics/statisticsByYear:
 *   post:
 *     summary: "Годлар massivi va формалар massivi asosida hujjat yaratish"
 *     tags: [Statistics]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               years:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["2020", "2021", "2022", "2023", "2024"]
 *               forms:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Р", "О"]
 *     responses:
 *       200:
 *         description: "Hujjat muvaffaqiyatli yaratildi va saqlandi"
 *       400:
 *         description: "Xato: IDlar talab qilinadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.statisticsByYear = async (req, res) => {
  try {
    const { years, forms } = req.body;
    let { executorId } = req.body;

    if (years.length === 0 || forms.length === 0 || !years || !forms) {
      return res
        .status(400)
        .json({ code: 400, message: "Years and forms are required" });
    }

    const valid_years = years?.map((item) => parseInt(item));
    if (valid_years.length === 0) {
      return res.status(400).json({ code: 400, message: "Years are required" });
    }

    const valid_forms = await Promise.all(
      forms.map(async (item) => {
        // console.log(item);
        const checkForm = await prisma.form.findUnique({
          where: { name: item },
        });
        if (!checkForm) {
          // Throw an error to break out of Promise.all if a form is invalid.
          throw new Error("Invalid form");
        }
        return item;
      })
    );

    const statements = [];

    for (const current_year of valid_years) {
      try {
        let startDate = new Date(Date.UTC(current_year, 0, 1, 0, 0, 0, 0));
        let endDate = new Date(Date.UTC(current_year, 11, 31, 23, 59, 59, 999));
        const open_count = await prisma.registration.count({
          where: {
            form_reg: { in: valid_forms },
            regDate: { gte: startDate, lte: endDate },
            ...(!executorId.includes("all") && { executorId: { in: executorId } }),
          }
        });

        const close_count = await prisma.registration.count({
          where: {
            form_reg: { in: valid_forms },
            regEndDate: { gte: startDate, lte: endDate },
            ...(!executorId.includes("all") && { executorId: { in: executorId } }),
          }
        });
        const km_count = await prisma.registration.count({
          where: {
            form_reg: { in: valid_forms },
            regEndDate: { gte: startDate, lte: endDate },
            AND: [{ notes: { not: null } }, { notes: { not: "" } }],
            ...(!executorId.includes("all") && { executorId: { in: executorId } }),
          }
        });
        const access_count = await prisma.registration.count({
          where: {
            form_reg: { in: valid_forms },
            regEndDate: { gte: startDate, lte: endDate },
            OR: [
              { accessStatus: "ДОПУСК" },
              { accessStatus: { contains: "снят" } },
              { accessStatus: { contains: "СНЯТ" } },
            ],
            ...(!executorId.includes("all") && { executorId: { in: executorId } }),
          }
        });
        const eliminete_count = await prisma.registration.count({
          where: {
            form_reg: { in: valid_forms },
            regEndDate: { gte: startDate, lte: endDate },
            AND: [
              { accessStatus: { not: "ДОПУСК" } },
              { accessStatus: { not: { contains: "снят" } } },
              { accessStatus: { not: { contains: "СНЯТ" } } },
            ],
            ...(!executorId.includes("all") && { executorId: { in: executorId } }),
          }
        });
        const otk1_count = await prisma.registration.count({
          where: {
            form_reg: { in: valid_forms },
            regEndDate: { gte: startDate, lte: endDate },
            OR: [
              // { accessStatus: { contains: "ОТКАЗ 1" } },
              { accessStatus: { contains: "ОТКАЗ-1" } },
            ],
            ...(!executorId.includes("all") && { executorId: { in: executorId } }),
          },
        });
        const pov_otkz = await prisma.registration.count({
          where: {
            form_reg: { in: valid_forms },
            regEndDate: { gte: startDate, lte: endDate },
            OR: [
              { accessStatus: { contains: "повт" } },
              { accessStatus: { contains: "ПОВТ" } },
            ],
            ...(!executorId.includes("all") && { executorId: { in: executorId } }),
          },
        });

        const pov_otkz1 = await prisma.registration.count({
          where: {
            form_reg: { in: valid_forms },
            regEndDate: { gte: startDate, lte: endDate },
            AND: [
              {
                OR: [
                  { accessStatus: { contains: "повт" } },
                  { accessStatus: { contains: "ПОВТ" } },
                ],
              },
              { accessStatus: { contains: "ОТКАЗ-1" } },
            ],
            ...(!executorId.includes("all") && { executorId: { in: executorId } }),
          }
        });
        statements.push({
          name: current_year,
          open_count: open_count,
          close_count: close_count,
          km_count: km_count,
          access_count: access_count,
          eliminete_count: eliminete_count,
          otk1_count: otk1_count,
          pov_otkz: pov_otkz,
          pov_otkz1: pov_otkz1,
        });
      } catch (error) {
        console.log(error);
      }
    }
    statements.push({
      name: "ВСЕГО:",
      open_count: statements.reduce((acc, curr) => acc + curr.open_count, 0),
      close_count: statements.reduce((acc, curr) => acc + curr.close_count, 0),
      km_count: statements.reduce((acc, curr) => acc + curr.km_count, 0),
      access_count: statements.reduce(
        (acc, curr) => acc + curr.access_count,
        0
      ),
      eliminete_count: statements.reduce(
        (acc, curr) => acc + curr.eliminete_count,
        0
      ),
      otk1_count: statements.reduce((acc, curr) => acc + curr.otk1_count, 0),
      pov_otkz: statements.reduce((acc, curr) => acc + curr.pov_otkz, 0),
      pov_otkz1: statements.reduce((acc, curr) => acc + curr.pov_otkz1, 0),
    });

    const doc = reportStatementsFormFunction(
      `Статистика по годам, по формам «${valid_forms.join(", ")}» ( ${valid_years.join(", ")})`,
      statements
    );

    const combinedDoc = new Document({
      sections: [...doc.sections],
    });
    // Generate the document buffer
    const buffer = await Packer.toBuffer(combinedDoc);

    // Tasodifiy nom yaratish
    const randomFileName = `${uuidv4()}.docx`;
    const filePath = path.join(__dirname, "../../uploads", randomFileName);

    // Save the document to the file system

    const raport = await prisma.raport.create({
      data: {
        name: `Отчет по формам (${forms.join(", ")}) спецпроверок (за выбранный период времениу):`,
        executorId: req.userId,
        link: SERVER_URL + "/api/v1/download/" + randomFileName,
        notes: `Отчет по формам (${forms.join(", ")}) спецпроверок (за выбранный период времениу):`,
      },
    });

    await prisma.raportLink.create({
      data: {
        raportId: raport.id,
        code: `Отчет по формам (${forms.join(", ")}) спецпроверок (за выбранный период времениу):`,
        delete: true,
        display: false,
      },
    });

    // data.forEach(async (item) => {
    //   const registration = await prisma.registration.findUnique({
    //     where: { id: item.id },
    //   });
    //   const code =
    //     registration?.regNumber + " " + "ф-" + registration?.form_reg;

    //   await prisma.registration.update({
    //     where: { id: item.id },
    //     data: {
    //       accessStatus: "ПРОВЕРКА",
    //       completeStatus: "COMPLETED",
    //       expired: null,
    //       conclusionRegNum: code,
    //       expiredDate: null,
    //     },
    //   });
    //   await prisma.raportLink.create({
    //     data: {
    //       raportId: raport.id,
    //       registrationId: item.id,
    //       code: code,
    //     },
    //   });
    // });

    fs.writeFileSync(filePath, buffer);

    return res.status(200).json({
      code: 200,
      message: "Document generated and saved successfully",
      link: SERVER_URL + "/api/v1/download/" + randomFileName,
    });
  } catch (error) {
    console.log("error");
    console.error("Error generating report:", error);
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
 * /api/v1/statistics/statisticsByForm:
 *   post:
 *     summary: "IDlar massivi asosida hujjat yaratish"
 *     tags: [Statistics]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               workplaces:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Веймар", "Равон", "Туронэлектромонтаж АО"]
 *               startDate:
 *                 type: string
 *                 example: "2000-01-01T00:00:00.000Z"
 *               endDate:
 *                 type: string
 *                 example: "2024-12-31T23:59:59.999Z"
 *               form_reg_req:
 *                 type: string
 *                 example: "registration"
 *     responses:
 *       200:
 *         description: "Hujjat muvaffaqiyatli yaratildi va saqlandi"
 *       400:
 *         description: "Xato: IDlar talab qilinadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.statisticsByForm = async (req, res) => {
  try {
    const { form_reg_req = "registration" } = req.body;
    let { startDate, endDate, workplaces } = req.body;

    // Use the exact UTC instants provided by the frontend to avoid day shifts
    startDate = new Date(startDate);
    endDate = new Date(endDate);

    if (!workplaces || !Array.isArray(workplaces) || workplaces.length === 0) {
      return res
        .status(400)
        .json({ code: 400, message: "Workplaces are required" });
    }

    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ code: 400, message: "Start and end dates are required" });
    }

    workplaces = workplaces.filter((item, index, self) => {
      return self.indexOf(item) === index;
    });

    const statements = [];
    if (workplaces.includes("all")) {
      workplaces = await prisma.registration.findMany({
        select: {
          workplace: true,
        },
        distinct: ["workplace"],
      });
      workplaces = workplaces.map((item) => item.workplace);
    }

    let form_reg_names

    for (const workplace of workplaces) {
      try {
        const form_reg = await prisma.form.findMany({
          where: {
            type: { equals: form_reg_req },
            status: { equals: true },
          },
          select: {
            name: true,
          },
        });
        form_reg_names = form_reg.map((item) => item.name);
        const open_count = await prisma.registration.count({
          where: {
            form_reg: { in: form_reg_names },
            workplace: { equals: workplace },
            regDate: { gte: startDate, lte: endDate },
          },
        });

        const close_count = await prisma.registration.count({
          where: {
            form_reg: { in: form_reg_names },
            workplace: { equals: workplace },
            regEndDate: { gte: startDate, lte: endDate },
          },
        });
        const access_count = await prisma.registration.count({
          where: {
            form_reg: { in: form_reg_names },
            workplace: { equals: workplace },
            // regDate: { gte: startDate, lte: endDate },////////////////////////////////////qanday buladi
            regEndDate: { gte: startDate, lte: endDate },
            OR: [
              { accessStatus: "ДОПУСК" },
              { accessStatus: { contains: "снят" } },
              { accessStatus: { contains: "СНЯТ" } },
            ],
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        const access_expired_count = await prisma.registration.count({
          where: {
            form_reg: { in: form_reg_names },
            workplace: { equals: workplace },
            // regDate: { gte: startDate, lte: endDate },////////////////////////////////////qanday buladi
            regEndDate: { gte: startDate, lte: endDate },
            OR: [
              { accessStatus: "ДОПУСК" },
              { accessStatus: { contains: "снят" } },
              { accessStatus: { contains: "СНЯТ" } },
            ],
            AND: [{ expired: { not: null } }, { expired: { lte: new Date() } }],
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        const eliminete_count = await prisma.registration.count({
          where: {
            form_reg: { in: form_reg_names },
            workplace: { equals: workplace },
            // regDate: { gte: startDate, lte: endDate },////////////////////////////////////qanday buladi
            regEndDate: { gte: startDate, lte: endDate },
            AND: [
              { accessStatus: { not: "ДОПУСК" } },
              { accessStatus: { not: { contains: "снят" } } },
              { accessStatus: { not: { contains: "СНЯТ" } } },
            ],
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        const otk1_count = await prisma.registration.count({
          where: {
            form_reg: { in: form_reg_names },
            workplace: { equals: workplace },
            // regDate: { gte: startDate, lte: endDate },////////////////////////////////////qanday buladi
            regEndDate: { gte: startDate, lte: endDate },
            AND: [{ accessStatus: { contains: "ОТКАЗ-1" } }],
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        const sum = open_count + close_count + access_count + access_expired_count + eliminete_count + otk1_count;
        if (sum > 0) {
          statements.push({
            workplace: workplace,
            open_count: open_count,
            close_count: close_count,
            access_count: access_count,
            access_expired_count: access_expired_count,
            eliminete_count: eliminete_count,
            otk1_count: otk1_count,
          });
        } else {
          continue;
        }
      } catch (error) {
        console.log(error);
      }
    }
    if (statements.length === 0) {
      return res.status(404).json({
        code: 404,
        message: "No data found for the specified criteria",
      });
    }
    statements.push({
      workplace: "ВСЕГО:",
      open_count: statements.reduce((acc, curr) => acc + curr.open_count, 0),
      close_count: statements.reduce((acc, curr) => acc + curr.close_count, 0),
      access_count: statements.reduce(
        (acc, curr) => acc + curr.access_count,
        0
      ),
      access_expired_count: statements.reduce(
        (acc, curr) => acc + curr.access_expired_count,
        0
      ),
      eliminete_count: statements.reduce(
        (acc, curr) => acc + curr.eliminete_count,
        0
      ),
      otk1_count: statements.reduce((acc, curr) => acc + curr.otk1_count, 0),
    });

    const startDateDoc = toRuDateUTC(startDate);
    const endDateDoc = toRuDateUTC(endDate);

    const doc = statisticsByFormFunction(
      `Сверка по ведомствам, по формам «${form_reg_names.join(", ")}» (${startDateDoc} - ${endDateDoc})`,
      statements
    );

    const combinedDoc = new Document({
      sections: [...doc.sections],
    });
    // Generate the document buffer
    const buffer = await Packer.toBuffer(combinedDoc);

    // Tasodifiy nom yaratish
    const randomFileName = `${uuidv4()}.docx`;
    const filePath = path.join(__dirname, "../../uploads", randomFileName);

    // Save the document to the file system

    const raport = await prisma.raport.create({
      data: {
        name: `Отчет по формам (${form_reg_req}) спецпроверок (за выбранный период времениу):`,
        executorId: req.userId,
        link: SERVER_URL + "/api/v1/download/" + randomFileName,
        notes: `Отчет по формам (${form_reg_req}) спецпроверок (за выбранный период времениу):`,
      },
    });

    await prisma.raportLink.create({
      data: {
        raportId: raport.id,
        code: `Отчет по формам (${form_reg_req}) спецпроверок (за выбранный период времениу):`,
        delete: true,
        display: false,
      },
    });

    // data.forEach(async (item) => {
    //   const registration = await prisma.registration.findUnique({
    //     where: { id: item.id },
    //   });
    //   const code =
    //     registration?.regNumber + " " + "ф-" + registration?.form_reg;

    //   await prisma.registration.update({
    //     where: { id: item.id },
    //     data: {
    //       accessStatus: "ПРОВЕРКА",
    //       completeStatus: "COMPLETED",
    //       expired: null,
    //       conclusionRegNum: code,
    //       expiredDate: null,
    //     },
    //   });
    //   await prisma.raportLink.create({
    //     data: {
    //       raportId: raport.id,
    //       registrationId: item.id,
    //       code: code,
    //     },
    //   });
    // });

    fs.writeFileSync(filePath, buffer);

    return res.status(200).json({
      code: 200,
      message: "Document generated and saved successfully",
      link: SERVER_URL + "/api/v1/download/" + randomFileName,
    });
  } catch (error) {
    console.log("error");
    console.error("Error generating report:", error);
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
 * /api/v1/statistics/createAVR:
 *   post:
 *     summary: "AVR hujjatini yaratish"
 *     tags: [Statistics]
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
 *               name:
 *                 type: string
 *                 example: "Т  А  Л  А  Б  Н  О  М  А"
 *               organization:
 *                 type: string
 *                 default: "Министерство юстиции Республики Узбекистан"
 *               raport_data:
 *                 type: string
 *                 default: "2019-05-02 05:00:00"
 *     responses:
 *       200:
 *         description: "Hujjat muvaffaqiyatli yaratildi va saqlandi"
 *       400:
 *         description: "Xato: IDlar talab qilinadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.generateAVR = async (req, res) => {
  try {
    const {
      id,
      code,
      name = "AVR",
      nationality,
      residence,
      passport,
      travel,
      signListIds,
      additional_information,
      raport_data = new Date(),
    } = req.body;

    // if(typeof name !== "string"){
    //   return res.status(400).json({ code: 400, message: "Name must be a string" });
    // }

    // const typeList = name.split(",");

    // Fetch data from database based on IDs
    let data = await prisma.registration.findUnique({
      where: { id },
      include: {
        Initiator: {
          select: {
            first_name: true,
            last_name: true,
            father_name: true,
          },
        },
        executor: {
          select: {
            first_name: true,
            last_name: true,
            father_name: true,
          },
        },
      },
    });

    if (!data) {
      data = await prisma.relatives.findUnique({
        where: { id },
        include: {
          Initiator: {
            select: {
              first_name: true,
              last_name: true,
              father_name: true,
            },
          },
          executor: {
            select: {
              first_name: true,
              last_name: true,
              father_name: true,
            },
          },
        },
      });

      if (!data) {
        return res.status(404).json({ code: 404, message: "data not found" });
      }
    }

    if (!signListIds || signListIds?.length === 0) {
      return res
        .status(404)
        .json({ code: 404, message: "signListIds not found" });
    }

    const signList = await prisma.signList.findMany({
      where: {
        id: { in: signListIds },
      },
    });

    if (!signList) {
      return res.status(404).json({ code: 404, message: "signList not found" });
    }

    const signListData = signList.map((item) => {
      const name =
        (item?.lastName ? item?.lastName.slice(0, 1) + "." : "") +
        "" +
        (item?.firstName ? item?.firstName.slice(0, 1) + "." : "") +
        "" +
        (item?.fatherName ? item?.fatherName : "");
      const position = item?.position ? item?.position : "";
      return {
        name: name,
        position: position,
      };
    });

    const formattedDate = new Date(raport_data)
      .toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
      .replace("г.", "г");

    const executor = data?.executor?.first_name
      ? data?.executor?.first_name
      : "" + " " + data?.executor?.last_name
        ? data?.executor?.last_name
        : "" + " " + data?.executor?.father_name
          ? data?.executor?.father_name
          : "";
    const executor_phone = data?.executor?.phone ? data?.executor?.phone : "";
    const initiator = data?.Initiator?.first_name
      ? data?.Initiator?.first_name
      : "" + " " + data?.Initiator?.last_name
        ? data?.Initiator?.last_name
        : "" + " " + data?.Initiator?.father_name
          ? data?.Initiator?.father_name
          : "";
    // Create a new document
    const formattedBirthDate = data?.birthDate
      ? safeString(new Date(data?.birthDate).getFullYear())
      : "";

    const documents = [];

    const raportTypes = await prisma.raportTypes.findMany({
      where: {
        AND: [{ code: { contains: code } }],
      },
    });

    if (!raportTypes?.length) {
      return res
        .status(404)
        .json({ code: 404, message: "raport type not found" });
    }

    // console.log({
    //   "raportType?.organization": "raportType?.organization",
    //   "data?.firstName": data?.firstName,
    //   "data?.lastName": data?.lastName,
    //   "data?.fatherName": data?.fatherName,
    //   "formattedBirthDate": formattedBirthDate,
    //   "data?.birthPlace": data?.birthPlace,
    //   "data?.residence": data?.residence,
    //   "data?.workplace": data?.workplace,
    //   "data?.position": data?.position,
    //   "data?.notes": data?.notes,
    //   "raportType?.requested_organization": "raportType?.requested_organization",
    //   "formattedDate": formattedDate,
    //   "executor": executor,
    //   "executor_phone": executor_phone,
    //   "initiator": initiator,
    //   "data?.regNumber": data?.regNumber,
    //   "nationality": nationality,
    //   "residence": residence,
    //   "passport": passport,
    //   "travel": travel,
    //   "additional_information": additional_information
    // });

    // return res.status(200).json({
    //   code: 200,
    //   message: "raport type found",
    //   raportTypes,
    // });

    raportTypes.map((raportType) => {
      documents.push(
        generateAVR(
          raportType?.requested_organization,
          raportType?.organization,
          raportType?.name,
          data?.firstName,
          data?.lastName,
          data?.fatherName,
          formattedBirthDate,
          data?.birthPlace,
          nationality,
          residence,
          data?.workplace
            ? data?.workplace
            : "" + data?.position
              ? data?.position
              : "",
          passport,
          travel,
          data?.notes ? "к/м" : "",
          raportType?.notes,
          formattedDate,
          executor,
          executor_phone,
          initiator,
          data?.regNumber ? data?.regNumber : "",
          signListData,
          additional_information,
          raportType?.signed_fio,
          raportType?.signed_position
        )
      );
    });

    // Ikkala hujjatning bo'limlarini birlashtirish
    const combinedDoc = new Document({
      sections: [...documents[0].sections],
    });
    // Hujjat buferini yaratish
    const buffer = await Packer.toBuffer(combinedDoc);

    // Tasodifiy nom yaratish
    const randomFileName = `${uuidv4()}.docx`;
    const filePath = path.join(__dirname, "../../uploads", randomFileName);

    const raport = await prisma.raport.create({
      data: {
        name: name,
        executorId: req.userId,
        link: SERVER_URL + "/api/v1/download/" + randomFileName,
        notes: "test",
      },
    });

    const registration = await prisma.registration.findUnique({
      where: { id },
    });
    // const code = registration?.regNumber + " " + "ф-" + registration?.form_reg;
    // console.log(code);

    // await prisma.registration.update({
    //   where: { id },
    //   data: {
    //     accessStatus: "ПРОВЕРКА",
    //     completeStatus: "COMPLETED",
    //     expired: null,
    //     conclusionRegNum: code,
    //     expiredDate: null,
    //   },
    // });
    await prisma.raportLink.create({
      data: {
        raportId: raport.id,
        code: name,
        registrations: { connect: [{ id }] },
      },
    });

    fs.writeFileSync(filePath, buffer);
    // Return the file as a response
    // return res.download(filePath, "report.docx", (err) => {
    //   if (err) {
    //     console.error("Error sending file:", err);
    //     return res.status(500).json({
    //       code: 500,
    //       message: "Error sending file",
    //       error: err.message,
    //     });
    //   }
    // });
    return res.status(200).json({
      code: 200,
      message: "Document generated and saved successfully",
      link: SERVER_URL + "/api/v1/download/" + randomFileName,
    });
  } catch (error) {
    console.log(error);
    console.error("Error generating report:", error);
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
 * /api/v1/statistics/monitoringByAdmin:
 *   post:
 *     summary: "Годлар massivi va формалар massivi asosida hujjat yaratish"
 *     tags: [Statistics]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               years:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["2020", "2021", "2022", "2023", "2024"]
 *               forms:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Р", "О"]
 *               executors:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["2154", "2155"]
 *     responses:
 *       200:
 *         description: "Hujjat muvaffaqiyatli yaratildi va saqlandi"
 *       400:
 *         description: "Xato: IDlar talab qilinadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.monitoringByAdmin = async (req, res) => {
  try {
    const { years, forms } = req.body;
    let executors = req?.body?.executors;

    if (years.length === 0 || forms.length === 0 || !years || !forms) {
      return res
        .status(400)
        .json({ code: 400, message: "Years and forms are required" });
    }

    const valid_years = parseInt(years);

    const startDate = new Date(
      new Date(`${valid_years}-01-01`).setHours(0, 0, 0, 0)
    ).toISOString();
    const endDate = new Date(
      new Date(`${valid_years}-12-31`).setHours(23, 59, 59, 999)
    ).toISOString();

    const valid_forms = await Promise.all(
      forms.map(async (item) => {
        // console.log(item);
        const checkForm = await prisma.form.findUnique({
          where: { name: item },
        });
        if (!checkForm) {
          // Throw an error to break out of Promise.all if a form is invalid.
          throw new Error("Invalid form");
        }
        return item;
      })
    );

    const months = Array.from({ length: 12 }, (_, index) => {
      // Create start date for the month (month index: 0 for January, 11 for December)
      const startDate = new Date(valid_years, index, 1);
      startDate.setHours(0, 0, 0, 0);

      // Create end date by setting day to 0 of the next month, which gives the last day of the current month
      const endDate = new Date(valid_years, index + 1, 0);
      endDate.setHours(23, 59, 59, 999);

      return {
        month: index + 1,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      };
    });

    if (executors.includes("all")) {
      const allExecutors = await prisma.admin.findMany({
        where: {
          status: "active",
        },
        select: {
          id: true,
        },
      });
      executors = allExecutors.map((item) => item.id);
    }

    const statements = [];

    for (const executor of executors) {
      try {
        const checkExecutor = await prisma.admin.findUnique({
          where: { id: executor },
        });
        if (!checkExecutor) {
          // throw new Error("Invalid executor");
          continue;
        }
        const all_count = await prisma.registration.count({
          where: {
            form_reg: { in: valid_forms },
            regDate: { gte: startDate, lte: endDate },
            executor: {
              is: {
                id: executor,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        const january_count = await prisma.registration.count({
          where: {
            form_reg: { in: valid_forms },
            regDate: {
              gte: months[0]?.start,
              lte: months[0]?.end,
            },
            executor: {
              is: {
                id: executor,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        const february_count = await prisma.registration.count({
          where: {
            form_reg: { in: valid_forms },
            regDate: {
              gte: months[1]?.start,
              lte: months[1]?.end,
            },
            executor: {
              is: {
                id: executor,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        });
        const march_count = await prisma.registration.count({
          where: {
            form_reg: { in: valid_forms },
            regDate: { gte: months[2]?.start, lte: months[2]?.end },
            executor: {
              is: {
                id: executor,
              },
            },
          },
        });
        const april_count = await prisma.registration.count({
          where: {
            form_reg: { in: valid_forms },
            regDate: { gte: months[3]?.start, lte: months[3]?.end },
            executor: {
              is: {
                id: executor,
              },
            },
          },
        });
        const may_count = await prisma.registration.count({
          where: {
            form_reg: { in: valid_forms },
            regDate: { gte: months[4]?.start, lte: months[4]?.end },
            executor: {
              is: {
                id: executor,
              },
            },
          },
        });
        const june_count = await prisma.registration.count({
          where: {
            form_reg: { in: valid_forms },
            regDate: { gte: months[5]?.start, lte: months[5]?.end },
            executor: {
              is: {
                id: executor,
              },
            },
          },
        });
        const july_count = await prisma.registration.count({
          where: {
            form_reg: { in: valid_forms },
            regDate: { gte: months[6]?.start, lte: months[6]?.end },
            executor: {
              is: {
                id: executor,
              },
            },
          },
        });
        const august_count = await prisma.registration.count({
          where: {
            form_reg: { in: valid_forms },
            regDate: { gte: months[7]?.start, lte: months[7]?.end },
            executor: {
              is: {
                id: executor,
              },
            },
          },
        });
        const september_count = await prisma.registration.count({
          where: {
            form_reg: { in: valid_forms },
            regDate: { gte: months[8]?.start, lte: months[8]?.end },
            executor: {
              is: {
                id: executor,
              },
            },
          },
        });
        const october_count = await prisma.registration.count({
          where: {
            form_reg: { in: valid_forms },
            regDate: { gte: months[9]?.start, lte: months[9]?.end },
            executor: {
              is: {
                id: executor,
              },
            },
          },
        });
        const november_count = await prisma.registration.count({
          where: {
            form_reg: { in: valid_forms },
            regDate: { gte: months[10]?.start, lte: months[10]?.end },
            executor: {
              is: {
                id: executor,
              },
            },
          },
        });
        const december_count = await prisma.registration.count({
          where: {
            form_reg: { in: valid_forms },
            regDate: { gte: months[11]?.start, lte: months[11]?.end },
            executor: {
              is: {
                id: executor,
              },
            },
          },
        });
        const sum = january_count + february_count + march_count + april_count + may_count + june_count + july_count + august_count + september_count + october_count + november_count + december_count;
        if (sum > 0) {
          statements.push({
            name:
              (checkExecutor?.last_name ? checkExecutor?.last_name : "") +
              " " +
              (checkExecutor?.first_name ? checkExecutor?.first_name : "") +
              " " +
              (checkExecutor?.father_name ? checkExecutor?.father_name : ""),
            all_count: all_count,
            january_count: january_count,
            february_count: february_count,
            march_count: march_count,
            april_count: april_count,
            may_count: may_count,
            june_count: june_count,
            july_count: july_count,
            august_count: august_count,
            september_count: september_count,
            october_count: october_count,
            november_count: november_count,
            december_count: december_count,
          });
        }
      } catch (error) {
        console.log(error);
      }
    }
    if (statements.length === 0) {
      return res.status(404).json({
        code: 404,
        message: "No data found for the specified criteria",
      });

    }
    statements.push({
      name: "ВСЕГО:",
      all_count: statements.reduce((acc, curr) => acc + curr.all_count, 0),
      january_count: statements.reduce(
        (acc, curr) => acc + curr.january_count,
        0
      ),
      february_count: statements.reduce(
        (acc, curr) => acc + curr.february_count,
        0
      ),
      march_count: statements.reduce((acc, curr) => acc + curr.march_count, 0),
      april_count: statements.reduce((acc, curr) => acc + curr.april_count, 0),
      may_count: statements.reduce((acc, curr) => acc + curr.may_count, 0),
      june_count: statements.reduce((acc, curr) => acc + curr.june_count, 0),
      july_count: statements.reduce((acc, curr) => acc + curr.july_count, 0),
      august_count: statements.reduce(
        (acc, curr) => acc + curr.august_count,
        0
      ),
      september_count: statements.reduce(
        (acc, curr) => acc + curr.september_count,
        0
      ),
      october_count: statements.reduce(
        (acc, curr) => acc + curr.october_count,
        0
      ),
      november_count: statements.reduce(
        (acc, curr) => acc + curr.november_count,
        0
      ),
      december_count: statements.reduce(
        (acc, curr) => acc + curr.december_count,
        0
      ),
    });

    const doc = reportMonitoringByAdmin(
      `Мониторинг работы операторов, по формам «(${valid_forms.join(", ")})»за ${valid_years} год`,
      statements
    );

    const combinedDoc = new Document({
      sections: [...doc.sections],
    });
    // Generate the document buffer
    const buffer = await Packer.toBuffer(combinedDoc);

    // Tasodifiy nom yaratish
    const randomFileName = `${uuidv4()}.docx`;
    const filePath = path.join(__dirname, "../../uploads", randomFileName);

    // Save the document to the file system

    const raport = await prisma.raport.create({
      data: {
        name: "Мониторинг по формам спецпроверок (за выбранный период времениу):",
        executorId: req.userId,
        link: SERVER_URL + "/api/v1/download/" + randomFileName,
        notes: "test",
      },
    });

    // data.forEach(async (item) => {
    //   const registration = await prisma.registration.findUnique({
    //     where: { id: item.id },
    //   });
    //   const code =
    //     registration?.regNumber + " " + "ф-" + registration?.form_reg;

    //   await prisma.registration.update({
    //     where: { id: item.id },
    //     data: {
    //       accessStatus: "ПРОВЕРКА",
    //       completeStatus: "COMPLETED",
    //       expired: null,
    //       conclusionRegNum: code,
    //       expiredDate: null,
    //     },
    //   });
    //   await prisma.raportLink.create({
    //     data: {
    //       raportId: raport.id,
    //       registrationId: item.id,
    //       code: code,
    //     },
    //   });
    // });

    fs.writeFileSync(filePath, buffer);

    return res.status(200).json({
      code: 200,
      message: "Document generated and saved successfully",
      link: SERVER_URL + "/api/v1/download/" + randomFileName,
    });
  } catch (error) {
    console.log("error");
    console.error("Error generating report:", error);
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
 * /api/v1/statistics/weeeklyReport:
 *   post:
 *     summary: "IDlar massivi asosida hujjat yaratish"
 *     tags: [Statistics]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               forms:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Веймар", "Равон", "Туронэлектромонтаж АО"]
 *               admins:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Веймар", "Равон", "Туронэлектромонтаж АО"]
 *               startDate:
 *                 type: string
 *                 example: "2000-01-01T00:00:00.000Z"
 *               endDate:
 *                 type: string
 *                 example: "2024-12-31T23:59:59.999Z"
 *               form_reg_req:
 *                 type: string
 *                 example: "registration"
 *     responses:
 *       200:
 *         description: "Hujjat muvaffaqiyatli yaratildi va saqlandi"
 *       400:
 *         description: "Xato: IDlar talab qilinadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.weeeklyReport = async (req, res) => {
  try {
    const { forms, admins } = req.body;
    let { startDate, endDate } = req.body;

    // Use the exact UTC instants provided by the frontend to avoid day shifts
    startDate = new Date(startDate);
    endDate = new Date(endDate);

    const getAdmin = await prisma.admin.findUnique({
      where: { id: req.userId },
      include: {
        AdminServiceAccess: {
          where: {
            service: {
              name: "Статистика"
            }
          },
          include: {
            service: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });

    if (!getAdmin.role.includes("superAdmin")) {
      if (getAdmin.AdminServiceAccess.length === 1) {
      } else {
        if (req.userId === admins[0]) {
        } else {
          return res.status(500).json({ code: 500, message: "Access denied" });
        }
      }
    }

    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ code: 400, message: "Start and end dates are required" });
    }

    const form_registration = await prisma.form.findMany({
      where: {
        name: { in: forms },
        status: { equals: true },
      },
    });

    const form_registration_names = form_registration.map((item) => item.name);

    const allAdminCheck = !admins.some((item) => item === "all")

    const statements = [];

    for (const adminId of admins) {
      try {
        const reg = await prisma.registration.findMany({
          where: {
            form_reg: { in: form_registration_names },
            ...(allAdminCheck ? { executorId: { equals: adminId } } : {}),
            regDate: { gte: startDate, lte: endDate },
            AND: [
              { expiredDate: { not: null } },
              { expiredDate: { lte: new Date() } },
            ],
          },
          orderBy: [{
            executorId: "asc",
          }, {
            regDate: "asc",
          }],
          include: {
            executor: {
              select: {
                id: true,
                last_name: true,
                first_name: true,
                father_name: true,
              },
            },
            Initiator: {
              select: {
                id: true,
                last_name: true,
                first_name: true,
                father_name: true,
              },
            },
          },
        });

        for (const item of reg) {
          const formatRegDate = item?.regDate
            ? new Date(item?.regDate).toLocaleDateString("ru-RU")
            : "";
          const regNumber = item?.regNumber || "";
          const regDate = formatRegDate;
          const form_reg = item?.form_reg || "";
          const fullName = item?.fullName || "";
          const workPlace = item?.workplace || "";
          const initiator =
            (item?.Initiator?.last_name || "") +
            " " +
            (item?.Initiator?.first_name || "") +
            " " +
            (item?.Initiator?.father_name || "");
          const executor =
            (item?.executor?.last_name || "") +
            " " +
            (item?.executor?.first_name || "") +
            " " +
            (item?.executor?.father_name || "");
          const zaklyucheniya = item?.accessStatus || "";

          statements.push({
            regNumber: regNumber,
            regDate: regDate,
            form_reg: form_reg,
            fullName: fullName,
            workPlace: workPlace,
            initiator: initiator,
            executor: executor,
            zaklyucheniya: zaklyucheniya,
          });
        }
      } catch (error) {
        console.log(error);
      }
    }

    // UTC-safe date labels for the report title
    const startDateDoc = toRuDateUTC(startDate);
    const endDateDoc = toRuDateUTC(endDate);

    let adminName = "";
    if ((admins.length === 1) && admins.some((admin) => admin.id !== "all")) {
      adminName = await prisma.admin.findUnique({
        where: {
          id: admins[0],
        },
      });
    }

    const doc = weeeklyReportFunction(
      !(admins.some((admin) => admin === "all")) ? (`ОТЧЕТ ОПЕРАТОРА ${(adminName?.first_name ? adminName?.first_name : "") + " " + (adminName?.last_name ? adminName?.last_name : "") + " " + (adminName?.father_name ? adminName?.father_name : "")}  (${startDateDoc} - ${endDateDoc}):`) : `Анализ работы операторов, по формам «${form_registration_names.join(", ")}»  (${startDateDoc} - ${endDateDoc}):`,
      statements,
      admins
    );

    const combinedDoc = new Document({
      sections: [...doc.sections],
    });
    // Generate the document buffer
    const buffer = await Packer.toBuffer(combinedDoc);

    // Tasodifiy nom yaratish
    const randomFileName = `${uuidv4()}.docx`;
    const filePath = path.join(__dirname, "../../uploads", randomFileName);


    const raport = await prisma.raport.create({
      data: {
        name: "Недельный отчет по спецпроверкам",
        executorId: req.userId,
        link: SERVER_URL + "/api/v1/download/" + randomFileName,
        notes: "test",
      },
    });

    await prisma.raportLink.create({
      data: {
        raportId: raport.id,
        code: "Weeekly Report",
        delete: true,
        display: false,
      },
    });

    // data.forEach(async (item) => {
    //   const registration = await prisma.registration.findUnique({
    //     where: { id: item.id },
    //   });
    //   const code =
    //     registration?.regNumber + " " + "ф-" + registration?.form_reg;

    //   await prisma.registration.update({
    //     where: { id: item.id },
    //     data: {
    //       accessStatus: "ПРОВЕРКА",
    //       completeStatus: "COMPLETED",
    //       expired: null,
    //       conclusionRegNum: code,
    //       expiredDate: null,
    //     },
    //   });
    //   await prisma.raportLink.create({
    //     data: {
    //       raportId: raport.id,
    //       registrationId: item.id,
    //       code: code,
    //     },
    //   });
    // });

    fs.writeFileSync(filePath, buffer);

    return res.status(200).json({
      code: 200,
      message: "Document generated and saved successfully",
      link: SERVER_URL + "/api/v1/download/" + randomFileName,
    });
  } catch (error) {
    console.log("error");
    console.error("Error generating report:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {

  }
};

// #DONE
// Make sure to import Header and Footer from docx library at the top of your file:
// const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, 
//         WidthType, AlignmentType, VerticalAlign, BorderStyle, Header, Footer } = require('docx');

function reportStatementsFunction(
  name = "Статистика по объектам, привлекаемым ведомствам, учреждениям и организациям (за период):",
  statements = []
) {
  if (!Array.isArray(statements) || statements.length === 0) {
    statements = []; // Agar statements bo'sh yoki noto'g'ri bo'lsa, bo'sh massivga o'zgartiramiz
  }

  // Yana bir tekshirish: agar statements bo'sh bo'lsa, Table yaratmaslik
  if (statements.length === 0) {
    return {
      sections: [],
    };
  }


  return {
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: (1440 * 2) / 2.54, // 2cm
              right: (1440 * 1.5) / 2.54, // 1.5cm
              bottom: (1440 * 2) / 2.54, // 2cm
              left: (1440 * 2.5) / 2.54, // 2.5cm
            },
          },
        },
        // Simplified approach - add date at the end of document instead of footer
        // since Header/Footer might not be imported properly
        children: [
          // Organization name
          new Paragraph({
            children: [
              new TextRun({
                text: name,
                size: 32,
                bold: true,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200, before: 276 },
          }),

          // Decorative line
          new Paragraph({
            children: [
              new TextRun({
                text: "________________________________________________________________________________________________________________________________________________________________",
                size: 12,
                bold: true,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400, before: 0 },
          }),

          // Main data table
          new Table({
            rows: [
              // Header row 1
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Объекты, ведомства, учреждения, и организации`,
                            bold: true,
                            size: 22,
                          }),
                        ],
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 100, after: 100 },
                      }),
                    ],
                    rowSpan: 2,
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 20,
                      type: WidthType.PERCENTAGE,
                    },
                    shading: {
                      fill: "f0f0f0",
                    },
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `СП развернута (Ф-Р,О)`,
                            bold: true,
                            size: 22,
                          }),
                        ],
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 100, after: 100 },
                      }),
                    ],
                    rowSpan: 2,
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 15,
                      type: WidthType.PERCENTAGE,
                    },
                    shading: {
                      fill: "f0f0f0",
                    },
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `СП завершена (Ф-Р,О)`,
                            bold: true,
                            size: 22,
                          }),
                        ],
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 100, after: 100 },
                      }),
                    ],
                    rowSpan: 2,
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 15,
                      type: WidthType.PERCENTAGE,
                    },
                    shading: {
                      fill: "f0f0f0",
                    },
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `К/м (Ф-Р,О)`,
                            bold: true,
                            size: 22,
                          }),
                        ],
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 100, after: 100 },
                      }),
                    ],
                    rowSpan: 2,
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 15,
                      type: WidthType.PERCENTAGE,
                    },
                    shading: {
                      fill: "f0f0f0",
                    },
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `ДОПУСК`,
                            bold: true,
                            size: 22,
                          }),
                        ],
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 100, after: 100 },
                      }),
                    ],
                    rowSpan: 2,
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 15,
                      type: WidthType.PERCENTAGE,
                    },
                    shading: {
                      fill: "f0f0f0",
                    },
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `ОТКАЗЫ`,
                            bold: true,
                            size: 22,
                          }),
                        ],
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 50, after: 50 },
                      }),
                    ],
                    columnSpan: 2,
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 20,
                      type: WidthType.PERCENTAGE,
                    },
                    shading: {
                      fill: "f0f0f0",
                    },
                  }),
                ],
              }),

              // Header row 2 (sub-headers for ОТКАЗЫ)
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Всего`,
                            bold: true,
                            size: 20,
                          }),
                        ],
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 50, after: 50 },
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 10,
                      type: WidthType.PERCENTAGE,
                    },
                    shading: {
                      fill: "f8f8f8",
                    },
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `ОТК-1`,
                            bold: true,
                            size: 20,
                          }),
                        ],
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 50, after: 50 },
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 10,
                      type: WidthType.PERCENTAGE,
                    },
                    shading: {
                      fill: "f8f8f8",
                    },
                  }),
                ],
              }),

              // Data rows
              ...(statements?.length > 0
                ? statements.map((statement, index) =>
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [
                              new TextRun({
                                text: `${statement?.workplace || ''}`,
                                size: 20,
                              }),
                            ],
                            alignment: AlignmentType.LEFT,
                            spacing: { before: 100, after: 100 },
                          }),
                        ],
                        verticalAlign: VerticalAlign.CENTER,
                        width: {
                          size: 20,
                          type: WidthType.PERCENTAGE,
                        },
                        shading: {
                          fill: index % 2 === 0 ? "ffffff" : "fafafa",
                        },
                      }),
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [
                              new TextRun({
                                text: `${statement?.open_count || '0'}`,
                                size: 20,
                              }),
                            ],
                            alignment: AlignmentType.CENTER,
                            spacing: { before: 100, after: 100 },
                          }),
                        ],
                        verticalAlign: VerticalAlign.CENTER,
                        width: {
                          size: 15,
                          type: WidthType.PERCENTAGE,
                        },
                        shading: {
                          fill: index % 2 === 0 ? "ffffff" : "fafafa",
                        },
                      }),
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [
                              new TextRun({
                                text: `${statement?.close_count || '0'}`,
                                size: 20,
                              }),
                            ],
                            alignment: AlignmentType.CENTER,
                            spacing: { before: 100, after: 100 },
                          }),
                        ],
                        verticalAlign: VerticalAlign.CENTER,
                        width: {
                          size: 15,
                          type: WidthType.PERCENTAGE,
                        },
                        shading: {
                          fill: index % 2 === 0 ? "ffffff" : "fafafa",
                        },
                      }),
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [
                              new TextRun({
                                text: `${statement?.km_count || '0'}`,
                                size: 20,
                              }),
                            ],
                            alignment: AlignmentType.CENTER,
                            spacing: { before: 100, after: 100 },
                          }),
                        ],
                        verticalAlign: VerticalAlign.CENTER,
                        width: {
                          size: 15,
                          type: WidthType.PERCENTAGE,
                        },
                        shading: {
                          fill: index % 2 === 0 ? "ffffff" : "fafafa",
                        },
                      }),
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [
                              new TextRun({
                                text: `${statement?.access_count || '0'}`,
                                size: 20,
                              }),
                            ],
                            alignment: AlignmentType.CENTER,
                            spacing: { before: 100, after: 100 },
                          }),
                        ],
                        verticalAlign: VerticalAlign.CENTER,
                        width: {
                          size: 15,
                          type: WidthType.PERCENTAGE,
                        },
                        shading: {
                          fill: index % 2 === 0 ? "ffffff" : "fafafa",
                        },
                      }),
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [
                              new TextRun({
                                text: `${statement?.eliminete_count || '0'}`,
                                size: 20,
                              }),
                            ],
                            alignment: AlignmentType.CENTER,
                            spacing: { before: 100, after: 100 },
                          }),
                        ],
                        verticalAlign: VerticalAlign.CENTER,
                        width: {
                          size: 10,
                          type: WidthType.PERCENTAGE,
                        },
                        shading: {
                          fill: index % 2 === 0 ? "ffffff" : "fafafa",
                        },
                      }),
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [
                              new TextRun({
                                text: `${statement?.otk1_count || '0'}`,
                                size: 20,
                              }),
                            ],
                            alignment: AlignmentType.CENTER,
                            spacing: { before: 100, after: 100 },
                          }),
                        ],
                        verticalAlign: VerticalAlign.CENTER,
                        width: {
                          size: 10,
                          type: WidthType.PERCENTAGE,
                        },
                        shading: {
                          fill: index % 2 === 0 ? "ffffff" : "fafafa",
                        },
                      }),
                    ],
                  })
                )
                : []),
            ],
            width: {
              size: 100,
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER,
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
              left: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
              right: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "000000" },
              insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "000000" },
            },
          }),

          // Bottom decorative line
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________",
                size: 12,
                bold: true,
                color: "000000",
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400, before: 400 },
          }),

          // Date and time at the bottom of document
          new Paragraph({
            children: [
              new TextRun({
                text: `Дата составления: ${formatRussianDateTime()}`,
                size: 22,
                italics: true,
                bold: false,
              }),
            ],
            alignment: AlignmentType.RIGHT,
            spacing: { before: 300, after: 200 },
          }),
        ],
      },
    ],
  };
}
// #progress
function weeeklyReportFunction(
  name = "Недельный отчет по спецпроверкам:",
  statements = [],
  admins = []
) {
  if (!Array.isArray(statements) || statements.length === 0) {
    statements = []; // Agar statements bo'sh yoki noto'g'ri bo'lsa, bo'sh massivga o'zgartiramiz
  }

  // Yana bir tekshirish: agar statements bo'sh bo'lsa, Table yaratmaslik
  if (statements.length === 0) {
    return {
      sections: [],
    };
  }

  return {
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: (1440 * 2) / 2.54, // 2cm
              right: (1440 * 1.5) / 2.54, // 1.5cm
              bottom: (1440 * 2) / 2.54, // 2cm
              left: (1440 * 2.5) / 2.54, // 2.5cm
            },
          },
        },
        children: [
          //orginization name
          new Paragraph({
            children: [
              new TextRun({
                text: name,
                size: 32,
                bold: true,
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "________________________________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 12, // Chiziqning o'lchami
                bold: true,
              }),
            ],
            border: {
              bottom: {
                color: "ffffff", // Chiziq rangi
                space: 1,
                value: "dash", // Chiziq turi
                size: 40, // Chiziq qalinligi
              },
            },
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 0 },
          }),
          //statements
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Name
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `№`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 5, // 20% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: RegNumber
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Рег. номер`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 7, // 20% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Third Cell: RegDate
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Дата начала СП`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 5, // 20% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Fourth Cell: Form_reg
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Форма СП`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 5, // 20% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Fifth Cell: F.I.O
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Ф.И.О.`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25, // 20% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Sixth Cell: Obekty
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Объект`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 7, // 20% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Seventh Cell: Initiator
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Инициатор`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 20, // 20% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Seventh Cell: Operator
                  ...((admins.length === 1 && !admins.includes("all")) ? [] : [new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Оператор`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 20, // 20% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  })]),
                  // Eighth Cell: Zaklyucheniya
                  // new TableCell({
                  //   children: [
                  //     new Paragraph({
                  //       children: [
                  //         new TextRun({
                  //           text: `Отметка о передаче заключения на подпись`,
                  //           bold: false,
                  //           size: 24, // Large font size for title
                  //         }),
                  //         // new TextRun({
                  //         //   text: "(Год рождения)",
                  //         //   size: 24, // Adjust font size
                  //         //   font: "Times New Roman",
                  //         //   break: 1,
                  //         // }),
                  //       ],
                  //       color: "0f0f0f",
                  //       alignment: AlignmentType.CENTER, // Align to the left
                  //     }),
                  //   ],
                  //   verticalAlign: VerticalAlign.CENTER,
                  //   width: {
                  //     size: 14, // 20% width for the title
                  //     type: WidthType.PERCENTAGE,
                  //   },
                  // }),
                  // Ninth Cell: Admin
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Причина превышения сроков СП принятые меры (вводится оператором вручную)`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 26, // 20% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
              ...(statements?.length > 0
                ? statements.map(
                  (statement, index) =>
                    new TableRow({
                      children: [
                        // First Cell: Name
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${index + 1}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 5, // 20% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // Second Cell: RegNumber
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.regNumber}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 7, // 20% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // Third Cell: RegDate
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.regDate}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 5, // 20% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // Fourth Cell: Form_reg
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.form_reg}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 5, // 20% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // Fifth Cell: F.I.O
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.fullName}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 25, // 20% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // Sixth Cell: Obekty
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.workPlace}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 7, // 20% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // Seventh Cell: Initiator
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.initiator}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 20, // 20% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // Seventh Cell: Operator
                        ...(admins.length === 1 && !admins.includes("all") ? [] : [new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.executor}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 20, // 20% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        })]),
                        // Eighth Cell: Zaklyucheniya
                        // new TableCell({
                        //   children: [
                        //     new Paragraph({
                        //       children: [
                        //         new TextRun({
                        //           text: `${statement?.zaklyucheniya}`,
                        //           bold: false,
                        //           size: 24, // Large font size for title
                        //         }),
                        //         // new TextRun({
                        //         //   text: "(Год рождения)",
                        //         //   size: 24, // Adjust font size
                        //         //   font: "Times New Roman",
                        //         //   break: 1,
                        //         // }),
                        //       ],
                        //       color: "0f0f0f",
                        //       alignment: AlignmentType.CENTER, // Align to the left
                        //     }),
                        //   ],
                        //   verticalAlign: VerticalAlign.CENTER,
                        //   width: {
                        //     size: 14, // 20% width for the title
                        //     type: WidthType.PERCENTAGE,
                        //   },
                        // }),
                        // Ninth Cell: Admin
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `       `,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 26, // 20% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                      ],
                      verticalAlign: VerticalAlign.CENTER,
                      spacing: { after: 276 },
                    })
                )
                : new TableRow({
                  children: [
                    new TableCell({
                      children: [],
                    }),
                  ],
                })),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            // borders: {
            //   top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            //   bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            //   left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            //   right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            //   insideHorizontal: {
            //     style: BorderStyle.NONE,
            //     size: 0,
            //     color: "FFFFFF",
            //   },
            //   insideVertical: {
            //     style: BorderStyle.NONE,
            //     size: 0,
            //     color: "FFFFFF",
            //   },
            // },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          // Bottom decorative line
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________",
                size: 12,
                bold: true,
                color: "000000",
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400, before: 400 },
          }),

          // Date and time at the bottom of document
          new Paragraph({
            children: [
              new TextRun({
                text: `Дата составления: ${formatRussianDateTime()}`,
                size: 22,
                italics: true,
                bold: false,
              }),
            ],
            alignment: AlignmentType.RIGHT,
            spacing: { before: 300, after: 200 },
          }),
        ],
      },
    ],
  };
}

// #Done
function reportStatementsFormFunction(
  name = "Статистика по формам спецпроверок (за периодё):",
  statements = []
) {
  if (!Array.isArray(statements) || statements.length === 0) {
    statements = []; // Agar statements bo'sh yoki noto'g'ri bo'lsa, bo'sh massivga o'zgartiramiz
  }

  // Yana bir tekshirish: agar statements bo'sh bo'lsa, Table yaratmaslik
  if (statements.length === 0) {
    return {
      sections: [],
    };
  }

  return {
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: (1440 * 2) / 2.54, // 2cm
              right: (1440 * 1.5) / 2.54, // 1.5cm
              bottom: (1440 * 2) / 2.54, // 2cm
              left: (1440 * 2.5) / 2.54, // 2.5cm
            },
          },
        },
        children: [
          //orginization name
          new Paragraph({
            children: [
              new TextRun({
                text: name,
                size: 32,
                bold: true,
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "________________________________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 12, // Chiziqning o'lchami
                bold: true,
              }),
            ],
            border: {
              bottom: {
                color: "ffffff", // Chiziq rangi
                space: 1,
                value: "dash", // Chiziq turi
                size: 40, // Chiziq qalinligi
              },
            },
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 0 },
          }),
          //BirthDate and BirthPlace
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Name
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Формы спецпроверки (СП)`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    rowSpan: 2,
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 20, // 20% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Open
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `СП развернута`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    rowSpan: 2,
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 15, // 20% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Third Cell: Close
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `СП завершена`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    rowSpan: 2,
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 15, // 20% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Fourth Cell: Km
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `К/м`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    rowSpan: 2,
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 15, // 15% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Fifth Cell: Access
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `ДОПУСК`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    rowSpan: 2,
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 15, // 15% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Sixth Cell: Eliminete
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Отказы`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    columnSpan: 2,
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 10, // 15% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Seventh Cell: Eliminete
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Повторные отказы`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    columnSpan: 2,
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 10, // 15% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // // Second Cell: Table "birthPlace"
                  // new TableCell({
                  //   children: [
                  //     new Paragraph({
                  //       children: [
                  //         new TextRun({
                  //           text: `ДОПУСК`,
                  //           bold: false,
                  //           size: 24, // Large font size for title
                  //         }),
                  //         // new TextRun({
                  //         //   text: "(Год рождения)",
                  //         //   size: 24, // Adjust font size
                  //         //   font: "Times New Roman",
                  //         //   break: 1,
                  //         // }),
                  //       ],
                  //       color: "0f0f0f",
                  //       alignment: AlignmentType.CENTER, // Align to the left
                  //     }),
                  //   ],
                  //   rowSpan: 2,
                  //   verticalAlign: VerticalAlign.CENTER,
                  //   width: {
                  //     size: 15, // 15% width for the title
                  //     type: WidthType.PERCENTAGE,
                  //   },
                  // }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
              new TableRow({
                children: [
                  // Sixth Cell: Eliminete all
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Всего`,
                            bold: false,
                            size: 14, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 7, // 15% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Sixth Cell: Eliminete NOT ACCESS
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `ОТК-1`,
                            bold: false,
                            size: 14, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 8, // 15% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Seventh Cell: Eliminete all
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Всего`,
                            bold: false,
                            size: 14, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 7, // 15% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Seventh Cell: Eliminete NOT ACCESS
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `ОТК-1`,
                            bold: false,
                            size: 14, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 50, // 15% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
              ...(statements?.length > 0
                ? statements.map(
                  (statement) =>
                    new TableRow({
                      children: [
                        // First Cell: Name
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.name}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          // rowSpan: 2,
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 20, // 20% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // Second Cell: Open
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.open_count}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          // rowSpan: 2,
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 15, // 20% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // Third Cell: Close
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.close_count}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          // rowSpan: 2,
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 15, // 20% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // Fourth Cell: Km
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.km_count}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          // rowSpan: 2,
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 15, // 15% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // Fifth Cell: Access
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.access_count}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          // rowSpan: 2,
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 15, // 15% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // Sixth Cell: Eliminete
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.eliminete_count}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          // columnSpan: 2,
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 5, // 15% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // Seventh Cell: Eliminete
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.otk1_count}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          // columnSpan: 2,
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 5, // 15% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // Eighth Cell: Eliminete
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.pov_otkz}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          // columnSpan: 2,
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 5, // 15% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // Ninth Cell: Eliminete
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.pov_otkz1}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          // columnSpan: 2,
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 5, // 15% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                      ],
                      verticalAlign: VerticalAlign.CENTER,
                      spacing: { after: 276 },
                    })
                )
                : new TableRow({
                  children: [
                    new TableCell({
                      children: [],
                    }),
                  ],
                })),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            // borders: {
            //   top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            //   bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            //   left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            //   right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            //   insideHorizontal: {
            //     style: BorderStyle.NONE,
            //     size: 0,
            //     color: "FFFFFF",
            //   },
            //   insideVertical: {
            //     style: BorderStyle.NONE,
            //     size: 0,
            //     color: "FFFFFF",
            //   },
            // },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          // Bottom decorative line
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________",
                size: 12,
                bold: true,
                color: "000000",
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400, before: 400 },
          }),

          // Date and time at the bottom of document
          new Paragraph({
            children: [
              new TextRun({
                text: `Дата составления: ${formatRussianDateTime()}`,
                size: 22,
                italics: true,
                bold: false,
              }),
            ],
            alignment: AlignmentType.RIGHT,
            spacing: { before: 300, after: 200 },
          }),
        ],
      },
    ],
  };
}

// #Done
function statisticsByFormFunction(
  name = "показателич по объектам, привлекаемьим ведомствам, учреждениям и организации (за выбранный период времениу):",
  statements = []
) {
  if (!Array.isArray(statements) || statements.length === 0) {
    statements = []; // Agar statements bo'sh yoki noto'g'ri bo'lsa, bo'sh massivga o'zgartiramiz
  }

  // Yana bir tekshirish: agar statements bo'sh bo'lsa, Table yaratmaslik
  if (statements.length === 0) {
    return {
      sections: [],
    };
  }

  return {
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: (1440 * 2) / 2.54, // 2cm
              right: (1440 * 1.5) / 2.54, // 1.5cm
              bottom: (1440 * 2) / 2.54, // 2cm
              left: (1440 * 2.5) / 2.54, // 2.5cm
            },
          },
        },
        children: [
          //orginization name
          new Paragraph({
            children: [
              new TextRun({
                text: name,
                size: 32,
                bold: true,
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "________________________________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 12, // Chiziqning o'lchami
                bold: true,
              }),
            ],
            border: {
              bottom: {
                color: "ffffff", // Chiziq rangi
                space: 1,
                value: "dash", // Chiziq turi
                size: 40, // Chiziq qalinligi
              },
            },
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 0 },
          }),
          //statements
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Object
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Объект`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 20, // 20% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: open_count
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `СП развернута`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 15, // 20% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: close_count
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `СП завершена`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 15, // 20% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Third Cell: access_count
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Допуск был оформлен`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 15, // 20% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Fourth Cell: access_expired_count
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Срок действия допуска истек`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 15, // 15% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Fifth Cell: otk_count
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Отказы`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 15, // 15% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Sixth Cell: eliminete_count
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `ОТК-1`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 20, // 15% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
              ...(statements?.length > 0
                ? statements.map(
                  (statement) =>
                    new TableRow({
                      children: [
                        // First Cell: Object
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.workplace}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 20, // 20% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // Second Cell: open_count
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.open_count}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 15, // 20% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // Second Cell: close_count
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.close_count}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 15, // 20% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // Third Cell: access_count
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.access_count}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 15, // 20% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // Fourth Cell: access_expired_count
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.access_expired_count}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 15, // 15% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // Fifth Cell: eliminete_count
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.eliminete_count}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 15, // 15% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // Sixth Cell: otk1_count
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.otk1_count}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 20, // 15% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                      ],
                      verticalAlign: VerticalAlign.CENTER,
                      spacing: { after: 276 },
                    })
                )
                : new TableRow({
                  children: [
                    new TableCell({
                      children: [],
                    }),
                  ],
                })),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            // borders: {
            //   top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            //   bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            //   left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            //   right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            //   insideHorizontal: {
            //     style: BorderStyle.NONE,
            //     size: 0,
            //     color: "FFFFFF",
            //   },
            //   insideVertical: {
            //     style: BorderStyle.NONE,
            //     size: 0,
            //     color: "FFFFFF",
            //   },
            // },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          // Bottom decorative line
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________",
                size: 12,
                bold: true,
                color: "000000",
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400, before: 400 },
          }),

          // Date and time at the bottom of document
          new Paragraph({
            children: [
              new TextRun({
                text: `Дата составления: ${formatRussianDateTime()}`,
                size: 22,
                italics: true,
                bold: false,
              }),
            ],
            alignment: AlignmentType.RIGHT,
            spacing: { before: 300, after: 200 },
          }),
        ],
      },
    ],
  };
}

// #DONE
function reportMonitoringByAdmin(
  name = "Показатели по формам операторов (за выбранный период времени):",
  statements = []
) {
  if (!Array.isArray(statements) || statements.length === 0) {
    statements = []; // Agar statements bo'sh yoki noto'g'ri bo'lsa, bo'sh massivga o'zgartiramiz
  }

  // Yana bir tekshirish: agar statements bo'sh bo'lsa, Table yaratmaslik
  if (statements.length === 0) {
    return {
      sections: [],
    };
  }

  return {
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: (1440 * 2) / 2.54, // 2cm
              right: (1440 * 1.5) / 2.54, // 1.5cm
              bottom: (1440 * 2) / 2.54, // 2cm
              left: (1440 * 2.5) / 2.54, // 2.5cm
            },
            size: {
              orientation: PageOrientation.LANDSCAPE,
            },
          },
        },
        children: [
          //orginization name
          new Paragraph({
            children: [
              new TextRun({
                text: name,
                size: 32,
                bold: true,
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "________________________________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 12, // Chiziqning o'lchami
                bold: true,
              }),
            ],
            border: {
              bottom: {
                color: "ffffff", // Chiziq rangi
                space: 1,
                value: "dash", // Chiziq turi
                size: 40, // Chiziq qalinligi
              },
            },
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 0 },
          }),
          //data
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: №
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `№`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 5, // 20% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // First Cell: Full Name
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Исполнитель`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 17, // 20% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // First Cell: All
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Всего`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 6, // 20% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // First Cell: January
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Январь`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 6, // 20% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // First Cell: February
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Февраль`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 6, // 20% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // First Cell: March
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Март`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 6, // 20% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // First Cell: April
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Апрель`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 6, // 20% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // First Cell: May
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Май`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 6, // 20% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // First Cell: June
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Июнь`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 6, // 20% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // First Cell: July
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Июль`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 6, // 20% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // First Cell: August
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Август`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 6, // 20% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // First Cell: September
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Сентябрь`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 6, // 20% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // First Cell: October
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Октябрь`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 6, // 20% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // First Cell: November
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Ноябрь`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 6, // 20% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // First Cell: December
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Декабрь`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          // new TextRun({
                          //   text: "(Год рождения)",
                          //   size: 24, // Adjust font size
                          //   font: "Times New Roman",
                          //   break: 1,
                          // }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 6, // 20% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
              ...(statements?.length > 0
                ? statements.map(
                  (statement, index) =>
                    new TableRow({
                      children: [
                        // First Cell: №
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${index + 1}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 5, // 20% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // First Cell: Full Name
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.name}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 17, // 20% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // First Cell: All
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.all_count}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 6, // 20% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // First Cell: January
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.january_count}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 6, // 20% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // First Cell: February
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.february_count}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 6, // 20% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // First Cell: March
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.march_count}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 6, // 20% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // First Cell: April
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.april_count}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 6, // 20% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // First Cell: May
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.may_count}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 6, // 20% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // First Cell: June
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.june_count}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 6, // 20% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // First Cell: July
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.july_count}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 6, // 20% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // First Cell: August
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.august_count}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 6, // 20% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // First Cell: September
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.september_count}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 6, // 20% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // First Cell: October
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.october_count}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 6, // 20% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // First Cell: November
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.november_count}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 6, // 20% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                        // First Cell: December
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${statement?.december_count}`,
                                  bold: false,
                                  size: 24, // Large font size for title
                                }),
                                // new TextRun({
                                //   text: "(Год рождения)",
                                //   size: 24, // Adjust font size
                                //   font: "Times New Roman",
                                //   break: 1,
                                // }),
                              ],
                              color: "0f0f0f",
                              alignment: AlignmentType.CENTER, // Align to the left
                            }),
                          ],
                          verticalAlign: VerticalAlign.CENTER,
                          width: {
                            size: 6, // 20% width for the title
                            type: WidthType.PERCENTAGE,
                          },
                        }),
                      ],
                      verticalAlign: VerticalAlign.CENTER,
                      spacing: { after: 276 },
                    })
                )
                : new TableRow({
                  children: [
                    new TableCell({
                      children: [],
                    }),
                  ],
                })),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            // borders: {
            //   top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            //   bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            //   left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            //   right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            //   insideHorizontal: {
            //     style: BorderStyle.NONE,
            //     size: 0,
            //     color: "FFFFFF",
            //   },
            //   insideVertical: {
            //     style: BorderStyle.NONE,
            //     size: 0,
            //     color: "FFFFFF",
            //   },
            // },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          // Bottom decorative line
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________",
                size: 12,
                bold: true,
                color: "000000",
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400, before: 400 },
          }),

          // Date and time at the bottom of document
          new Paragraph({
            children: [
              new TextRun({
                text: `Дата составления: ${formatRussianDateTime()}`,
                size: 22,
                italics: true,
                bold: false,
              }),
            ],
            alignment: AlignmentType.RIGHT,
            spacing: { before: 300, after: 200 },
          }),
        ],
      },
    ],
  };
}
