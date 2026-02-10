const { PrismaClient } = require("@prisma/client");
const dotenv = require("dotenv");
const { WorkPlaceSchema } = require("../helpers/validator");

// Initialize Prisma Client
const prisma = require('../../db/database');

dotenv.config();

/**
 * @swagger
 * /api/v1/workplaces/create:
 *   post:
 *     summary: "Yangi ish joyini qo'shish"
 *     tags: [WorkPlaces]
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
 *               name: "New WorkPlace"
 *     responses:
 *       201:
 *         description: "Ish joyi muvaffaqiyatli qo'shildi"
 *       400:
 *         description: "Xato: Barcha kiritishlar talab qilinadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.createWorkPlace = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ code: 400, message: "WorkPlace name is required" });
    }

    const validationResult = WorkPlaceSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ code: 400, message: validationResult.error.message });
    }

    const newWorkPlace = await prisma.workPlace.create({
      data: { name },
    });

    return res.status(201).json({
      code: 201,
      message: "WorkPlace added successfully",
      workPlace: newWorkPlace,
    });
  } catch (error) {
    console.error("Error adding work place:", error);
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
 * /api/v1/workplaces/list:
 *   get:
 *     summary: "Ish joylari ro'yxatini olish"
 *     tags: [WorkPlaces]
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
 *         description: "Ish joyi nomi bo'yicha qidirish"
 *     responses:
 *       200:
 *         description: "Ish joylari muvaffaqiyatli topildi"
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
 *                 total_pages:
 *                   type: integer
 *                   example: 5
 *                 total_workplaces:
 *                   type: integer
 *                   example: 100
 *                 workplaces:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *       400:
 *         description: "Xato: Noto'g'ri so'rov parametrlari"
 *       404:
 *         description: "Ish joylari topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.getWorkPlaces = async (req, res) => {
  try {
    // So'rov parametrlarini olish va tekshirish
    let { pageNumber = 1, pageSize = 10, query } = req.query;

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

    // Ish joylarini olish
    const workplaces = await prisma.workPlace.findMany({
      where: filters,
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      skip: (pageNumber - 1) * pageSize,
      take: pageSize,
    });

    // Umumiy ish joylari sonini hisoblash
    const totalWorkplaces = await prisma.workPlace.count({ where: filters });

    // Umumiy sahifalar sonini hisoblash
    const totalPages = Math.ceil(totalWorkplaces / pageSize);

    if (!workplaces.length) {
      return res.status(404).json({
        code: 404,
        message: "No workplaces found",
      });
    }

    // Muvaffaqiyatli javob qaytarish
    return res.status(200).json({
      code: 200,
      message: "Workplaces found",
      total_pages: totalPages,
      total_workplaces: totalWorkplaces,
      workplaces,
    });
  } catch (err) {
    console.error("Error fetching workplace list:", err);
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
 * /api/v1/workplaces/update:
 *   put:
 *     summary: "Ish joyi nomini yangilash"
 *     tags: [WorkPlaces]
 *     parameters:
 *       - in: query
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Ish joyi IDsi"
 *       - in: query
 *         name: new_name
 *         schema:
 *           type: string
 *         required: true
 *         description: "Yangi ish joyi nomi"
 *     responses:
 *       200:
 *         description: "Ish joyi nomi muvaffaqiyatli yangilandi"
 *       400:
 *         description: "Xato: Barcha kiritishlar talab qilinadi yoki noto'g'ri ma'lumotlar"
 *       404:
 *         description: "Ish joyi topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.updateWorkPlaceName = async (req, res) => {
  try {
    const { id, new_name } = req.query;

    if (!id || !new_name) {
      return res.status(400).json({ code: 400, message: "ID and new name are required" });
    }

    const validationResult = WorkPlaceSchema.safeParse({ name: new_name });
    if (!validationResult.success) {
      return res.status(400).json({ code: 400, message: validationResult.error.message });
    }

    const workPlace = await prisma.workPlace.findFirst({
      where: { id },
    });

    if (!workPlace) {
      return res.status(404).json({ code: 404, message: "WorkPlace not found" });
    }

    // Loglar uchun ma'lumot tayyorlash
    const logs = [];
    if (new_name !== workPlace.name && new_name != null) {
      logs.push({
        recordId: id,
        tableName: "WorkPlace",
        fieldName: "name",
        oldValue: workPlace.name,
        newValue: new_name,
        executorId: req.userId, // Foydalanuvchi IDsi, agar mavjud bo'lsa
      });
    }

    // Tranzaksiya bilan yangilash va log yozish
    await prisma.$transaction([
      prisma.workPlace.update({
        where: { id },
        data: { name: new_name },
      }),
      ...logs.map((log) => prisma.log.create({ data: log })),
    ]);

    return res.status(200).json({
      code: 200,
      message: "WorkPlace name updated successfully",
    });
  } catch (error) {
    console.error("Error updating work place name:", error);
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
 * /api/v1/workplaces/delete/{id}:
 *   delete:
 *     summary: "Ish joyini ID bo'yicha o'chirish"
 *     tags: [WorkPlaces]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Ish joyi IDsi"
 *     responses:
 *       200:
 *         description: "Ish joyi muvaffaqiyatli o'chirildi"
 *       404:
 *         description: "Ish joyi topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.deleteWorkPlace = async (req, res) => {
  try {
    const { id } = req.params;

    // Ish joyini bazadan o'chirish
    const deletedWorkPlace = await prisma.workPlace.delete({
      where: { id },
    });

    // Muvaffaqiyatli javob qaytarish
    return res.status(200).json({
      code: 200,
      message: "WorkPlace deleted successfully",
      workPlace: deletedWorkPlace,
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        code: 404,
        message: "WorkPlace not found",
      });
    }
    console.error("Error deleting work place:", error);
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
 * /api/v1/workplaces/getById/{id}:
 *   get:
 *     summary: "Ish joyini ID bo'yicha olish"
 *     tags: [WorkPlaces]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Ish joyi IDsi"
 *     responses:
 *       200:
 *         description: "Ish joyi muvaffaqiyatli topildi"
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
 *         description: "Ish joyi topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;

    // Ish joyini bazadan topish
    const workPlace = await prisma.workPlace.findUnique({
      where: { id },
    });

    // Agar ish joyi topilmasa
    if (!workPlace) {
      return res.status(404).json({
        code: 404,
        message: "WorkPlace not found",
      });
    }

    // Muvaffaqiyatli javob qaytarish
    return res.status(200).json({
      code: 200,
      message: "WorkPlace retrieved successfully",
      workPlace,
    });
  } catch (error) {
    console.error("Error retrieving work place:", error);
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
 * /api/v1/workplaces/listByRegistration:
 *   get:
 *     summary: "Ish joylari ro'yxatini olish"
 *     tags: [WorkPlaces]
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
 *         name: name
 *         schema:
 *           type: string
 *         required: false
 *         description: "Ish joyi nomi bo'yicha qidirish"
 *     responses:
 *       200:
 *         description: "Ish joylari muvaffaqiyatli topildi"
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
 *                 total_pages:
 *                   type: integer
 *                   example: 5
 *                 total_workplaces:
 *                   type: integer
 *                   example: 100
 *                 workplaces:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *       400:
 *         description: "Xato: Noto'g'ri so'rov parametrlari"
 *       404:
 *         description: "Ish joylari topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.getWorkPlacesByRegistration = async (req, res) => {
  try {
    // So'rov parametrlarini olish va tekshirish
    let { pageNumber = 1, pageSize = 10, name = "" } = req.query;

    pageNumber = parseInt(pageNumber, 10);
    pageSize = parseInt(pageSize, 10);

    if (isNaN(pageNumber) || isNaN(pageSize) || pageNumber < 1 || pageSize < 1) {
      return res.status(400).json({ message: "Invalid pagination parameters" });
    }

    // Qidiruv filtri
    const filters = {
      AND: [
        name ? { AND: [{ workplace: { contains: name, mode: "insensitive" } }, { workplace: { not: "" } }] } : { workplace: { not: "" } },
      ].filter(Boolean),
    };

    // Ish joylarini olish
    const workplaces = await prisma.registration.findMany({
      where: filters,
      select: {
        id: true,
        workplace: true,
      },
      orderBy: { workplace: "asc" },
      distinct: ["workplace"],
      skip: (pageNumber - 1) * pageSize,
      take: pageSize,
    });

    // // Umumiy ish joylari sonini hisoblash
    // const totalWorkplaces = await prisma.registration.count({
    //   where: filters,
    //   distinct: ["workplace"]
    // });

    // Umumiy sahifalar sonini hisoblash
    const totalPages = Math.ceil(workplaces.length / pageSize);

    if (!workplaces.length) {
      return res.status(404).json({
        code: 404,
        message: "No workplaces found",
      });
    }

    // Muvaffaqiyatli javob qaytarish
    return res.status(200).json({
      code: 200,
      message: "Workplaces found",
      total_pages: totalPages,
      total_workplaces: workplaces.length,
      workplaces: workplaces.map((item) => ({ name: item.workplace })),
    });
  } catch (err) {
    console.error("Error fetching workplace list:", err);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: err.message,
    });
  } finally {
    // Prisma clientni uzish

  }
};

