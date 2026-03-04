const { PrismaClient } = require("@prisma/client");
const { RelationDegreeSchema } = require("../helpers/validator");
const buildPrismaSortOrder = require("../helpers/buildPrismaSortOrder");

// Initialize Prisma Client
const prisma = require('../../db/database');


/**
 * @swagger
 * /api/v1/relationdgr/list:
 *   get:
 *     summary: "Munosabat darajalari ro'yxatini olish"
 *     tags: [RelationDegrees]
 *     parameters:
 *       - in: query
 *         name: pageNumber
 *         schema:
 *           type: integer
 *           default: 1
 *         required: true
 *         description: "Sahifa raqami"
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 10
 *         required: true
 *         description: "Sahifadagi elementlar soni"
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         required: false
 *         description: "Munosabat darajasi nomi bo'yicha qidirish"
 *     responses:
 *       200:
 *         description: "Munosabat darajalari muvaffaqiyatli topildi"
 *       404:
 *         description: "Munosabat darajalari topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.getRelationDegrees = async (req, res) => {
  try {
    // So'rov parametrlarini olish va tekshirish
    let { pageNumber = 1, pageSize = 10, query, sortField, sortOrder, sort } = req.query;

    pageNumber = parseInt(pageNumber, 10);
    pageSize = parseInt(pageSize, 10);

    if (isNaN(pageNumber) || isNaN(pageSize) || pageNumber < 1 || pageSize < 1) {
      return res.status(400).json({ message: "Invalid pagination parameters" });
    }

    // Qidiruv filtri
    const filters = {
      AND: [
        query ? { name: { contains: query, mode: "insensitive" } } : {},
      ].filter(Boolean),
    };

    // Munosabat darajalarini olish
    const relationDegrees = await prisma.relationDegree.findMany({
      where: filters,
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: buildPrismaSortOrder(
        sort, sortField, sortOrder,
        ["name", "createdAt", "updatedAt"],
        [{ updatedAt: "desc" }]
      ),
      skip: (pageNumber - 1) * pageSize,
      take: pageSize,
    });

    // Umumiy munosabat darajalari sonini hisoblash
    const totalRelationDegrees = await prisma.relationDegree.count({ where: filters });

    // Umumiy sahifalar sonini hisoblash
    const totalPages = Math.ceil(totalRelationDegrees / pageSize);

    if (!relationDegrees.length) {
      return res.status(404).json({
        code: 404,
        message: "No relation degrees found",
      });
    }

    // Muvaffaqiyatli javob qaytarish
    return res.status(200).json({
      code: 200,
      message: "Relation degrees found",
      total_pages: totalPages,
      total_relation_degrees: totalRelationDegrees,
      relationDegrees,
    });
  } catch (err) {
    console.error("Error fetching relation degree list:", err);
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
 * /api/v1/relationdgr/create:
 *   post:
 *     summary: "Yangi munosabat darajasini qo'shish"
 *     tags: [RelationDegrees]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *             example:
 *               name: "New Relation Degree"
 *     responses:
 *       201:
 *         description: "Munosabat darajasi muvaffaqiyatli qo'shildi"
 *       400:
 *         description: "Xato: Barcha kiritishlar talab qilinadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.create = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ code: 400, message: "Relation degree name is required" });
    }

    const validationResult = RelationDegreeSchema.safeParse({ name });
    if (!validationResult.success) {
      return res.status(400).json({ code: 400, message: validationResult.error.message });
    }

    const newRelationDegree = await prisma.relationDegree.create({
      data: { name },
    });

    return res.status(201).json({
      code: 201,
      message: "Relation degree added successfully",
      relationDegree: newRelationDegree,
    });
  } catch (error) {
    console.error("Error adding relation degree:", error);
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
 * /api/v1/relationdgr/update/{id}:
 *   put:
 *     summary: "Munosabat darajasi nomini yangilash"
 *     tags: [RelationDegrees]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Munosabat darajasi IDsi"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: string
 *             example:
 *               new_name: "Updated Relation Degree Name"
 *     responses:
 *       200:
 *         description: "Munosabat darajasi nomi muvaffaqiyatli yangilandi"
 *       400:
 *         description: "Xato: Barcha kiritishlar talab qilinadi yoki noto'g'ri ma'lumotlar"
 *       404:
 *         description: "Munosabat darajasi topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.update = async (req, res) => {
  const { id } = req.params;
  const { new_name } = req.body;

  if (!id || !new_name) {
    return res.status(400).json({ code: 400, message: "ID and new name are required" });
  }

  const relationDegree = await prisma.relationDegree.findFirst({
    where: { id },
  });

  if (!relationDegree) {
    return res.status(404).json({ code: 404, message: "Relation degree not found" });
  }

  try {
    const logs = [];

    if (new_name !== relationDegree.name && new_name != null) {
      logs.push({
        recordId: id,
        tableName: "RelationDegree",
        fieldName: "name",
        oldValue: relationDegree.name,
        newValue: new_name,
        executorId: req.userId, // Foydalanuvchi IDsi, agar mavjud bo'lsa
      });
    }

    await prisma.$transaction([
      prisma.relationDegree.update({
        where: { id },
        data: { name: new_name },
      }),
      ...logs.map((log) => prisma.log.create({ data: log })),
    ]);

    return res.status(200).json({
      code: 200,
      message: "Relation degree name updated successfully",
    });
  } catch (error) {
    console.error("Error updating relation degree name:", error);
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
 * /api/v1/relationdgr/delete/{id}:
 *   delete:
 *     summary: "Munosabat darajasini ID bo'yicha o'chirish"
 *     tags: [RelationDegrees]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Munosabat darajasi IDsi"
 *     responses:
 *       200:
 *         description: "Munosabat darajasi muvaffaqiyatli o'chirildi"
 *       404:
 *         description: "Munosabat darajasi topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.deleteRelationDegree = async (req, res) => {
  try {
    const { id } = req.params;

    // Munosabat darajasini bazadan o'chirish
    const deletedRelationDegree = await prisma.relationDegree.delete({
      where: { id },
    });

    // Muvaffaqiyatli javob qaytarish
    return res.status(200).json({
      code: 200,
      message: "Relation degree deleted successfully",
      relationDegree: deletedRelationDegree,
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        code: 404,
        message: "Relation degree not found",
      });
    }
    console.error("Error deleting relation degree:", error);
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
 * /api/v1/relationdgr/getById/{id}:
 *   get:
 *     summary: "Munosabat darajasini ID bo'yicha olish"
 *     tags: [RelationDegrees]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Munosabat darajasi IDsi"
 *     responses:
 *       200:
 *         description: "Munosabat darajasi muvaffaqiyatli topildi"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: "Munosabat darajasi topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;

    // Munosabat darajasini bazadan topish
    const relationDegree = await prisma.relationDegree.findUnique({
      where: { id },
    });

    // Agar munosabat darajasi topilmasa
    if (!relationDegree) {
      return res.status(404).json({
        code: 404,
        message: "Relation degree not found",
      });
    }

    // Muvaffaqiyatli javob qaytarish
    return res.status(200).json({
      code: 200,
      message: "Relation degree retrieved successfully",
      relationDegree,
    });
  } catch (error) {
    console.error("Error retrieving relation degree:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {

  }
};





