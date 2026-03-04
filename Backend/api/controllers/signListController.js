const { PrismaClient } = require("@prisma/client");
const safeString = require("../helpers/safeString");
const buildPrismaSortOrder = require("../helpers/buildPrismaSortOrder");

// Initialize Prisma Client
const prisma = require('../../db/database');

// =====================================================
// 1. Signup (Create a new SignList record)
// =====================================================

/**
 * @swagger
 * /api/v1/signlist/create:
 *   post:
 *     summary: "Yangi sign list yozuvini yaratish"
 *     tags: [SignList]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               fatherName:
 *                 type: string
 *               workplace:
 *                 type: string
 *               position:
 *                 type: string
 *               rank:
 *                 type: string
 *               notes:
 *                 type: string
 *               birthDate:
 *                 type: string
 *                 format: date
 *               nationality:
 *                 type: string
 *               gender:
 *                 type: string
 *               phone:
 *                 type: string
 *               photo:
 *                 type: string
 *               status:
 *                 type: string
 *             example:
 *               firstName: "Alsu"
 *               lastName: "Sharipova"
 *               fatherName: "Sharipov"
 *               workplace: "XYZ kompaniya"
 *               position: "Manager"
 *               rank: "Captain"
 *               notes: "Qo'shimcha ma'lumot"
 *               birthDate: "1993-05-05"
 *               nationality: "Uzbek"
 *               gender: "female"
 *               phone: "+998993738805"
 *               photo: "http://example.com/photo.jpg"
 *               status: "inactive"
 *     responses:
 *       201:
 *         description: "Yozuv muvaffaqiyatli yaratildi"
 *       400:
 *         description: "Kiritish xatosi yoki yozuv allaqachon mavjud"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.create = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      fatherName,
      workplace,
      position,
  rank,
      notes,
      birthDate,
      nationality,
      gender,
      phone,
      photo,
      status,
    } = req.body;

    // Validate required field(s)
    if (!firstName) {
      return res
        .status(400)
        .json({ code: 400, message: "First name is required" });
    }

    // If phone is provided, check for uniqueness
    if (phone) {
      const existingRecord = await prisma.signList.findFirst({
        where: { phone },
      });
      if (existingRecord) {
        return res.status(400).json({
          code: 400,
          message: "Record with this phone already exists",
        });
      }
    }

    const signListData = {
      firstName,
      lastName,
      fatherName,
      workplace,
      position,
  rank,
      notes,
      birthDate: birthDate ? new Date(birthDate) : null,
      nationality,
      gender: gender || "male",
      phone,
      photo,
      status: status || "inactive",
    };

    // Optionally, validate signListData using your own schema here

    const newRecord = await prisma.signList.create({
      data: signListData,
    });

    return res.status(201).json({
      code: 201,
      message: "Record created successfully",
      record: newRecord,
    });
  } catch (error) {
    console.error("Error creating record:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// =====================================================
// 2. Get Record By ID
// =====================================================

/**
 * @swagger
 * /api/v1/signlist/getById/{id}:
 *   get:
 *     summary: "ID bo'yicha sign list yozuvini olish"
 *     tags: [SignList]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Yozuv IDsi"
 *     responses:
 *       200:
 *         description: "Yozuv topildi"
 *       404:
 *         description: "Yozuv topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.getById = async (req, res) => {
  try {
    console.log("getById Psycho");
    const { id } = req.params;
    if (!id) {
      return res
        .status(400)
        .json({ code: 400, message: "ID is required" });
    }

    // Here, we only return records with "active" status.
    const record = await prisma.signList.findFirst({
      where: { id },
    });

    if (!record) {
      return res
        .status(404)
        .json({ code: 404, message: "Record not found" });
    }

    return res.status(200).json({
      code: 200,
      message: "Record found",
      record,
    });
  } catch (err) {
    console.error("Error fetching record by ID:", err);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: err.message,
    });
  } finally {

  }
};

// =====================================================
// 3. Delete Record By ID
// =====================================================

/**
 * @swagger
 * /api/v1/signlist/deleteById/{id}:
 *   delete:
 *     summary: "ID bo'yicha sign list yozuvini o'chirish"
 *     tags: [SignList]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Yozuv IDsi"
 *     responses:
 *       200:
 *         description: "Yozuv muvaffaqiyatli o'chirildi"
 *       404:
 *         description: "Yozuv topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.deleteById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res
        .status(400)
        .json({ code: 400, message: "ID is required" });
    }

    const record = await prisma.signList
      .delete({
        where: { id },
      })
      .catch((err) => {
        if (err.code === "P2025") {
          return null;
        }
        throw err;
      });

    if (!record) {
      return res
        .status(404)
        .json({ code: 404, message: "Record not found" });
    }

    return res.status(200).json({
      code: 200,
      message: "Record deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting record:", err);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: err.message,
    });
  } finally {

  }
};

// =====================================================
// 4. Get List of Records with Pagination & Filters
// =====================================================

/**
 * @swagger
 * /api/v1/signlist/list:
 *   get:
 *     summary: "Sign list yozuvlari ro'yxatini olish"
 *     tags: [SignList]
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
 *         description: "Har sahifadagi yozuvlar soni"
 *       - in: query
 *         name: firstName
 *         schema:
 *           type: string
 *         required: false
 *         description: "First name bo'yicha filtr"
 *       - in: query
 *         name: lastName
 *         schema:
 *           type: string
 *         required: false
 *         description: "Last name bo'yicha filtr"
 *       - in: query
 *         name: fatherName
 *         schema:
 *           type: string
 *         required: false
 *         description: "Father name bo'yicha filtr"
 *       - in: query
 *         name: rank
 *         schema:
 *           type: string
 *         required: false
 *         description: "Rank bo'yicha filtr"
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         required: false
 *         description: "Global qidiruv (firstName, lastName, fatherName, phone)"
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         required: false
 *         description: "Yozuv statusi"
 *     responses:
 *       200:
 *         description: "Yozuvlar topildi"
 *       400:
 *         description: "Noto'g'ri pagination parametrlari"
 *       404:
 *         description: "Yozuvlar topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.getList = async (req, res) => {
  try {
    let {
      pageNumber = 1,
      pageSize = 10,
      firstName,
      lastName,
      fatherName,
  rank,
      query,
      status,
      sortField,
      sortOrder,
      sort,
    } = req.query;

    pageNumber = parseInt(pageNumber, 10);
    pageSize = parseInt(pageSize, 10);

    if (pageNumber < 1 || pageSize < 1) {
      return res
        .status(400)
        .json({ message: "Invalid pagination parameters" });
    }

    const filters = {
      AND: [
        query
          ? {
              OR: [
                { firstName: { contains: query, mode: "insensitive" } },
                { lastName: { contains: query, mode: "insensitive" } },
                { fatherName: { contains: query, mode: "insensitive" } },
                { phone: { contains: query, mode: "insensitive" } },
                { rank: { contains: query, mode: "insensitive" } },
              ],
            }
          : {},
        firstName
          ? { firstName: { contains: firstName, mode: "insensitive" } }
          : {},
        lastName
          ? { lastName: { contains: lastName, mode: "insensitive" } }
          : {},
        fatherName
          ? { fatherName: { contains: fatherName, mode: "insensitive" } }
          : {},
  rank ? { rank: { contains: rank, mode: "insensitive" } } : {},
        status ? { status } : {},
      ],
    };

    const records = await prisma.signList.findMany({
      where: filters,
      orderBy: buildPrismaSortOrder(
        sort, sortField, sortOrder,
        ["firstName", "lastName", "fatherName", "workplace", "position", "rank", "status", "phone", "createdAt", "updatedAt"],
        [{ createdAt: "desc" }]
      ),
      skip: (pageNumber - 1) * pageSize,
      take: pageSize,
    });

    const totalRecords = await prisma.signList.count({ where: filters });
    const totalPages = Math.ceil(totalRecords / pageSize);

    if (!records.length) {
      return res.status(404).json({
        code: 404,
        message: "No records found",
      });
    }

    return res.status(200).json({
      code: 200,
      message: "Records found",
      total_pages: totalPages,
      total_records: totalRecords,
      records,
    });
  } catch (err) {
    console.error("Error fetching record list:", err);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: err.message,
    });
  }
};

// =====================================================
// 5. Update a SignList Record (with Logging)
// =====================================================

/**
 * @swagger
 * /api/v1/signlist/update/{id}:
 *   put:
 *     summary: "Sign list yozuvini yangilash"
 *     tags: [SignList]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Yozuv IDsi"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               fatherName:
 *                 type: string
 *               workplace:
 *                 type: string
 *               position:
 *                 type: string
 *               rank:
 *                 type: string
 *               notes:
 *                 type: string
 *               birthDate:
 *                 type: string
 *                 format: date
 *               nationality:
 *                 type: string
 *               gender:
 *                 type: string
 *               phone:
 *                 type: string
 *               photo:
 *                 type: string
 *             example:
 *               firstName: "Alsu"
 *               lastName: "Sharipova"
 *               fatherName: "Sharipov"
 *               workplace: "XYZ kompaniya"
 *               position: "Director"
 *               rank: "Colonel"
 *               notes: "Yangilangan ma'lumot"
 *               birthDate: "1993-05-05"
 *               nationality: "Uzbek"
 *               gender: "female"
 *               phone: "+998993738806"
 *               photo: "http://example.com/newphoto.jpg"
 *     responses:
 *       200:
 *         description: "Yozuv muvaffaqiyatli yangilandi"
 *       400:
 *         description: "Kiritish xatosi yoki telefon band"
 *       404:
 *         description: "Yozuv topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      firstName,
      lastName,
      fatherName,
      workplace,
      position,
  rank,
      notes,
      birthDate,
      nationality,
      gender,
      phone,
      photo,
    } = req.body;

    if (!id) {
      return res
        .status(400)
        .json({ code: 400, message: "Record ID is required" });
    }

    const currentRecord = await prisma.signList.findUnique({
      where: { id },
    });
    if (!currentRecord) {
      return res
        .status(404)
        .json({ code: 404, message: "Record not found" });
    }

    const data = {};
    const logs = [];

    if (firstName != null && firstName !== currentRecord.firstName) {
      data.firstName = firstName;
      logs.push({
        recordId: id,
        tableName: "SignList",
        fieldName: "firstName",
        oldValue: currentRecord.firstName,
        newValue: firstName,
        executorId: req.userId,
      });
    }

    if (lastName != null && lastName !== currentRecord.lastName) {
      data.lastName = lastName;
      logs.push({
        recordId: id,
        tableName: "SignList",
        fieldName: "lastName",
        oldValue: currentRecord.lastName || "",
        newValue: lastName || "",
        executorId: req.userId,
      });
    }

    if (fatherName != null && fatherName !== currentRecord.fatherName) {
      data.fatherName = fatherName;
      logs.push({
        recordId: id,
        tableName: "SignList",
        fieldName: "fatherName",
        oldValue: currentRecord.fatherName || "",
        newValue: fatherName || "",
        executorId: req.userId,
      });
    }

    if (workplace != null && workplace !== currentRecord.workplace) {
      data.workplace = workplace;
      logs.push({
        recordId: id,
        tableName: "SignList",
        fieldName: "workplace",
        oldValue: currentRecord.workplace || "",
        newValue: workplace || "",
        executorId: req.userId,
      });
    }

    if (position != null && position !== currentRecord.position) {
      data.position = position;
      logs.push({
        recordId: id,
        tableName: "SignList",
        fieldName: "position",
        oldValue: currentRecord.position || "",
        newValue: position || "",
        executorId: req.userId,
      });
    }

    if (rank != null && rank !== currentRecord.rank) {
      data.rank = rank;
      logs.push({
        recordId: id,
        tableName: "SignList",
        fieldName: "rank",
        oldValue: currentRecord.rank || "",
        newValue: rank || "",
        executorId: req.userId,
      });
    }

    if (notes != null && notes !== currentRecord.notes) {
      data.notes = notes;
      logs.push({
        recordId: id,
        tableName: "SignList",
        fieldName: "notes",
        oldValue: currentRecord.notes || "",
        newValue: notes || "",
        executorId: req.userId,
      });
    }

    if (
      birthDate != null &&
      (!currentRecord.birthDate ||
        new Date(birthDate).toISOString() !== currentRecord.birthDate.toISOString())
    ) {
      data.birthDate = birthDate;
      logs.push({
        recordId: id,
        tableName: "SignList",
        fieldName: "birthDate",
        oldValue: safeString(currentRecord.birthDate),
        newValue: safeString(birthDate),
        executorId: req.userId,
      });
    }

    if (nationality != null && nationality !== currentRecord.nationality) {
      data.nationality = nationality;
      logs.push({
        recordId: id,
        tableName: "SignList",
        fieldName: "nationality",
        oldValue: currentRecord.nationality || "",
        newValue: nationality || "",
        executorId: req.userId,
      });
    }

    if (gender != null && gender !== currentRecord.gender) {
      data.gender = gender;
      logs.push({
        recordId: id,
        tableName: "SignList",
        fieldName: "gender",
        oldValue: currentRecord.gender || "",
        newValue: gender || "",
        executorId: req.userId,
      });
    }

    if (phone != null && phone !== currentRecord.phone) {
      // Ensure the new phone number is unique
      const existingRecord = await prisma.signList.findFirst({
        where: { phone },
      });
      if (existingRecord && existingRecord.id !== id) {
        return res
          .status(400)
          .json({ code: 400, message: "Phone is already taken" });
      }
      data.phone = phone;
      logs.push({
        recordId: id,
        tableName: "SignList",
        fieldName: "phone",
        oldValue: currentRecord.phone || "",
        newValue: phone || "",
        executorId: req.userId,
      });
    }

    if (photo != null && photo !== currentRecord.photo) {
      data.photo = photo;
      logs.push({
        recordId: id,
        tableName: "SignList",
        fieldName: "photo",
        oldValue: currentRecord.photo || "",
        newValue: photo || "",
        executorId: req.userId,
      });
    }

    // Execute update and log creations within a transaction
    await prisma.$transaction([
      prisma.signList.update({
        where: { id: id },
        data,
      }),
      ...logs.map((log) => prisma.log.create({ data: log })),
    ]);

    return res.status(200).json({
      code: 200,
      message: "Record updated successfully",
    });
  } catch (error) {
    console.error("Error updating record:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {

  }
};

// =====================================================
// 6. Change Status of a SignList Record
// =====================================================

/**
 * @swagger
 * /api/v1/signlist/changeStatus:
 *   post:
 *     summary: "Yozuv statusini yangilash"
 *     tags: [SignList]
 *     parameters:
 *       - in: query
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Yozuv IDsi"
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         required: true
 *         description: "Yangi status (masalan, active/inactive)"
 *     responses:
 *       200:
 *         description: "Yozuv statusi muvaffaqiyatli yangilandi"
 *       400:
 *         description: "Kiritish xatosi"
 *       404:
 *         description: "Yozuv topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.changeStatus = async (req, res) => {
  try {
    const { id, status } = req.query;

    if (!id || !status) {
      return res.status(400).json({
        code: 400,
        message: "Record ID and status are required",
      });
    }

    const record = await prisma.signList.findFirst({
      where: { id: id },
    });

    if (!record) {
      return res
        .status(404)
        .json({ code: 404, message: "Record not found" });
    }

    await prisma.signList.update({
      where: { id: id },
      data: { status },
    });

    return res.status(200).json({
      code: 200,
      message: "Record status updated successfully",
    });
  } catch (error) {
    console.error("Error updating record status:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {

  }
};
