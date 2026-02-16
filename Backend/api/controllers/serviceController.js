const { PrismaClient } = require("@prisma/client");

// Initialize Prisma Client
const prisma = require('../../db/database');


/**
 * @swagger
 * /api/v1/services/list:
 *   get:
 *     summary: "Xizmatlar ro'yxatini olish"
 *     tags: [Services]
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
 *         description: "Xizmat nomi bo'yicha qidirish"
 *     responses:
 *       200:
 *         description: "Xizmatlar muvaffaqiyatli topildi"
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
 *                   example: "Services found"
 *                 total_pages:
 *                   type: integer
 *                   example: 5
 *                 total_services:
 *                   type: integer
 *                   example: 100
 *                 services:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       description:
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
 *         description: "Xizmatlar topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.getServices = async (req, res) => {
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

    // Xizmatlarni olish
    const services = await prisma.service.findMany({
      where: filters,
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      skip: (pageNumber - 1) * pageSize,
      take: pageSize,
    });

    // Umumiy xizmatlar sonini hisoblash
    const totalServices = await prisma.service.count({ where: filters });

    // Umumiy sahifalar sonini hisoblash
    const totalPages = Math.ceil(totalServices / pageSize);

    if (!services.length) {
      return res.status(404).json({
        code: 404,
        message: "No services found",
      });
    }

    // Muvaffaqiyatli javob qaytarish
    return res.status(200).json({
      code: 200,
      message: "Services found",
      total_pages: totalPages,
      total_services: totalServices,
      services,
    });
  } catch (err) {
    console.error("Error fetching service list:", err);
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
 * /api/v1/services/create:
 *   post:
 *     summary: "Yangi xizmat qo'shish"
 *     tags: [Services]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *             example:
 *               name: "New Service"
 *               description: "This is a new service"
 *     responses:
 *       201:
 *         description: "Xizmat muvaffaqiyatli qo'shildi"
 *       400:
 *         description: "Xato: Barcha kiritishlar talab qilinadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.createService = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ code: 400, message: "Service name is required" });
    }

    const newService = await prisma.service.create({
      data: { name, description },
    });

    return res.status(201).json({
      code: 201,
      message: "Service added successfully",
      service: newService,
    });
  } catch (error) {
    console.error("Error adding service:", error);
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
 * /api/v1/services/addAdmin:
 *   post:
 *     summary: "Adminni xizmatga qo'shish"
 *     tags: [Services]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               adminId:
 *                 type: string
 *               serviceId:
 *                 type: string
 *             example:
 *               adminId: "admin123"
 *               serviceId: "service123"
 *     responses:
 *       200:
 *         description: "Admin xizmatga muvaffaqiyatli qo'shildi"
 *       400:
 *         description: "Xato: Barcha kiritishlar talab qilinadi"
 *       404:
 *         description: "Admin yoki xizmat topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.addAdminToService = async (req, res) => {
  try {
    const { adminId, serviceId } = req.body;

    if (!adminId || !serviceId) {
      return res.status(400).json({ code: 400, message: "Admin ID and Service ID are required" });
    }

    const admin = await prisma.admin.findFirst({ where: { id: adminId } });
    const service = await prisma.service.findFirst({ where: { id: serviceId } });

    if (!admin || !service) {
      return res.status(404).json({ code: 404, message: "Admin or Service not found" });
    }

    await prisma.adminServiceAccess.create({
      data: {
        adminId,
        serviceId,
        grantedBy:req?.userId
      },
    });

    console.log({
      adminId,
      serviceId,
      grantedBy:req?.userId
    });

    return res.status(200).json({
      code: 200,
      message: "Admin added to service successfully",
    });
  } catch (error) {
    console.error("Error adding admin to service:", error);
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
 * /api/v1/services/update:
 *   put:
 *     summary: "Xizmat nomini yangilash"
 *     tags: [Services]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               serviceId:
 *                 type: string
 *               newName:
 *                 type: string
 *             example:
 *               serviceId: "service123"
 *               newName: "Updated Service Name"
 *     responses:
 *       200:
 *         description: "Xizmat nomi muvaffaqiyatli yangilandi"
 *       400:
 *         description: "Xato: Barcha kiritishlar talab qilinadi"
 *       404:
 *         description: "Xizmat topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.updateServiceName = async (req, res) => {
  try {
    const { serviceId, newName } = req.body;

    if (!serviceId || !newName) {
      return res.status(400).json({ code: 400, message: "Service ID and new name are required" });
    }

    const service = await prisma.service.findFirst({ where: { id: serviceId } });

    if (!service) {
      return res.status(404).json({ code: 404, message: "Service not found" });
    }

    // Loglar va yangilanish ma'lumotlarini tayyorlash
    const logs = [];
    const data = {};

    if (newName !== service.name && newName != null) {
      data.name = newName;
      logs.push({
        recordId: serviceId,
        tableName: "Service",
        fieldName: "name",
        oldValue: service.name,
        newValue: newName,
        executorId: req.userId, // Foydalanuvchi IDsi, agar mavjud bo'lsa
      });
    }

    // Tranzaksiya qo'shish
    await prisma.$transaction([
      prisma.service.update({
        where: { id: serviceId },
        data,
      }),
      ...logs.map((log) => prisma.log.create({ data: log })),
    ]);

    return res.status(200).json({
      code: 200,
      message: "Service name updated successfully",
    });
  } catch (error) {
    console.error("Error updating service name:", error);
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
 * /api/v1/services/rmAdmin:
 *   delete:
 *     summary: "Adminni xizmatdan o'chirish"
 *     tags: [Services]
 *     parameters:
 *       - in: query
 *         name: adminId
 *         schema:
 *           type: string
 *         required: true
 *         description: "Admin IDsi"
 *       - in: query
 *         name: serviceId
 *         schema:
 *           type: string
 *         required: true
 *         description: "Xizmat IDsi"
 *     responses:
 *       200:
 *         description: "Admin xizmatdan muvaffaqiyatli o'chirildi"
 *       400:
 *         description: "Xato: Barcha kiritishlar talab qilinadi"
 *       404:
 *         description: "Admin yoki xizmat topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.removeAdminFromService = async (req, res) => {
  try {
    const { adminId, serviceId } = req.query;

    if (!adminId || !serviceId) {
      return res.status(400).json({ code: 400, message: "Admin ID and Service ID are required" });
    }

    const access = await prisma.adminServiceAccess.findFirst({
      where: { adminId, serviceId },
    });

    if (!access) {
      return res.status(404).json({ code: 404, message: "Admin or Service not found" });
    }

    await prisma.adminServiceAccess.delete({
      where: { id: access.id },
    });

    return res.status(200).json({
      code: 200,
      message: "Admin removed from service successfully",
    });
  } catch (error) {
    console.error("Error removing admin from service:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {

  }
};
