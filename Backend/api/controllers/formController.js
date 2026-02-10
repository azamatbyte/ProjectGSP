const { PrismaClient } = require("@prisma/client");
const dotenv = require("dotenv");
const { FormSchema } = require("../helpers/validator");
const safeString = require("../helpers/safeString");

// Initialize Prisma Client
const prisma = require('../../db/database');

dotenv.config();

/**
 * @swagger
 * /api/v1/forms/create:
 *   post:
 *     summary: "Create a new form"
 *     tags: [Forms]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 default: "Default Form Name"
 *               description:
 *                 type: string
 *                 default: "Default description"
 *               length:
 *                 type: integer
 *                 default: 10
 *             example:
 *               name: "Registration Form"
 *               description: "Form for user registration"
 *               length: 5
 *     responses:
 *       201:
 *         description: "Form created successfully"
 *       400:
 *         description: "Invalid input"
 *       500:
 *         description: "Internal server error"
 */
exports.createForm = async (req, res) => {
  try {
    const { name, description, length, month, type } = req.body;

    // Validate input using Zod schema
    const validationResult = FormSchema.safeParse({
      name,
      description,
      length,
      month,
      type,
    });
    if (!validationResult.success) {
      return res.status(400).json({

        code: 400,
        message: "Invalid input",
        errors: validationResult.error.errors,
      });
    }

    // Check if the form already exists
    const existingForm = await prisma.form.findUnique({
      where: { name },
    });

    if (existingForm) {
      return res
        .status(400)
        .json({ code: 400, message: "Form already exists" });
    }

    // Create the form
    const newForm = await prisma.form.create({
      data: {
        name,
        description,
        length,
        month,
        type,
      },
    });

    // Return the newly created form
    return res.status(201).json({
      code: 201,
      message: "Form created successfully",
      form: newForm,
    });
  } catch (error) {
    console.error("Error creating form:", error);
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
 * /api/v1/forms/list:
 *   get:
 *     summary: "List all forms"
 *     tags: [Forms]
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
 *         description: "Number of forms per page"
 *         default: 10
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         description: "Search query for filtering forms"
 *     responses:
 *       200:
 *         description: "List of forms retrieved successfully"
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
 *                       description:
 *                         type: string
 *                       length:
 *                         type: integer
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
exports.listForms = async (req, res) => {
  try {
    let { pageNumber = 1, pageSize = 10, query = "" } = req.query;

    // parse and provide safe defaults
    pageNumber = parseInt(pageNumber) || 1;
    pageSize = parseInt(pageSize) || 10;

    // Normalize query: ignore values like undefined, null, or the string "null"
    const hasQuery = typeof query === "string" && query.trim() !== "" && query !== "null";

    // Build conditional where clause
    const where = hasQuery
      ? {
          name: {
            contains: query?.trim(),
            mode: "insensitive",
          },
        }
      : {};

    // Get paginated forms from the database (apply conditional where filter)
    const forms = await prisma.form.findMany({
      where,
      skip: (pageNumber - 1) * pageSize,
      take: pageSize,
      orderBy: {
        createdAt: "desc",
      },
    });

    // Get the total number of forms
    const totalForms = await prisma.form.count({ where });

    // Calculate total pages (ensure pageSize > 0)
    const totalPages = pageSize > 0 ? Math.ceil(totalForms / pageSize) : 1;

    return res.status(200).json({
      code: 200,
      message: "Forms retrieved successfully",
      total_pages: totalPages,
      total_forms: totalForms,
      forms: forms,
    });
  } catch (error) {
    console.error("Error retrieving forms:", error);
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
 * /api/v1/forms/listWithStatus:
 *   get:
 *     summary: "List all forms"
 *     tags: [Forms]
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
 *         description: "Number of forms per page"
 *         default: 10
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         description: "Search query for filtering forms"
 *     responses:
 *       200:
 *         description: "List of forms retrieved successfully"
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
 *                       description:
 *                         type: string
 *                       length:
 *                         type: integer
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
exports.listFormsWithStatus = async (req, res) => {
  try {
    let { pageNumber, pageSize, query, type } = req.query;
    pageNumber = parseInt(pageNumber);
    pageSize = parseInt(pageSize);

    // Validate input
    if (!(pageNumber && pageSize)) {
      return res
        .status(400)
        .json({ code: 400, message: "Page number and page size are required" });
    }

    const filter = {
      AND: [
        {
          status: true,
        },
      ].filter(Boolean),
    };

    if (query && query !== "null") {
      filter.AND.push({
        name: {
          contains: query,
        },
      });
    }

    if (type) {
      filter.AND.push({
        type: type,
      });
    }
    // Get paginated forms from the database
    const forms = await prisma.form.findMany({
      skip: (pageNumber - 1) * pageSize,
      take: pageSize,
      orderBy: {
        createdAt: "desc",
      },
      where: filter,
    });
    

    // Get the total number of forms
    const totalForms = await prisma.form.count({
      where: {
        name: {
          contains: query,
        },
        status: true,
      },
    });

    // Calculate total pages
    const totalPages = Math.ceil(totalForms / pageSize);

    return res.status(200).json({
      code: 200,
      message: "Forms retrieved successfully",
      total_pages: totalPages,
      total_forms: totalForms,
      forms: forms,
    });
  } catch (error) {
    console.error("Error retrieving forms:", error);
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
 * /api/v1/forms/getById/{id}:
 *   get:
 *     summary: "Get a form by ID"
 *     tags: [Forms]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Form ID"
 *     responses:
 *       200:
 *         description: "Form retrieved successfully"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 description:
 *                   type: string
 *                 length:
 *                   type: integer
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: "Form not found"
 *       500:
 *         description: "Internal server error"
 */
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch the form from the database
    const form = await prisma.form.findUnique({
      where: { id },
    });

    // Handle case when form is not found
    if (!form) {
      return res.status(404).json({
        code: 404,
        message: "Form not found",
      });
    }

    // Respond with the form data
    return res.status(200).json({
      code: 200,
      message: "Form retrieved successfully",
      form,
    });
  } catch (error) {
    console.error("Error retrieving form:", error);
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
 * /api/v1/forms/update/{id}:
 *   put:
 *     summary: "Update a form by ID"
 *     tags: [Forms]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Form ID"
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
 *               length:
 *                 type: integer
 *             example:
 *               name: "Updated Form Name"
 *               description: "Updated description"
 *               length: 7
 *     responses:
 *       200:
 *         description: "Form updated successfully"
 *       400:
 *         description: "Invalid input"
 *       404:
 *         description: "Form not found"
 *       500:
 *         description: "Internal server error"
 */
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, length, month, type } = req.body;

    // Formni bazadan topish
    const currentForm = await prisma.form.findUnique({ where: { id } });
    if (!currentForm) {
      return res.status(404).json({ code: 404, message: "Form not found" });
    }

    // Yangi ma'lumotlarni tayyorlash va loglar
    const data = {};
    const logs = [];

    if (name !== currentForm.name && name != null) {
      data.name = name;
      logs.push({
        recordId: id,
        tableName: "Form",
        fieldName: "name",
        oldValue: currentForm.name || "",
        newValue: name || "",
        executorId: req.userId,
      });
    }

    if (description !== currentForm.description && description != null) {
      data.description = description;
      logs.push({
        recordId: id,
        tableName: "Form",
        fieldName: "description",
        oldValue: currentForm.description || "",
        newValue: description || "",
        executorId: req.userId,
      });
    }

    if (length !== currentForm.length && length != null) {
      data.length = length;
      logs.push({
        recordId: id,
        tableName: "Form",
        fieldName: "length",
        oldValue: safeString(currentForm.length),
        newValue: safeString(length),
        executorId: req.userId,
      });
    }

    if (month !== currentForm.month && month != null) {
      data.month = month;
      logs.push({
        recordId: id,
        tableName: "Form",
        fieldName: "month",
        oldValue: safeString(currentForm.month),
        newValue: safeString(month),
        executorId: req.userId,
      });
    }

    if (type !== currentForm.type && type != null) {
      data.type = type;
      logs.push({
        recordId: id,
        tableName: "Form",
        fieldName: "type",
        oldValue: currentForm.type || "",
        newValue: type || "",
        executorId: req.userId,
      });
    }

    // Tranzaksiya ichida yangilash va loglarni yozish
    await prisma.$transaction([
      prisma.form.update({
        where: { id },
        data,
      }),
      ...logs.map((log) => prisma.log.create({ data: log })),
    ]);

    // Muvaffaqiyatli javob qaytarish
    return res
      .status(200)
      .json({ code: 200, message: "Form updated successfully" });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({
        code: 404,
        message: "Form not found",
      });
    }
    console.error("Error updating form:", error);
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
 * /api/v1/forms/changeStatus:
 *   get:
 *     summary: "Form statusini o'zgartirish"
 *     tags: [Forms]
 *     parameters:
 *       - in: query
 *         name: formId
 *         schema:
 *           type: string
 *         required: true
 *         description: "Form IDsi"
 *       - in: query
 *         name: status
 *         schema:
 *           type: boolean
 *         required: true
 *         description: "Yangi status (true/false)"
 *     responses:
 *       200:
 *         description: "Form statusi muvaffaqiyatli o'zgartirildi"
 *       400:
 *         description: "Xato: Barcha kiritishlar talab qilinadi yoki noto'g'ri ma'lumotlar"
 *       404:
 *         description: "Form topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.changeFormStatus = async (req, res) => {
  try {
    // Foydalanuvchi kiritgan ma'lumotlarni olish
    const { formId, status } = req.query;

    // Kiritilgan ma'lumotlarni tekshirish
    if (!formId || status === undefined) {
      return res
        .status(400)
        .json({ code: 400, message: "Form ID and status are required" });
    }

    // Formni bazadan topish
    const form = await prisma.form.findUnique({
      where: { id: formId },
    });

    // Agar form topilmasa
    if (!form) {
      return res.status(404).json({ code: 404, message: "Form not found" });
    }

    // Form statusini yangilash
    await prisma.form.update({
      where: { id: formId },
      data: { status: status === "true" },
    });

    // Muvaffaqiyatli javob qaytarish
    return res
      .status(200)
      .json({ code: 200, message: "Form status updated successfully" });
  } catch (error) {
    console.error("Error during form status update:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {
    // Prisma clientni uzish

  }
};
