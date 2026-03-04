const { PrismaClient } = require("@prisma/client");
const { InitiatorSchema } = require("../helpers/validator");
const buildPrismaSortOrder = require("../helpers/buildPrismaSortOrder");

// Initialize Prisma Client
const prisma = require('../../db/database');


/**
 * @swagger
 * /api/v1/initiator/list:
 *   get:
 *     summary: "Tashabbuskorlar ro'yxatini olish"
 *     tags: [Initiators]
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
 *         description: "Ism, familiya yoki telefon raqami bo'yicha qidirish"
 *     responses:
 *       200:
 *         description: "Tashabbuskorlar muvaffaqiyatli topildi"
 *       400:
 *         description: "Noto'g'ri so'rov parametrlari"
 *       404:
 *         description: "Tashabbuskorlar topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.getList = async (req, res) => {
  try {
    // So'rov parametrlarini olish va tozalash
    let { pageNumber = 1, pageSize = 10, query, sortField, sortOrder, sort } = req.query;

    pageNumber = parseInt(pageNumber, 10);
    pageSize = parseInt(pageSize, 10);

    // Pagination parametrlarini tekshirish
    if (isNaN(pageNumber) || isNaN(pageSize) || pageNumber < 1 || pageSize < 1) {
      return res.status(400).json({ 
        code: 400,
        message: "Invalid pagination parameters" 
      });
    }

    // Qidiruv filtrlari
    const filters = {
      OR: query ? [
        { first_name: { contains: query, mode: "insensitive" } },
        { last_name: { contains: query, mode: "insensitive" } },
      ] : undefined
    };

    // Tashabbuskorlarni olish
    const initiators = await prisma.initiator.findMany({
      where: filters,
      select: {
        id: true,
        first_name: true,
        last_name: true,
        father_name: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: buildPrismaSortOrder(
        sort, sortField, sortOrder,
        ["first_name", "last_name", "father_name", "notes", "createdAt", "updatedAt"],
        [{ createdAt: "desc" }]
      ),
      skip: (pageNumber - 1) * pageSize,
      take: pageSize,
    });

    // Umumiy tashabbuskorlar sonini hisoblash
    const totalInitiators = await prisma.initiator.count({ where: filters });

    // Umumiy sahifalar sonini hisoblash
    const totalPages = Math.ceil(totalInitiators / pageSize);

    // Agar tashabbuskorlar topilmasa
    if (!initiators.length) {
      return res.status(404).json({
        code: 404,
        message: "No initiators found",
      });
    }

    // Muvaffaqiyatli javob qaytarish
    return res.status(200).json({
      code: 200,
      message: "Initiators found",
      total_pages: totalPages,
      total_number: totalInitiators,
      data: initiators,
    });
  } catch (err) {
    console.error("Error fetching initiator list:", err);
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
 * /api/v1/initiator/create:
 *   post:
 *     summary: "Yangi tashabbuskor yaratish"
 *     tags: [Initiators]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:
 *                 type: string
 *                 description: "Tashabbuskorning ismi"
 *               last_name:
 *                 type: string
 *                 description: "Tashabbuskorning familiyasi"
 *               father_name:
 *                 type: string
 *                 description: "Tashabbuskorning otasining ismi"
 *               rank:
 *                 type: string
 *                 description: "Tashabbuskor rutbasi"
 *               notes:
 *                 type: string
 *                 description: "Qo'shimcha ma'lumotlar"
 *             example:
 *               first_name: "Alisher"
 *               last_name: "Usmanov"
 *               father_name: "Burhanovich"
 *               notes: "Tashabbuskor haqida qo'shimcha ma'lumotlar"
 *     responses:
 *       201:
 *         description: "Tashabbuskor muvaffaqiyatli yaratildi"
 *       400:
 *         description: "Noto'g'ri so'rov ma'lumotlari"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.create = async (req, res) => {
  try {
    // So'rov tanasidan ma'lumotlarni olish
  const { first_name, last_name, father_name, notes, rank } = req.body;

    // Majburiy maydonlarni tekshirish
    if (!first_name) {
      return res.status(400).json({
        code: 400,
        message: "First name is required"
      });
    }

    const validator = InitiatorSchema.safeParse({
      first_name,
      last_name,
      father_name,
  notes,
  rank
    });

    if (!validator.success) {
      return res.status(400).json({
        code: 400,
        message: validator.error.message
      });
    }

    // Yangi tashabbuskor yaratish
    const initiator = await prisma.initiator.create({
      data: {
        first_name,
        last_name,
        father_name,
  notes,
  rank
      }
    });

    // Muvaffaqiyatli javob qaytarish
    return res.status(201).json({
      code: 201,
      message: "Initiator created successfully",
      data: initiator
    });

  } catch (error) {
    console.error("Error creating initiator:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message
    });
  } finally {

  }
};

/**
 * @swagger
 * /api/v1/initiator/getById:
 *   get:
 *     summary: "Tashabbuskorni ID bo'yicha olish"
 *     tags: [Initiators]
 *     parameters:
 *       - in: query
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Tashabbuskor IDsi"
 *     responses:
 *       200:
 *         description: "Tashabbuskor topildi"
 *       404:
 *         description: "Tashabbuskor topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.getById = async (req, res) => {
  try {
    // So'rov parametrlaridan IDni olish
    const { id } = req.query;

    // ID kiritilganligini tekshirish
    if (!id) {
      return res.status(400).json({ code: 400, message: "ID is required" });
    }

    // Tashabbuskorni bazadan topish
    const initiator = await prisma.initiator.findFirst({
      select: {
        id: true,
        first_name: true,
        last_name: true,
        father_name: true,
  rank: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
      where: { id },
    });

    // Agar tashabbuskor topilmasa
    if (!initiator) {
      return res.status(404).json({
        code: 404,
        message: "Initiator not found",
      });
    }

    // Muvaffaqiyatli javob qaytarish
    return res.status(200).json({
      code: 200,
      message: "Initiator found",
      initiator,
    });
  } catch (err) {
    console.error("Error fetching initiator by ID:", err);
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
 * /api/v1/initiator/delete/{id}:
 *   delete:
 *     summary: "Tashabbuskorni ID bo'yicha o'chirish"
 *     tags: [Initiators]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Tashabbuskor IDsi"
 *     responses:
 *       200:
 *         description: "Tashabbuskor muvaffaqiyatli o'chirildi"
 *       404:
 *         description: "Tashabbuskor topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.deleteInitiator = async (req, res) => {
  try {
    const { id } = req.params;

    // Tashabbuskorni bazadan o'chirish
    const deletedInitiator = await prisma.initiator.delete({
      where: { id },
    });

    // Muvaffaqiyatli javob qaytarish
    return res.status(200).json({
      code: 200,
      message: "Initiator deleted successfully",
      initiator: deletedInitiator,
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        code: 404,
        message: "Initiator not found",
      });
    }
    console.error("Error deleting initiator:", error);
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
 * /api/v1/initiator/update/{id}:
 *   put:
 *     summary: "Tashabbuskorni ID bo'yicha yangilash"
 *     tags: [Initiators]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Tashabbuskor IDsi"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               father_name:
 *                 type: string
 *               notes:
 *                 type: string
 *             example:
 *               first_name: "Updated First Name"
 *               last_name: "Updated Last Name"
 *               father_name: "Updated Father Name"
 *               notes: "Updated notes"
 *     responses:
 *       200:
 *         description: "Tashabbuskor muvaffaqiyatli yangilandi"
 *       400:
 *         description: "Noto'g'ri kiritilgan ma'lumotlar"
 *       404:
 *         description: "Tashabbuskor topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
  const { first_name, last_name, father_name, notes, rank } = req.body;

    // Tashabbuskorni bazadan topish
    const currentInitiator = await prisma.initiator.findUnique({ where: { id } });
    if (!currentInitiator) {
      return res.status(404).json({ code: 404, message: "Initiator not found" });
    }

    // Yangilanish uchun ma'lumotlar va loglar tayyorlash
    const data = {};
    const logs = [];

    if (first_name !== currentInitiator.first_name&&first_name!=null) {
      data.first_name = first_name;
      logs.push({
        recordId: id,
        tableName: "Initiator",
        fieldName: "first_name",
        oldValue: currentInitiator.first_name,
        newValue: first_name,
        executorId: req.userId,
      });
    }

    if (last_name !== currentInitiator.last_name&&last_name!=null) {
      data.last_name = last_name;
      logs.push({
        recordId: id,
        tableName: "Initiator",
        fieldName: "last_name",
        oldValue: currentInitiator.last_name,
        newValue: last_name,
        executorId: req.userId,
      });
    }

    if (father_name !== currentInitiator.father_name&&father_name!=null) {
      data.father_name = father_name;
      logs.push({
        recordId: id,
        tableName: "Initiator",
        fieldName: "father_name",
        oldValue: currentInitiator.father_name,
        newValue: father_name,
        executorId: req.userId,
      });
    }

    if (rank !== currentInitiator.rank && rank!=null) {
      data.rank = rank;
      logs.push({
        recordId: id,
        tableName: "Initiator",
        fieldName: "rank",
        oldValue: currentInitiator.rank||"",
        newValue: rank||"",
        executorId: req.userId,
      });
    }

    if (notes !== currentInitiator.notes&&notes!=null) {
      data.notes = notes;
      logs.push({
        recordId: id,
        tableName: "Initiator",
        fieldName: "notes",
        oldValue: currentInitiator.notes,
        newValue: notes,
        executorId: req.userId,
      });
    }

    // Tranzaksiya orqali yangilash va loglarni yozish
    await prisma.$transaction([
      prisma.initiator.update({
        where: { id },
        data,
      }),
      ...logs.map((log) => prisma.log.create({ data: log })),
    ]);

    // Muvaffaqiyatli javob qaytarish
    return res.status(200).json({
      code: 200,
      message: "Initiator updated successfully",
      initiator: { ...currentInitiator, ...data },
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        code: 404,
        message: "Initiator not found",
      });
    }
    console.error("Error updating initiator:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {

  }
};






