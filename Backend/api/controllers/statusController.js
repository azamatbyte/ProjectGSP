const { PrismaClient } = require("@prisma/client");
const {  AccessStatus } = require("../helpers/validator");

// Initialize Prisma Client
const prisma = require('../../db/database');


/**
 * @swagger
 * /api/v1/status/create:
 *   post:
 *     summary: "Yangi access status yaratish"
 *     tags: [Status]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: "Access status nomi"
 *             example:
 *               name: "Yangi Access Status"
 *     responses:
 *       201:
 *         description: "Access status muvaffaqiyatli yaratildi"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 accessStatus:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     adminId:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: "Noto'g'ri kiritish"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.createAccessStatus = async (req, res) => {
  try {
    const { name } = req.body;

    // Validate input using Zod schema
    const validationResult = AccessStatus.safeParse({ name });
    if (!validationResult.success) {
      return res.status(400).json({
        code: 400,
        message: "Invalid input",
        errors: validationResult.error.errors,
      });
    }

    // Check if the access status already exists
    const existingAccessStatus = await prisma.accessStatus.findUnique({
      where: { name },
    });

    if (existingAccessStatus) {
      return res.status(400).json({ code: 400, message: "Access status already exists" });
    }

    // Create the access status
    const newAccessStatus = await prisma.accessStatus.create({
      data: {
        name,
        adminId:req.userId,
      },
    });

    // Return the newly created access status
    return res.status(201).json({
      code: 201,
      message: "Access status created successfully",
      accessStatus: newAccessStatus,
    });
  } catch (error) {
    console.error("Error creating access status:", error);
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
 * /api/v1/status/list:
 *   get:
 *     summary: "List all access statuses"
 *     tags: [Status]
 *     parameters:
 *       - in: query
 *         name: pageNumber
 *         schema:
 *           type: integer
 *         required: true
 *         description: "Page number for pagination"
 *         default: 1
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *         required: true
 *         description: "Number of access statuses per page"
 *         default: 10
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         description: "Search query for filtering access statuses"
 *     responses:
 *       200:
 *         description: "List of access statuses retrieved successfully"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_pages:
 *                   type: integer
 *                 total_accessStatuses:
 *                   type: integer
 *                 accessStatuses:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       adminId:
 *                         type: string
 *                       status:
 *                         type: boolean
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *       400:
 *         description: "Invalid input"
 *       500:
 *         description: "Internal server error"
 */
exports.listAccessStatuses = async (req, res) => {
  try {
    let { pageNumber, pageSize, query } = req.query;
    pageNumber = parseInt(pageNumber);
    pageSize = parseInt(pageSize);

    // Validate input
    if (!(pageNumber && pageSize)) {
      return res.status(400).json({ code: 400, message: "Page number and page size are required" });
    }

    // Get paginated access statuses from the database
    const accessStatuses = await prisma.accessStatus.findMany({
      skip: (pageNumber - 1) * pageSize,
      take: pageSize,
      orderBy: {
        createdAt: "desc",
      },
      where: {
        name: {
          contains: query.toUpperCase(),
        },
      },
    });

    // Get the total number of access statuses
    const totalAccessStatuses = await prisma.accessStatus.count({
      where: {
        name: {
          contains: query,
        },
      },
    });

    // Calculate total pages
    const totalPages = Math.ceil(totalAccessStatuses / pageSize);

    return res.status(200).json({
      code: 200,
      message: "Access statuses retrieved successfully",
      total_pages: totalPages,
      total_accessStatuses: totalAccessStatuses,
      accessStatuses: accessStatuses,
    });
  } catch (error) {
    console.error("Error retrieving access statuses:", error);
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
 * /api/v1/status/listWithStatus:
 *   get:
 *     summary: "Faol statusli barcha access statuslarni ro'yxatlash"
 *     tags: [Status]
 *     parameters:
 *       - in: query
 *         name: pageNumber
 *         schema:
 *           type: integer
 *         required: true
 *         description: "Sahifalash uchun sahifa raqami"
 *         default: 1
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *         required: true
 *         description: "Har bir sahifadagi access statuslar soni"
 *         default: 10
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         description: "Access statuslarni filtrlash uchun qidiruv so'rovi"
 *     responses:
 *       200:
 *         description: "Faol statusli access statuslar muvaffaqiyatli olindi"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_pages:
 *                   type: integer
 *                 total_forms:
 *                   type: integer
 *                 forms:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       adminId:
 *                         type: string
 *                       status:
 *                         type: boolean
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *       400:
 *         description: "Noto'g'ri kiritish"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.listAccessStatusWithStatus = async (req, res) => {
  try {
    let { pageNumber, pageSize, query } = req.query;
    pageNumber = parseInt(pageNumber);
    pageSize = parseInt(pageSize);

    // Validate input
    if (!(pageNumber && pageSize)) {
      return res.status(400).json({ code: 400, message: "Page number and page size are required" });
    }

    // Get paginated forms from the database
    const accessStatuses = await prisma.accessStatus.findMany({
      skip: (pageNumber - 1) * pageSize,
      take: pageSize,
      orderBy: {
        createdAt: "desc",
      },
      where: {
        name: {
          contains: query.toUpperCase(),
        },
        status: true,
      },
    });

    // Get the total number of forms
    const totalAccessStatuses = await prisma.accessStatus.count({
      where: {
        name: {
          contains: query.toUpperCase(),
        },
        status: true,
      },
    });

    // Calculate total pages
    const totalPages = Math.ceil(totalAccessStatuses / pageSize);

    return res.status(200).json({
      code: 200,
      message: "Access statuses retrieved successfully",
      total_pages: totalPages,
      total_accessStatuses: totalAccessStatuses,
      accessStatuses: accessStatuses,
    });
  } catch (error) {
    console.error("Error retrieving access statuses:", error);
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
 * /api/v1/status/getById/{id}:
 *   get:
 *     summary: "Get an access status by ID"
 *     tags: [Status]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Access status ID"
 *     responses:
 *       200:
 *         description: "Access status retrieved successfully"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 adminId:
 *                   type: string
 *                 status:
 *                   type: boolean
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: "Access status not found"
 *       500:
 *         description: "Internal server error"
 */
exports.getAccessStatusById = async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch the access status from the database
    const accessStatus = await prisma.accessStatus.findUnique({
      where: { id },
    });

    // Handle case when access status is not found
    if (!accessStatus) {
      return res.status(404).json({
        code: 404,
        message: "Access status not found",
      });
    }

    // Respond with the access status data
    return res.status(200).json({
      code: 200,
      message: "Access status retrieved successfully",
      accessStatus,
    });
  } catch (error) {
    console.error("Error retrieving access status:", error);
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
 * /api/v1/status/update/{id}:
 *   put:
 *     summary: "Update an access status by ID"
 *     tags: [Status]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Access status ID"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               status:
 *                 type: boolean
 *             example:
 *               name: "Updated Access Status Name"
 *               adminId: "Updated admin ID"
 *               status: true
 *     responses:
 *       200:
 *         description: "Access status updated successfully"
 *       400:
 *         description: "Invalid input"
 *       404:
 *         description: "Access status not found"
 *       500:
 *         description: "Internal server error"
 */
exports.updateAccessStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, status } = req.body;

    // Validate input using Zod schema
    const validationResult = AccessStatus.safeParse({ name, status });
    if (!validationResult.success) {
      return res.status(400).json({
        code: 400,
        message: "Invalid input",
        errors: validationResult.error.errors,
      });
    }

    // Find the current access status data
    const currentAccessStatus = await prisma.accessStatus.findUnique({ where: { id } });
    if (!currentAccessStatus) {
      return res.status(404).json({ code: 404, message: "Access status not found" });
    }

    // Prepare the update data and logs
    const data = {};
    const logs = [];

    // Compare and update fields only if they are different
    if (name !== currentAccessStatus.name && name != null) {
      data.name = name;
      logs.push({
        recordId: id,
        tableName: "AccessStatus",
        fieldName: "name",
        oldValue: currentAccessStatus.name||"",
        newValue: name||"",
        executorId: req.userId,
      });
    }
    // Perform the update and create logs in a transaction
    await prisma.$transaction([
      prisma.accessStatus.update({
        where: { id },
        data,
      }),
      ...logs.map((log) => prisma.log.create({ data: log })),
    ]);

    // Respond with the updated access status data
    return res.status(200).json({
      code: 200,
      message: "Access status updated successfully",
      accessStatus: { ...currentAccessStatus, ...data },
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        code: 404,
        message: "Access status not found",
      });
    }
    console.error("Error updating access status:", error);
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
 * /api/v1/status/changeStatus:
 *   get:
 *     summary: "Access status statusini o'zgartirish"
 *     tags: [Status]
 *     parameters:
 *       - in: query
 *         name: accessStatusId
 *         schema:
 *           type: string
 *         required: true
 *         description: "Access status IDsi"
 *       - in: query
 *         name: status
 *         schema:
 *           type: boolean
 *         required: true
 *         description: "Yangi status (true/false)"
 *     responses:
 *       200:
 *         description: "Access status statusi muvaffaqiyatli o'zgartirildi"
 *       400:
 *         description: "Xato: Barcha kiritishlar talab qilinadi yoki noto'g'ri ma'lumotlar"
 *       404:
 *         description: "Access status topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.changeAccessStatus = async (req, res) => {
  try {
    // Foydalanuvchi kiritgan ma'lumotlarni olish
    const { accessStatusId, status } = req.query;

    // Kiritilgan ma'lumotlarni tekshirish
    if (!accessStatusId || status === undefined) {
      return res
        .status(400)
        .json({ code: 400, message: "Access status ID and status are required" });
    }

    // Access statusni bazadan topish
    const accessStatus = await prisma.accessStatus.findUnique({
      where: { id: accessStatusId },
    });

    // Agar access status topilmasa
    if (!accessStatus) {
      return res.status(404).json({ code: 404, message: "Access status not found" });
    }

    // Access statusini yangilash
    await prisma.accessStatus.update({
      where: { id: accessStatusId },
      data: { status: status === 'true' },
    });

    // Muvaffaqiyatli javob qaytarish
    return res
      .status(200)
      .json({ code: 200, message: "Access status updated successfully" });
  } catch (error) {
    console.error("Error during access status update:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {
    // Prisma clientni uzish

  }
};



