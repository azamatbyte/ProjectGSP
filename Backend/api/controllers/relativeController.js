const { PrismaClient } = require("@prisma/client");
const { RelativeSchema } = require("../helpers/validator");
const { v4: uuidv4, validate: isUuid } = require("uuid");
const { MODEL_TYPE } = require("../helpers/constants");


// Initialize Prisma Client
const prisma = require('../../db/database');

/**
 * @swagger
 * /api/v1/relatives/create:
 *   post:
 *     summary: Create a new relative
 *     tags: [Relatives]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               relationship:
 *                 type: string
 *                 example: "2f9942-4389-4389-4389-4389"
 *               fullName:
 *                 type: string
 *                 example: "Иванов И"
 *               nationality:
 *                 type: string
 *                 example: "Узбек"
 *               birthYear:
 *                 type: integer
 *                 example: true
 *               birthDate:
 *                 type: string
 *                 format: date
 *                 example: "1985-05-15"
 *               birthPlace:
 *                 type: string
 *                 example: "Москва"
 *               residence:
 *                 type: string
 *                 example: "Москва"
 *               workplace:
 *                 type: string
 *                 example: "IT Company"
 *               position:
 *                 type: string
 *                 example: "IT Engineer"
 *               accessStatus:
 *                 type: string
 *                 example: "ДОСТУП"
 *               notes:
 *                 type: string
 *                 example: "Brother of the applicant"
 *               additionalNotes:
 *                 type: string
 *                 example: "Additional information"
 *               fatherName:
 *                 type: string
 *                 example: "Иванович"
 *               firstName:
 *                 type: string
 *                 example: "Иван"
 *               lastName:
 *                 type: string
 *                 example: "Иванов"
 *               relationDegree:
 *                 type: string
 *                 example: "Иванов"
 *     responses:
 *       201:
 *         description: Relative created successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
exports.createRelative = async (req, res) => {
  try {
    // Foydalanuvchi kiritgan ma'lumotlarni olish
    const {
      relationship,
      birthYear,
      birthDate,
      birthPlace,
      residence,
      workplace,
      position,
      accessStatus,
      notes,
      additionalNotes,
      fatherName,
      or_tab,
      model = "relative",
      firstName,
      lastName,
      nationality,
      relationDegree,
    } = req.body;
    console.log(req.body);
    // Kiritilgan ma'lumotlarni tekshirish
    if (!relationship || !fatherName || !firstName || !lastName) {
      return res.status(400).json({
        code: 400,
        message:
          "Relationship, father name, first name and last name are required",
      });
    }
    const fullName = lastName + " " + firstName + " " + fatherName;

    // Qarindosh ma'lumotlarini tayyorlash
    const relativeData = {
      registrationId: relationship ? relationship.trim() : "",
      fullName: fullName ? fullName.trim() : "",
      birthPlace: birthPlace ? birthPlace.trim() : "",
      residence: residence ? residence.trim() : "",
      workplace: workplace ? workplace.trim() : "",
      position: position ? position.trim() : "",
      accessStatus: accessStatus ? accessStatus.trim() : "",
      notes: notes ? notes.trim() : "",
      additionalNotes: additionalNotes ? additionalNotes.trim() : "",
      whoAdd: req.userId,
      or_tab: or_tab ? or_tab.trim() : "",
      fatherName: fatherName ? fatherName.trim() : "",
      firstName: firstName ? firstName.trim() : "",
      lastName: lastName ? lastName.trim() : "",
      model: model ? model.trim() : "",
      executorId: req.userId,
      relationDegree: relationDegree ? relationDegree.trim() : "",
      nationality: nationality ? nationality.trim() : "",
    };

    // Only process birthDate if it's a non-empty string
    if (birthDate && birthDate !== "") {
      // Validate that birthDate is a valid date string
      const parsedDate = new Date(birthDate);

      // Check if the date is valid (not "Invalid Date")
      if (!isNaN(parsedDate.getTime())) {
        relativeData.birthDate = parsedDate;
      } else {
        console.warn(`Invalid birthDate provided: ${birthDate}. Skipping birthDate.`);
      }
    }
    if (birthYear) {
      relativeData.birthYear = birthYear ? parseInt(birthYear) : 0;
    }
    console.log(relativeData);
    // Validatsiya
    const checkRegNumber = await prisma.registration.findFirst({
      where: {
        id: relationship,
      },
    });

    if (!checkRegNumber) {
      return res
        .status(400)
        .json({ code: 400, message: "Relationship not found" });
    }

    relativeData.regNumber = checkRegNumber.regNumber;
    console.log(relativeData);
    // Validatsiya
    const validationResult = RelativeSchema.safeParse(relativeData);
    console.log("validationResult");
    console.log(validationResult?.error);
    if (!validationResult.success) {
      return res
        .status(400)
        .json({ code: 400, message: validationResult.error.message });
    }
    // Qarindoshni bazaga qo'shish
    const newRelative = await prisma.relatives.create({
      data: relativeData,
    });

    // Yangi qarindoshni qaytarish
    return res.status(201).json({
      code: 201,
      message: "Relative created successfully",
      data: newRelative,
    });
  } catch (error) {
    console.error("Error during relative creation:", error);
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
 * /api/v1/relatives/search:
 *   get:
 *     summary: "Ro'yxatga olish IDsi bo'yicha qarindoshlar ro'yxatini olish"
 *     tags: [Relatives]
 *     parameters:
 *       - in: query
 *         name: registrationId
 *         schema:
 *           type: string
 *         required: true
 *         description: "Ro'yxatga olish IDsi"
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
 *         description: "Qarindoshlar muvaffaqiyatli topildi"
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
 *                   example: "Relatives found"
 *                 total_pages:
 *                   type: integer
 *                   example: 5
 *                 total_relatives:
 *                   type: integer
 *                   example: 50
 *                 relatives:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       fullName:
 *                         type: string
 *                       relationship:
 *                         type: string
 *                       birthDate:
 *                         type: string
 *                         format: date
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       400:
 *         description: "Xato: Barcha kiritishlar talab qilinadi yoki noto'g'ri ma'lumotlar"
 *       404:
 *         description: "Qarindoshlar topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.getRelativesList = async (req, res) => {
  try {
    const {
      registrationId,
      pageNumber = 1,
      pageSize = 10,
      model = "relative",
    } = req.query;

    const filters = {
      AND: [
        registrationId ? { registrationId: { equals: registrationId } } : {},
        model ? { model: { equals: model } } : {},
      ].filter(Boolean),
    };

    const page = parseInt(pageNumber, 10);
    const size = parseInt(pageSize, 10);

    if (isNaN(page) || isNaN(size) || page < 1 || size < 1) {
      return res.status(400).json({ message: "Invalid pagination parameters" });
    }

    // Bitta tranzaksiyada umumiy son va sahifalangan ma'lumotlarni olish
    const [totalRelatives, relatives] = await prisma.$transaction([
      prisma.relatives.count({ where: filters }),
      prisma.relatives.findMany({
        where: filters,
        orderBy: { createdAt: "asc" },
        skip: (page - 1) * size,
        take: size,
      }),
    ]);

    const totalPages = Math.ceil(totalRelatives / size);

    if (!relatives.length) {
      return res.status(404).json({ code: 404, message: "No relatives found" });
    }

    return res.status(200).json({
      code: 200,
      message: "Relatives found",
      total_pages: totalPages,
      total_relatives: totalRelatives,
      relatives,
    });
  } catch (err) {
    console.error("Error fetching relatives list:", err);
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
 * /api/v1/relatives/list:
 *   post:
 *     summary: Get list of relatives with pagination and filters
 *     tags: [Relatives]
 *     parameters:
 *       - in: query
 *         name: pageNumber
 *         schema:
 *           type: integer
 *           default: 1
 *         required: false
 *         description: Page number
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 10
 *         required: false
 *         description: Number of items per page
 *       - in: body
 *         name: search
 *         schema:
 *           type: string
 *         required: false
 *         description: Search by name, registration number, or father's name
 *     responses:
 *       200:
 *         description: Successfully retrieved relatives list
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
 *                   example: Relatives found successfully
 *                 total_pages:
 *                   type: integer
 *                 total_relatives:
 *                   type: integer
 *                 relatives:
 *                   type: array
 *       400:
 *         description: Invalid pagination parameters
 *       404:
 *         description: No relatives found
 *       500:
 *         description: Internal server error
 */
exports.searchRelatives = async (req, res) => {
  try {
    const { pageNumber = 1, pageSize = 10, query } = req.query;
    let {
      regNumber,
      firstName,
      lastName,
      fatherName,
      birthPlace,
      workplace,
      model = "relative",
      sort,
    } = req.body;

    const page = parseInt(pageNumber, 10);
    const size = parseInt(pageSize, 10);

    if (isNaN(page) || isNaN(size) || page < 1 || size < 1) {
      return res.status(400).json({
        code: 400,
        message: "Invalid pagination parameters",
      });
    }

    // console.log(firstName);
    console.log(req.body);
    // console.log(JSON.parse(query));

    const filters = {
      AND: [
        firstName
          ? {
            firstName: {
              contains: firstName
                .replace(/%/g, "")
                .replace(/\*/g, "%")
                .trim(),
              mode: "insensitive",
            },
          }
          : {},
        lastName
          ? {
            lastName: {
              contains: lastName.replace(/%/g, "").replace(/\*/g, "%").trim(),
              mode: "insensitive",
            },
          }
          : {},
        fatherName
          ? {
            fatherName: {
              contains: fatherName
                .replace(/%/g, "")
                .replace(/\*/g, "%")
                .trim(),
              mode: "insensitive",
            },
          }
          : {},
        regNumber
          ? {
            regNumber: {
              contains: regNumber
                .replace(/%/g, "")
                .replace(/\*/g, "%")
                .trim(),
              mode: "insensitive",
            },
          }
          : {},
        birthPlace
          ? {
            birthPlace: {
              contains: birthPlace
                .replace(/%/g, "")
                .replace(/\*/g, "%")
                .trim(),
              mode: "insensitive",
            },
          }
          : {},
        workplace
          ? {
            workplace: {
              contains: workplace
                .replace(/%/g, "")
                .replace(/\*/g, "%")
                .trim(),
              mode: "insensitive",
            },
          }
          : {},
        model ? { model: { equals: model } } : {},
      ].filter(Boolean),
    };

    console.log(filters);

    // Cyrillic-friendly ordering for name fields using Intl.Collator
    const nameSortableFields = new Set(["fullName", "firstName", "lastName", "fatherName"]);

    const getSortEntry = (s) => {
      if (!s || typeof s !== "object") return null;
      const entries = Object.entries(s);
      if (entries.length !== 1) return null;
      const [field, directionOrObj] = entries[0];
      let direction = "asc";
      if (typeof directionOrObj === "string") direction = directionOrObj;
      else if (
        directionOrObj &&
        typeof directionOrObj === "object" &&
        typeof directionOrObj.sort === "string"
      ) {
        direction = directionOrObj.sort;
      }
      return { field, direction: direction?.toLowerCase() === "desc" ? "desc" : "asc" };
    };

    const sortEntry = getSortEntry(sort);

    const includeRelations = {
      registration: {
        select: {
          regNumber: true,
          id: true,
          fullName: true,
        },
      },
      Initiator: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
        },
      },
      executor: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
        },
      },
    };

    let totalRelatives;
    let relatives;

    if (sortEntry && nameSortableFields.has(sortEntry.field)) {
      // Fetch all IDs + the target field, sort with Cyrillic collator, then page
      const toSelect = { id: true };
      toSelect[sortEntry.field] = true;
      const allForSort = await prisma.relatives.findMany({
        where: filters,
        select: toSelect,
      });

      const collator = new Intl.Collator(["ru", "uk", "kk", "uz"], {
        sensitivity: "base",
        numeric: true,
        usage: "sort",
      });

      allForSort.sort((a, b) => {
        const av = (a[sortEntry.field] || "").toString();
        const bv = (b[sortEntry.field] || "").toString();
        const cmp = collator.compare(av, bv);
        return sortEntry.direction === "desc" ? -cmp : cmp;
      });

      totalRelatives = allForSort.length;
      const offset = (page - 1) * size;
      const pageIds = allForSort.slice(offset, offset + size).map((r) => r.id);

      if (pageIds.length === 0) {
        relatives = [];
      } else {
        const unordered = await prisma.relatives.findMany({
          where: { id: { in: pageIds } },
          include: includeRelations,
        });
        const pos = new Map(pageIds.map((id, i) => [id, i]));
        unordered.sort((a, b) => pos.get(a.id) - pos.get(b.id));
        relatives = unordered;
      }
    } else {
      // Default DB-side ordering
      const [count, rows] = await prisma.$transaction([
        prisma.relatives.count({ where: filters }),
        prisma.relatives.findMany({
          where: filters,
          include: includeRelations,
          orderBy: sort ? sort : { createdAt: "desc" },
          skip: (page - 1) * size,
          take: size,
        }),
      ]);
      totalRelatives = count;
      relatives = rows;
    }

    const totalPages = Math.ceil(totalRelatives / size);

    if (!relatives.length) {
      return res.status(404).json({
        code: 404,
        message: "No relatives found",
      });
    }

    // Truncate notes and additionalNotes fields if they exceed 600 characters
    const processedRelatives = relatives.map(relative => {
      const processed = { ...relative };
      if (processed.notes && processed.notes.length > 600) {
        processed.notes = processed.notes.slice(0, 600) + "...";
      }
      if (processed.additionalNotes && processed.additionalNotes.length > 600) {
        processed.additionalNotes = processed.additionalNotes.slice(0, 600) + "...";
      }
      return processed;
    });

    return res.status(200).json({
      code: 200,
      message: "Relatives found successfully",
      total_pages: totalPages,
      total_relatives: totalRelatives,
      relatives: processedRelatives,
    });
  } catch (error) {
    console.error("Error searching relatives:", error);
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
 * /api/v1/relatives/delete/{id}:
 *   delete:
 *     summary: "Qarindoshni ID bo'yicha o'chirish"
 *     tags: [Relatives]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Qarindosh IDsi"
 *     responses:
 *       200:
 *         description: "Qarindosh muvaffaqiyatli o'chirildi"
 *       404:
 *         description: "Qarindosh topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.deleteRelative = async (req, res) => {
  try {
    // Foydalanuvchi kiritgan ma'lumotlarni olish
    const { id } = req.params;

    // Kiritilgan ma'lumotlarni tekshirish
    if (!id) {
      return res.status(400).json({
        code: 400,
        message: "ID is required",
      });
    }
    const relatives = await prisma.relatives.findUnique({
      where: { id },
      include: {
        executor: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
          },
        },
        Initiator: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
          },
        },
        registration: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    });
    if (!relatives) {
      return res.status(404).json({
        code: 404,
        message: "Qarindosh topilmadi",
      });
    }

    await prisma
      .$transaction([
        prisma.archive.create({
          data: {
            name: relatives.fullName,
            data: relatives,
            executorId: relatives.executorId,
          },
        }),
        prisma.relatives.delete({
          where: { id },
        }),
      ])
      .catch((err) => {
        // Agar qarindosh topilmasa, Prisma xatosini ushlash
        if (err.code === "P2025") {
          return null;
        }
        throw err;
      });

    // Muvaffaqiyatli javob qaytarish
    return res.status(200).json({
      code: 200,
      message: "Relative deleted successfully",
    });
  } catch (err) {
    console.error("Error during relative deletion:", err);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: err.message,
    });
  } finally {
    // Prisma clientni uzish

  }
};

/**
 * @swagger
 * /api/v1/relatives/getById/{id}:
 *   get:
 *     summary: "Qarindoshni ID bo'yicha olish"
 *     tags: [Relatives]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Qarindosh IDsi"
 *     responses:
 *       200:
 *         description: "Qarindosh muvaffaqiyatli topildi"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 fullName:
 *                   type: string
 *                 relationship:
 *                   type: string
 *                 birthDate:
 *                   type: string
 *                   format: date
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: "Qarindosh topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;

    // Qarindoshni bazadan topish
    const relative = await prisma.relatives.findUnique({
      where: { id },
      include: {
        registration: {
          select: {
            regNumber: true,
            id: true,
            fullName: true,
            firstName: true,
            lastName: true,
            fatherName: true,
          },
        },
        Initiator: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            father_name: true,
          },
        },
        executor: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            father_name: true,
          },
        },
      },
    });

    // Agar qarindosh topilmasa
    if (!relative) {
      return res.status(404).json({
        code: 404,
        message: "Relative not found",
      });
    }

    // Muvaffaqiyatli javob qaytarish
    return res.status(200).json({
      code: 200,
      message: "Relative found",
      relative,
    });
  } catch (error) {
    console.error("Error fetching relative by ID:", error);
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
 * /api/v1/relatives/deplicateRelative/{id}:
 *   post:
 *     summary: "Qarindoshni ID bo'yicha olish"
 *     tags: [Relatives]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Qarindosh IDsi"
 *     responses:
 *       200:
 *         description: "Qarindosh muvaffaqiyatli topildi"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 fullName:
 *                   type: string
 *                 relationship:
 *                   type: string
 *                 birthDate:
 *                   type: string
 *                   format: date
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: "Qarindosh topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.deplicateRelative = async (req, res) => {
  try {
    const { id } = req.params;

    // Qarindoshni bazadan topish
    const relative = await prisma.relatives.findUnique({
      where: { id },
    });

    // Agar qarindosh topilmasa
    if (!relative) {
      return res.status(404).json({
        code: 404,
        message: "Relative not found",
      });
    }

    const duplicateRelative = await prisma.relatives.create({
      data: {
        ...relative,
        id: undefined,
      },
    });

    // Muvaffaqiyatli javob qaytarish
    return res.status(200).json({
      code: 200,
      message: "Relative found and duplicated",
      duplicateRelative,
    });
  } catch (error) {
    console.error("Error duplicating relative:", error);
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
 * /api/v1/relatives/list_by_registrationId:
 *   post:
 *     summary: "Qarindoshlar darajalarini olish"
 *     tags: [Relatives]
 *     parameters:
 *       - in: query
 *         name: registrationId
 *         schema:
 *           type: string
 *         required: true
 *         description: "Ro'yxatga olish IDsi"
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
 *         description: "Qarindoshlar darajalari muvaffaqiyatli topildi"
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
 *                   example: "Relation degrees found"
 *                 total_pages:
 *                   type: integer
 *                 total_degrees:
 *                   type: integer
 *                 degrees:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       relationDegree:
 *                         type: string
 *       400:
 *         description: "Xato: Barcha kiritishlar talab qilinadi yoki noto'g'ri ma'lumotlar"
 *       404:
 *         description: "Qarindoshlar darajalari topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.getRelativesListByRegistrationId = async (req, res) => {
  try {
    console.log("i am here");

    const { pageNumber = 1, pageSize = 10 } = req.query;
    const { params = {}, sort } = req.body || {};

    const { id: registrationId, model } = params;

    if (!registrationId) {
      return res
        .status(400)
        .json({ code: 400, message: "Registration ID is required" });
    }

    console.log(sort);

    const page = parseInt(pageNumber, 10);
    const size = parseInt(pageSize, 10);

    if (isNaN(page) || isNaN(size) || page < 1 || size < 1) {
      return res
        .status(400)
        .json({ code: 400, message: "Invalid pagination parameters" });
    }
    const filters = {
      AND: [
        registrationId ? { registrationId: { equals: registrationId } } : {},
        model ? { model: { equals: model } } : {},
      ].filter(Boolean),
    };

    let totalRelatives;
    let relatives;

    // Cyrillic-aware sorting for specific name fields
    const nameSortableFields = new Set(["firstName", "lastName", "fatherName"]);
    const getSortEntry = (s) => {
      if (!s || typeof s !== "object") return null;
      const entries = Object.entries(s);
      if (entries.length !== 1) return null;
      const [field, directionOrObj] = entries[0];
      let direction = "asc";
      if (typeof directionOrObj === "string") direction = directionOrObj;
      else if (
        directionOrObj &&
        typeof directionOrObj === "object" &&
        typeof directionOrObj.sort === "string"
      ) {
        direction = directionOrObj.sort;
      }
      return {
        field,
        direction: direction?.toLowerCase() === "desc" ? "desc" : "asc",
      };
    };

    const sortEntry = getSortEntry(sort);

    if (sortEntry && nameSortableFields.has(sortEntry.field)) {
      // Fetch all IDs + the target field, sort with Russian collator, then page
      const toSelect = { id: true };
      toSelect[sortEntry.field] = true;
      const allForSort = await prisma.relatives.findMany({
        where: filters,
        select: toSelect,
      });

      const collator = new Intl.Collator(["ru", "uk", "kk", "uz"], {
        sensitivity: "base",
        numeric: true,
        usage: "sort",
      });

      allForSort.sort((a, b) => {
        const av = (a[sortEntry.field] || "").toString();
        const bv = (b[sortEntry.field] || "").toString();
        const cmp = collator.compare(av, bv);
        return sortEntry.direction === "desc" ? -cmp : cmp;
      });

      totalRelatives = allForSort.length;
      const offset = (page - 1) * size;
      const pageIds = allForSort.slice(offset, offset + size).map((r) => r.id);

      if (pageIds.length === 0) {
        relatives = [];
      } else {
        const unordered = await prisma.relatives.findMany({
          where: { id: { in: pageIds } },
          select: {
            id: true,
            relationDegree: true,
            fullName: true,
            firstName: true,
            lastName: true,
            fatherName: true,
            birthYear: true,
            birthDate: true,
            birthPlace: true,
            residence: true,
            workplace: true,
            position: true,
            notes: true,
            model: true,
            additionalNotes: true,
          },
        });
        const pos = new Map(pageIds.map((id, i) => [id, i]));
        unordered.sort((a, b) => pos.get(a.id) - pos.get(b.id));
        relatives = unordered;
      }
    } else {
      // Default DB-side ordering
      const result = await prisma.$transaction([
        prisma.relatives.count({ where: filters }),
        prisma.relatives.findMany({
          where: filters,
          select: {
            id: true,
            relationDegree: true,
            fullName: true,
            firstName: true,
            lastName: true,
            fatherName: true,
            birthYear: true,
            birthDate: true,
            birthPlace: true,
            residence: true,
            workplace: true,
            position: true,
            notes: true,
            model: true,
            additionalNotes: true,
          },
          orderBy: [sort ? sort : { createdAt: "asc" }],
          skip: (page - 1) * size,
          take: size,
        }),
      ]);
      totalRelatives = result[0];
      relatives = result[1];
    }
    const totalPages = Math.ceil(totalRelatives / size);

    if (!relatives.length) {
      return res
        .status(404)
        .json({ code: 404, message: "No relation degrees found" });
    }

    relatives = relatives.map(relative => {
      const processed = { ...relative };
      if (processed.notes && processed.notes.length > 600) {
        processed.notes = processed.notes.slice(0, 600) + "...";
      }
      if (processed.additionalNotes && processed.additionalNotes.length > 600) {
        processed.additionalNotes = processed.additionalNotes.slice(0, 600) + "...";
      }
      return processed;
    });

    return res.status(200).json({
      code: 200,
      message: "Relation degrees found",
      total_pages: totalPages,
      total_relatives: totalRelatives,
      relatives,
    });
  } catch (error) {
    console.error("Error fetching relation degrees:", error);
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
 * /api/v1/relatives/update/{id}:
 *   put:
 *     summary: "Qarindosh ma'lumotlarini yangilash"
 *     tags: [Relatives]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Qarindosh IDsi"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               relationshipId:
 *                 type: string
 *               fullName:
 *                 type: string
 *               nationality:
 *                 type: string
 *               birthYear:
 *                 type: integer
 *               birthDate:
 *                 type: string
 *                 format: date
 *               birthPlace:
 *                 type: string
 *               residence:
 *                 type: string
 *               workplace:
 *                 type: string
 *               position:
 *                 type: string
 *               accessStatus:
 *                 type: string
 *               notes:
 *                 type: string
 *               additionalNotes:
 *                 type: string
 *               fatherName:
 *                 type: string
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               relationDegree:
 *                 type: string
 *     responses:
 *       200:
 *         description: "Qarindosh ma'lumotlari muvaffaqiyatli yangilandi"
 *       400:
 *         description: "Xato: Barcha kiritishlar talab qilinadi yoki noto'g'ri ma'lumotlar"
 *       404:
 *         description: "Qarindosh topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.updateRelative = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      relationshipId,
      birthYear,
      birthDate,
      birthPlace,
      residence,
      workplace,
      position,
      accessStatus,
      notes = "",
      model,
      additionalNotes = "",
      fatherName,
      firstName,
      or_tab,
      lastName,
      relationDegree,
      nationality,
    } = req.body;
    var notesData = "";

    if (!id) {
      return res
        .status(400)
        .json({ code: 400, message: "Relative ID is required" });
    }

    const currentRelative = await prisma.relatives.findUnique({
      where: { id },
    });
    if (!currentRelative) {
      return res.status(404).json({ code: 404, message: "Relative not found" });
    }

    const data = {};
    const logs = [];

    if (
      relationshipId !== currentRelative.relationshipId &&
      relationshipId != null &&
      relationshipId.trim() !== ""
    ) {
      data.relationshipId = relationshipId.trim();
      logs.push({
        recordId: id,
        tableName: "Relatives",
        fieldName: "relationshipId",
        oldValue: currentRelative.relationshipId || "",
        newValue: relationshipId || "",
        executorId: req.userId,
      });
    }

    if (
      model !== currentRelative.model &&
      model != null &&
      model.trim() !== ""
    ) {
      data.model = model.trim();
      logs.push({
        recordId: id,
        tableName: "Relatives",
        fieldName: "model",
        oldValue: currentRelative.model || "",
        newValue: model || "",
        executorId: req.userId,
      });
    }

    if (birthYear !== currentRelative.birthYear && birthYear != null) {
      data.birthYear = birthYear;
      const safeString = require("../helpers/safeString");
      logs.push({
        recordId: id,
        tableName: "Relatives",
        fieldName: "birthYear",
        oldValue: safeString(currentRelative.birthYear),
        newValue: safeString(birthYear),
        executorId: req.userId,
      });
    }

    if (
      nationality !== currentRelative.nationality &&
      nationality != null &&
      nationality.trim() !== ""
    ) {
      data.nationality = nationality.trim();
      logs.push({
        recordId: id,
        tableName: "Relatives",
        fieldName: "nationality",
        oldValue: currentRelative.nationality || "",
        newValue: nationality || "",
        executorId: req.userId,
      });
    }

    // Only process birthDate if it's a non-empty string and different from current value
    if (birthDate !== currentRelative.birthDate && birthDate != null && birthDate !== "") {
      // Validate that birthDate is a valid date string
      const parsedDate = new Date(birthDate);

      // Check if the date is valid (not "Invalid Date")
      if (!isNaN(parsedDate.getTime())) {
        data.birthDate = parsedDate;
        logs.push({
          recordId: id,
          tableName: "Relatives",
          fieldName: "birthDate",
          oldValue: currentRelative.birthDate
            ? currentRelative.birthDate.toISOString()
            : "",
          newValue: parsedDate.toISOString(),
          executorId: req.userId,
        });
      } else {
        console.warn(`Invalid birthDate provided: ${birthDate}. Skipping birthDate update.`);
      }
    }

    if (
      birthPlace !== currentRelative.birthPlace &&
      birthPlace != null &&
      birthPlace.trim() !== ""
    ) {
      data.birthPlace = birthPlace.trim();
      logs.push({
        recordId: id,
        tableName: "Relatives",
        fieldName: "birthPlace",
        oldValue: currentRelative.birthPlace || "",
        newValue: birthPlace || "",
        executorId: req.userId,
      });
    }

    if (
      residence !== currentRelative.residence &&
      residence != null &&
      residence.trim() !== ""
    ) {
      data.residence = residence.trim();
      logs.push({
        recordId: id,
        tableName: "Relatives",
        fieldName: "residence",
        oldValue: currentRelative.residence || "",
        newValue: residence || "",
        executorId: req.userId,
      });
    }

    if (
      workplace !== currentRelative.workplace &&
      workplace != null &&
      workplace.trim() !== ""
    ) {
      data.workplace = workplace.trim();
      logs.push({
        recordId: id,
        tableName: "Relatives",
        fieldName: "workplace",
        oldValue: currentRelative.workplace || "",
        newValue: workplace || "",
        executorId: req.userId,
      });
    }

    if (
      position !== currentRelative.position &&
      position != null &&
      position.trim() !== ""
    ) {
      data.position = position.trim();
      logs.push({
        recordId: id,
        tableName: "Relatives",
        fieldName: "position",
        oldValue: currentRelative.position || "",
        newValue: position || "",
        executorId: req.userId,
      });
    }

    if (
      accessStatus !== currentRelative.accessStatus &&
      accessStatus != null &&
      accessStatus.trim() !== ""
    ) {
      data.accessStatus = accessStatus.trim();
      logs.push({
        recordId: id,
        tableName: "Relatives",
        fieldName: "accessStatus",
        oldValue: currentRelative.accessStatus || "",
        newValue: accessStatus || "",
        executorId: req.userId,
      });
    }
    if (
      notes != currentRelative.notes &&
      notes != null &&
      notes.trim() !== ""
    ) {
      data.notes = notes.trim();
      logs.push({
        recordId: id,
        tableName: "Relatives",
        fieldName: "notes",
        oldValue: currentRelative.notes || "",
        newValue: notes || "",
        executorId: req.userId,
      });

      const currentRegistration = await prisma.registration.findUnique({
        where: { id: currentRelative.registrationId },
      });
      notesData = currentRegistration.additionalNotes;
      notesData =
        notesData === ""
          ? currentRelative.relationDegree + ":  " + notes
          : notesData + "\n" + currentRelative.relationDegree + ":  " + notes;
    }

    if (
      additionalNotes !== currentRelative.additionalNotes &&
      additionalNotes != null &&
      additionalNotes.trim() !== ""
    ) {
      data.additionalNotes = additionalNotes.trim();
      logs.push({
        recordId: id,
        tableName: "Relatives",
        fieldName: "additionalNotes",
        oldValue: currentRelative.additionalNotes || "",
        newValue: additionalNotes || "",
        executorId: req.userId,
      });
    }

    if (
      fatherName !== currentRelative.fatherName &&
      fatherName != null &&
      fatherName.trim() !== ""
    ) {
      data.fatherName = fatherName.trim();
      logs.push({
        recordId: id,
        tableName: "Relatives",
        fieldName: "fatherName",
        oldValue: currentRelative.fatherName || "",
        newValue: fatherName || "",
        executorId: req.userId,
      });
    }

    if (
      firstName !== currentRelative.firstName &&
      firstName != null &&
      firstName.trim() !== ""
    ) {
      data.firstName = firstName.trim();
      logs.push({
        recordId: id,
        tableName: "Relatives",
        fieldName: "firstName",
        oldValue: currentRelative.firstName || "",
        newValue: firstName || "",
        executorId: req.userId,
      });
    }

    if (
      lastName !== currentRelative.lastName &&
      lastName != null &&
      lastName.trim() !== ""
    ) {
      data.lastName = lastName.trim();
      logs.push({
        recordId: id,
        tableName: "Relatives",
        fieldName: "lastName",
        oldValue: currentRelative.lastName || "",
        newValue: lastName || "",
        executorId: req.userId,
      });
    }

    if (
      relationDegree !== currentRelative.relationDegree &&
      relationDegree != null &&
      relationDegree.trim() !== ""
    ) {
      data.relationDegree = relationDegree.trim();
      logs.push({
        recordId: id,
        tableName: "Relatives",
        fieldName: "relationDegree",
        oldValue: currentRelative.relationDegree || "",
        newValue: relationDegree || "",
        executorId: req.userId,
      });
    }

    if (isUuid(or_tab)) {
      if (
        or_tab !== currentRelative.or_tab &&
        or_tab != null &&
        or_tab.trim() !== ""
      ) {
        data.or_tab = or_tab.trim();
        logs.push({
          recordId: id,
          tableName: "Relatives",
          fieldName: "or_tab",
          oldValue: currentRelative.or_tab || "",
          newValue: or_tab || "",
          executorId: req.userId,
        });
      }
    }
    if (Object.keys(data).length === 0) {
      return res
        .status(400)
        .json({ code: 400, message: "No changes to update" });
    }

    if (data.firstName || data.lastName || data.fatherName) {
      fullName = `${data.lastName ? data.lastName : currentRelative.lastName
        } ${data.firstName ? data.firstName : currentRelative.firstName} ${data.fatherName ? data.fatherName : currentRelative.fatherName
        }`;
      data.fullName = fullName;
    }

    const transaction = [
      prisma.relatives.update({
        where: { id },
        data,
      }),
      //relative notes update
      // ...(notesData !== ""
      //   ? [
      //       prisma.registration.update({
      //         where: { id: currentRelative.registrationId },
      //         data: { additionalNotes: notesData },
      //       }),
      //     ]
      //   : []),
      ...logs.map((log) => prisma.log.create({ data: log })),
    ];

    await prisma.$transaction(transaction);

    return res
      .status(200)
      .json({ code: 200, message: "Relative updated successfully" });
  } catch (error) {
    console.error("Error updating relative:", error);
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
 * /api/v1/relatives/byRegistrationId/{id}:
 *   get:
 *     summary: "Ro'yxatga olish IDsi bo'yicha barcha qarindoshlarni olish"
 *     tags: [Relatives]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Ro'yxatga olish IDsi"
 *     responses:
 *       200:
 *         description: "Qarindoshlar muvaffaqiyatli topildi"
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
 *                   example: "Relatives found"
 *                 relatives:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       fullName:
 *                         type: string
 *                       relationship:
 *                         type: string
 *                       birthDate:
 *                         type: string
 *                         format: date
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       404:
 *         description: "Qarindoshlar topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.getRelativesByRegistrationId = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, model = "relative" } = req.query;

    // Qarindoshlarni ro'yxatga olish IDsi bo'yicha topish
    const relatives = await prisma.relatives.findMany({
      where: {
        registrationId: id,
        model: model,
        ...(type != "all" && { AND: [{ notes: { not: null } }, { notes: { not: "" } }] }),
      },
      select: {
        id: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const registration = await prisma.registration.findFirst({
      where: { id: id },
      select: {
        id: true,
        regNumber: true,
      },
    });
    if (registration && !relatives?.length) {
      const id_of_registration = await prisma.registration.findMany({
        where: {
          regNumber: registration.regNumber,
          model: "registration4",
          AND: [{ notes: { not: null } }, { notes: { not: "" } }],
        },
        select: {
          id: true,
        },
      });
      console.log({
        regNumber: registration.regNumber,
        model: "registration4",
        AND: [{ notes: { not: null } }, { notes: { not: "" } }],
      });

      console.log(id_of_registration);
      return res.status(200).json({
        code: 200,
        message: "Relatives found",
        relatives: id_of_registration,
      });
    }
    // Agar qarindoshlar topilmasa
    if (!relatives) {
      return res.status(404).json({
        code: 404,
        message: "Relatives not found",
        relatives: [],
      });
    }

    // Muvaffaqiyatli javob qaytarish
    return res.status(200).json({
      code: 200,
      message: "Relatives found",
      relatives,
    });
  } catch (error) {
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
 * /api/v1/relatives/byRegistrationId/{id}:
 *   get:
 *     summary: "Ro'yxatga olish IDsi bo'yicha barcha qarindoshlarni olish"
 *     tags: [Relatives]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Ro'yxatga olish IDsi"
 *     responses:
 *       200:
 *         description: "Qarindoshlar muvaffaqiyatli topildi"
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
 *                   example: "Relatives found"
 *                 relatives:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       fullName:
 *                         type: string
 *                       relationship:
 *                         type: string
 *                       birthDate:
 *                         type: string
 *                         format: date
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       404:
 *         description: "Qarindoshlar topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.addRelativesBySession = async (req, res) => {
  try {
    const { id, type, model = "relative" } = req.body;

    const validTypes = ["SESSION", "RESERVE", "RAPORT"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        code: 400,
        message: "Invalid session type",
      });
    }

    // Use transaction to ensure data consistency
    const result = await prisma.$transaction(async (tx) => {
      let order = await tx.session.count({
        where: {
          adminId: req.userId,
          type: type,
        },
      });

      // Find relatives by registration ID
      const relatives = await tx.relatives.findMany({
        where: {
          registrationId: id,
          model: model,
          AND: [
            {
              notes: {
                not: null,
              },
            },
            {
              notes: {
                not: "",
              },
            },
            {
              relationDegree: {
                not: "Сам",
              },
            },
          ],
        },
      });

      // Find registration
      const registration = await tx.registration.findFirst({
        where: { id: id },
      });

      const relativesCheck = await tx.relatives.findFirst({
        where: {
          id: id,
        },
      });


      if (!registration && !relativesCheck) {
        throw new Error("Registration or relatives not found");
      }

      let sessionsCreated = [];

      // if (type === "RAPORT" && registration) {
      //   const conclusionRegNum = `${
      //     registration?.regNumber ? registration.regNumber : ""
      //   } ф-${registration?.form_reg ? registration.form_reg : ""}`;
      //   await tx.registration.update({
      //     where: { id: id },
      //     data: { conclusionRegNum, conclusionDate: new Date() },
      //   });
      //   await tx.registrationLog.create({
      //     data: {
      //       registrationId: id,
      //       fieldName: "conclusionRegNum",
      //       oldValue: registration.conclusionRegNum
      //         ? registration.conclusionRegNum
      //         : "",
      //       newValue: conclusionRegNum,
      //       executorId: req.userId,
      //     },
      //   });
      // }

      // Process relatives if they exist
      if (relatives && relatives.length > 0) {
        // Create sessions for relatives
        for (const relative of relatives) {
          order++;
          const checkSession = await tx.session.findFirst({
            where: {
              registrationId: relative.id,
              type: type,
              adminId: req.userId,
            },
          });
          if (checkSession) {
            continue;
          }
          const session = await tx.session.create({
            data: {
              registrationId: relative.id,
              regNumber: relative.regNumber,
              fullName: relative.fullName,
              firstName: relative.firstName,
              lastName: relative.lastName,
              fatherName: relative.fatherName,
              birthYear: relative.birthYear,
              birthDate: relative.birthDate,
              birthPlace: relative.birthPlace,
              workplace: relative.workplace,
              position: relative.position,
              residence: relative.residence,
              model: relative.relationDegree,
              notes: relative.notes,
              additionalNotes: relative.additionalNotes,
              externalNotes: relative.externalNotes,
              adminId: req.userId,
              type: type,
              order: order,
            },
          });
          sessionsCreated.push(session);
        }

        // Create session for main registration

        const checkSession = await tx.session.findFirst({
          where: {
            registrationId: registration.id,
            type: type,
            adminId: req.userId,
          },
        });
        if (checkSession) {
          return {
            relatives: relatives,
            sessions: sessionsCreated,
          };
        }

        order++;
        const mainSession = await tx.session.create({
          data: {
            registrationId: registration.id,
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
            adminId: req.userId,
            type: type,
            order: order,
          },
        });
        sessionsCreated.push(mainSession);

        return {
          relatives: relatives,
          sessions: sessionsCreated,
        };
      } else if (relativesCheck) {
        const checkSession = await tx.session.findFirst({
          where: {
            registrationId: relativesCheck.id,
            type: type,
            adminId: req.userId,
          },
        });

        const getRegistration = await tx.registration.findFirst({
          where: { id: relativesCheck.registrationId },
        });

        if (!getRegistration) {
          throw new Error("Registration not found");
        }

        if (checkSession) {
          return {
            relatives: relativesCheck,
            sessions: sessionsCreated,
          };
        }

        order++;
        const mainSession = await tx.session.create({
          data: {
            registrationId: relativesCheck.id,
            regNumber: getRegistration.regNumber,
            fullName: relativesCheck.fullName,
            firstName: relativesCheck.firstName,
            lastName: relativesCheck.lastName,
            fatherName: relativesCheck.fatherName,
            birthYear: relativesCheck.birthYear,
            birthDate: relativesCheck.birthDate,
            birthPlace: relativesCheck.birthPlace,
            workplace: relativesCheck.workplace,
            position: relativesCheck.position,
            residence: relativesCheck.residence,
            model: relativesCheck.model,
            notes: relativesCheck.notes,
            additionalNotes: relativesCheck.additionalNotes,
            externalNotes: relativesCheck.externalNotes,
            adminId: req.userId,
            type: type,
            order: order,
          },
        });
        sessionsCreated.push(mainSession);

        return {
          relatives: relativesCheck,
          sessions: sessionsCreated,
        };
      } else {
        // If no relatives found, find registrations with same regNumber
        const id_of_registration = await tx.registration.findMany({
          where: {
            regNumber: registration.regNumber,
            model: MODEL_TYPE.REGISTRATION_FOUR,
            AND: [
              {
                notes: {
                  not: null,
                },
              },
              {
                notes: {
                  not: "",
                },
              },
            ],
          },
        });

        // Create sessions for found registrations
        for (const item of id_of_registration) {
          order++;

          const checkSession = await tx.session.findFirst({
            where: {
              registrationId: item.id,
              type: type,
              adminId: req.userId,
            },
          });
          if (checkSession) {
            continue;
          }
          const session = await tx.session.create({
            data: {
              registrationId: item.id,
              regNumber: item.regNumber,
              fullName: item.fullName,
              firstName: item.firstName,
              lastName: item.lastName,
              fatherName: item.fatherName,
              birthYear: item.birthYear,
              birthDate: item.birthDate,
              birthPlace: item.birthPlace,
              workplace: item.workplace,
              position: item.position,
              residence: item.residence,
              model: item.model,
              notes: item.notes,
              additionalNotes: item.additionalNotes,
              externalNotes: item.externalNotes,
              adminId: req.userId,
              type: type,
              order: order,
            },
          });
          sessionsCreated.push(session);
        }

        // Create session for main registration

        const checkSession = await tx.session.findFirst({
          where: {
            registrationId: registration.id,
            type: type,
            adminId: req.userId,
          },
        });
        if (checkSession) {
          return {
            relatives: id_of_registration,
            sessions: sessionsCreated,
          };
        }

        order++;
        const mainSession = await tx.session.create({
          data: {
            registrationId: registration.id,
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
            adminId: req.userId,
            type: type,
            order: order,
          },
        });
        sessionsCreated.push(mainSession);

        return {
          relatives: id_of_registration,
          sessions: sessionsCreated,
        };
      }
    });

    // Return successful response
    return res.status(200).json({
      code: 200,
      message: "Sessions created successfully",
      relatives: result.relatives,
      sessions: result.sessions,
    });
  } catch (error) {
    console.error("Error in addRelativesBySession:", error);
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
 * /api/v1/relatives/allByRegistrationId/{id}:
 *   get:
 *     summary: "Ro'yxatga olish IDsi bo'yicha barcha qarindoshlarni olish"
 *     tags: [Relatives]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Ro'yxatga olish IDsi"
 *     responses:
 *       200:
 *         description: "Qarindoshlar muvaffaqiyatli topildi"
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
 *                   example: "Relatives found"
 *                 relatives:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       fullName:
 *                         type: string
 *                       relationship:
 *                         type: string
 *                       birthDate:
 *                         type: string
 *                         format: date
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       404:
 *         description: "Qarindoshlar topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.getAllRelativesByRegistrationId = async (req, res) => {
  try {
    const { id } = req.params;
    const { model = "relative" } = req.query;

    // Build where clause for relatives query
    const whereClause = {
      registrationId: id,
      model: model,
    };

    // Find relatives by registration ID
    const relatives = await prisma.relatives.findMany({
      where: whereClause,
      select: {
        id: true,
      },
    });

    // If relatives found, return them
    if (relatives && relatives.length > 0) {
      return res.status(200).json({
        code: 200,
        message: "Relatives found",
        relatives,
      });
    }

    // If no relatives found, try to find registration and look for alternatives
    const registration = await prisma.registration.findFirst({
      where: { id: id },
      select: {
        id: true,
        regNumber: true,
      },
    });

    // If registration not found
    if (!registration) {
      return res.status(404).json({
        code: 404,
        message: "Registration not found",
        relatives: [],
      });
    }

    // Look for alternative registrations with same regNumber
    const alternativeRegistrations = await prisma.registration.findMany({
      where: {
        regNumber: registration.regNumber,
        model: "registration4",
        id: { not: id }, // Exclude the current registration
      },
      select: {
        id: true,
      },
    });

    // Return alternative registrations if found
    if (alternativeRegistrations && alternativeRegistrations.length > 0) {
      return res.status(200).json({
        code: 200,
        message: "Alternative registrations found",
        relatives: alternativeRegistrations,
      });
    }

    // No relatives or alternatives found
    return res.status(404).json({
      code: 404,
      message: "No relatives or alternative registrations found",
      relatives: [],
    });
  } catch (error) {
    console.error("Error in getAllRelativesByRegistrationId:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {

  }
};
