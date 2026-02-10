const config = require("../../config/auth.config");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const { userLogger } = require("../helpers/logger");
const { AdminSchema } = require("../helpers/validator");
const { PrismaClient } = require("@prisma/client");
const safeString = require("../helpers/safeString");

// Initialize Prisma Client
const prisma = require('../../db/database');

dotenv.config();

/**
 * @swagger
 * /api/v1/auth/signup:
 *   post:
 *     summary: "Foydalanuvchini ro'yxatdan o'tkazish"
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               father_name:
 *                 type: string
 *               rank:
 *                 type: string
 *               nationality:
 *                 type: string
 *               password:
 *                 type: string
 *               role:
 *                 type: array
 *                 items:
 *                   type: string
 *               birthDate:
 *                 type: string
 *                 format: date
 *               phone:
 *                 type: string
 *               gender:
 *                 type: string
 *             example:
 *               username: "admin32"
 *               first_name: "Alsu"
 *               last_name: "Sharipova"
 *               middle_name: "Admin"
 *               father_name: "Sharipov"
 *               rank: "Captain"
 *               password: "pt5166%^r&e#"
 *               role: ["admin"]
 *               birthDate: "1993-05-05"
 *               phone: "+998993738805"
 *               gender: "female"
 *     responses:
 *       201:
 *         description: "Foydalanuvchi muvaffaqiyatli ro'yxatdan o'tdi"
 *       400:
 *         description: "Xato: Barcha kiritishlar talab qilinadi yoki foydalanuvchi allaqachon mavjud"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.signup = async (req, res) => {
  // Our register logic starts here
  try {
    // Get user input
    const {
      username,
      first_name,
      last_name,
      father_name,
      password,
      gender,
      nationality,
      rank,
      role,
      photo,
      phone,
      workplace,
      status,
      birthDate,
    } = req.body;

    // Validate user input
    if (!(username && password)) {
      return res
        .status(400)
        .json({ code: 400, message: "All input is required" });
    }

    // Check if the admin already exists
    const oldAdmin = await prisma.admin.findFirst({
      where: { username },
    });

    if (oldAdmin) {
      return res
        .status(400)
        .json({ code: 400, message: "Admin Already Exists. Please Login." });
    }

    // Encrypt user password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Prepare the data for creation
    const adminData = {
      first_name,
      last_name,
      father_name,
      username,
      password: hashedPassword,
      salt,
      nationality,
      rank,
      role: role || "admin", // Default role is 'admin'
      status: status || "inactive",
      birthDate: birthDate ? safeString(birthDate) : null, // Parse birthDate if provided
      gender: gender || "male",
      photo: photo || "",
      phone: phone || "",
      workplace: workplace || "",
    };
    const validationResult = AdminSchema.safeParse(adminData);
    if (!validationResult.success) {
      return res.status(400).json({
        code: 400,
        message: "Invalid input",
        errors: validationResult.error.errors,
      });
    }
    const validated = validationResult.data;
    // Create the admin in the database
    const newAdmin = await prisma.admin.create({
      data: validated,
    });

    // Return the newly created admin (excluding the password for security)
    return res.status(201).json({
      id: newAdmin.id,
      username: newAdmin.username,
      role: newAdmin.role,
      birthDate: newAdmin.birthDate,
      photo: newAdmin.photo,
      nationality: newAdmin.nationality,
      rank: newAdmin.rank,
      phone: newAdmin.phone,
      workplace: newAdmin.workplace,
      createdAt: newAdmin.createdAt,
      updatedAt: newAdmin.updatedAt,
    });
  } catch (error) {
    console.error("Error during registration:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
  // Our register logic ends here
};

/**
 * @swagger
 * /api/v1/auth/signin:
 *   post:
 *     summary: "Foydalanuvchini tizimga kirish"
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *             example:
 *               username: "admin01"
 *               password: "pt5166%^r&e#"
 *     responses:
 *       200:
 *         description: "Login muvaffaqiyatli"
 *       400:
 *         description: "Xato: Barcha kiritishlar talab qilinadi yoki noto'g'ri ma'lumotlar"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.signin = async (req, res) => {
  // Our login logic starts here
  try {
    // Get user input from the request body
    const { username, password } = req.body;

    // Validate input
    if (!(username && password)) {
      return res
        .status(400)
        .json({ code: 400, message: "All input is required" });
    }

    // Check if the user exists in the database
    const user = await prisma.admin.findFirst({
      where: {
        username,
        status: "active",
      },
    });
    // If the user does not exist
    if (!user) {
      return res
        .status(404)
        .json({ code: 404, message: "Admin does not exist. Please sign up." });
    }
    // Compare the provided password with the stored hashed password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (isPasswordValid) {
      // Create an access token
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        config.secret,
        {
          expiresIn: config.jwtExpiration,
        }
      );

      // Optionally, implement a refresh token mechanism
      const refreshToken = jwt.sign({ id: user.id }, config.secret, {
        expiresIn: "1d",
      });

      await prisma.refreshToken.create({
        data: {
          token: refreshToken,
          expiredAt: new Date(Date.now() + config.jwtRefreshExpiration),
          adminId: user.id,
        },
      });

      // Generate authorities based on the user's role
      const authorities = user.role.toUpperCase();
      await prisma.seans.create({
        data: {
          adminId: user.id,
          resource: req?.originalUrl || "Unknown", // Example resource: the requested URL
          ip_address: req?.ip || "Unknown",
          user_agent: req?.headers["user-agent"] || "Unknown",
          auth_method: "Login va parol", // Default auth method
        },
      });
      // Respond with user details, token, and refresh token
      return res.status(200).json({
        code: 200,
        message: "Login successful",
        data: {
          id: user.id,
          username: user.username,
          first_name: user.first_name,
          last_name: user.last_name,
          phone: user.phone,
          photo: user.photo,
          nationality: user.nationality,
          rank: user.rank,
          role: user.role,
          birthDate: user.birthDate,
          status: user.status,
          token,
          refreshToken,
          authorities,
        },
      });
    }
    // If the password is invalid
    return res
      .status(402)
      .json({ code: 402, message: "Invalid credentials. Please try again." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: 403,
    });
  } finally {
    // Disconnect the Prisma client to free up resources

  }
  // Our register logic ends here
};

/**
 * @swagger
 * /api/v1/auth/getById:
 *   get:
 *     summary: "Foydalanuvchini ID bo'yicha olish"
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Foydalanuvchi IDsi"
 *     responses:
 *       200:
 *         description: "Foydalanuvchi topildi"
 *       404:
 *         description: "Foydalanuvchi topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.getById = async (req, res) => {
  // Our login logic starts here
  try {
    // Get user input from query parameters
    const { id } = req.query;

    // Check if ID is provided
    if (!id) {
      return res.status(400).json({ code: 400, message: "ID is required" });
    }

    // Fetch the user from the database
    const user = await prisma.admin.findFirst({
      select: {
        id: true,
        first_name: true,
        last_name: true,
        father_name: true,
        nationality: true,
        workplace: true,
        rank: true,
        gender: true,
        phone: true,
        username: true,
        role: true,
        birthDate: true,
      },
      where: { id },
    });

    // Handle case when user is not found
    if (!user) {
      return res.status(404).json({
        code: 404,
        message: "User not found",
      });
    }

    // Respond with the user data
    return res.status(200).json({
      code: 200,
      message: "User exists",
      user,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: err.message,
    });
  } finally {
    // Disconnect Prisma client

  }
  // Our register logic ends here
};

/**
 * @swagger
 * /api/v1/auth/deleteById:
 *   delete:
 *     summary: "Foydalanuvchini ID bo'yicha o'chirish"
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Foydalanuvchi IDsi"
 *     responses:
 *       200:
 *         description: "Foydalanuvchi muvaffaqiyatli o'chirildi"
 *       404:
 *         description: "Foydalanuvchi topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.deleteById = async (req, res) => {
  // Our login logic starts here
  try {
    // Get user input from query parameters
    const { id } = req.query;

    // Check if ID is provided
    if (!id) {
      return res.status(400).json({
        code: 400,
        message: "ID is required",
      });
    }

    // Delete the user from the database
    const user = await prisma.admin
      .delete({
        where: { id },
      })
      .catch((err) => {
        // If user does not exist, catch Prisma error
        if (err.code === "P2025") {
          return null;
        }
        throw err;
      });

    // Handle case when user is not found
    if (!user) {
      return res.status(404).json({
        code: 404,
        message: "User not found",
      });
    }

    // Respond with success message
    return res.status(200).json({
      code: 200,
      message: "User exists and deleted successfully",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: err.message,
    });
  } finally {
    // Disconnect Prisma client

  }
  // Our register logic ends here
};

/**
 * @swagger
 * /api/v1/auth/getByToken:
 *   get:
 *     summary: "Token orqali foydalanuvchini olish"
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: "Foydalanuvchi topildi"
 *       404:
 *         description: "Foydalanuvchi topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.getByToken = async (req, res) => {
  // Our login logic starts here
  try {
    // Get user input
    const id = req.userId;

    // Validate if user exists in our database
    const user = await prisma.admin.findFirst({
      where: { id, status: "active" },
      orderBy: {
        updatedAt: "desc",
      },
    });

    if (!user) {
      return res.status(404).json({
        code: 404,
        message: "There is not any user yet",
      });
    } else {
      return res.status(200).json({ code: 200, message: "User exists", user });
    }
  } catch (err) {
    userLogger.error(err);
    console.log(err);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: err.message,
    });
  }
  // Our register logic ends here
};

/**
 * @swagger
 * /api/v1/auth/list:
 *   get:
 *     summary: "Retrieve list of users"
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: pageNumber
 *         schema:
 *           type: integer
 *           default: 1
 *         required: true
 *         description: "Page number"
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 10
 *         required: true
 *         description: "Number of users per page"
 *       - in: query
 *         name: first_name
 *         schema:
 *           type: string
 *         required: false
 *         description: "Filter by first name (partial match)"
 *       - in: query
 *         name: last_name
 *         schema:
 *           type: string
 *         required: false
 *         description: "Filter by last name (partial match)"
 *       - in: query
 *         name: username
 *         schema:
 *           type: string
 *         required: false
 *         description: "Filter by username (partial match)"
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         required: false
 *         description: "Global search across first name, last name, and username"
 *       - in: query
 *         name: role
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *         required: false
 *         description: "Filter by user roles (e.g., ['admin', 'user'])"
 *       - in: query
 *         name: rank
 *         schema:
 *           type: string
 *         required: false
 *         description: "Filter by rank (partial match)"
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         required: false
 *         description: "Filter by status (e.g., 'active', 'inactive')"
 *     responses:
 *       200:
 *         description: "Users retrieved successfully"
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
 *                   example: "Users found"
 *                 total_pages:
 *                   type: integer
 *                   example: 5
 *                 total_users:
 *                   type: integer
 *                   example: 100
 *                 users:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       first_name:
 *                         type: string
 *                       last_name:
 *                         type: string
 *                       username:
 *                         type: string
 *                       role:
 *                         type: array
 *                         items:
 *                           type: string
 *                       status:
 *                         type: string
 *                       birthDate:
 *                         type: string
 *                         format: date
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *       400:
 *         description: "Bad Request"
 *       404:
 *         description: "No users found"
 *       500:
 *         description: "Internal Server Error"
 */
exports.getList = async (req, res) => {
  try {
    // Destructure and sanitize query parameters
    let {
      pageNumber = 1,
      pageSize = 10,
      first_name,
      last_name,
      father_name,
      username,
      query,
      role,
      rank,
      status,
    } = req.query;

    pageNumber = parseInt(pageNumber, 10);
    pageSize = parseInt(pageSize, 10);

    // Validate pagination inputs
    if (pageNumber < 1 || pageSize < 1) {
      return res.status(400).json({ message: "Invalid pagination parameters" });
    }

    // Build advanced query filters
    const filters = {
      AND: [
        query
          ? {
              OR: [
                { first_name: { contains: query, mode: "insensitive" } },
                { last_name: { contains: query, mode: "insensitive" } },
                { father_name: { contains: query, mode: "insensitive" } },
                { username: { contains: query, mode: "insensitive" } },
                { rank: { contains: query, mode: "insensitive" } },
              ],
            }
          : {},
        rank ? { rank: { contains: rank, mode: "insensitive" } } : {},
        role ? { role: { hasSome: role } } : {},
        status ? { status } : {},
      ],
    };

    // Fetch users with pagination and filters
    const users = await prisma.admin.findMany({
      where: filters,
      select: {
        id: true,
        first_name: true,
        last_name: true,
        father_name: true,
        gender: true,
        username: true,
        nationality: true,
        rank: true,
        role: true,
        status: true,
        workplace: true,
        photo: true,
        phone: true,
        birthDate: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "asc" },
      skip: (pageNumber - 1) * pageSize,
      take: pageSize,
    });

    // Count total matching records for pagination
    const totalUsers = await prisma.admin.count({ where: filters });

    // Calculate total pages
    const totalPages = Math.ceil(totalUsers / pageSize);

    // Check if users exist
    if (!users.length) {
      return res.status(404).json({
        code: 404,
        message: "No users found",
      });
    }

    // Return paginated results
    return res.status(200).json({
      code: 200,
      message: "Users found",
      total_pages: totalPages,
      total_users: totalUsers,
      users,
    });
  } catch (err) {
    console.error("Error fetching user list:", err);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: err.message,
    });
  }
};

/**
 * @swagger
 * /api/v1/auth/passwordReset:
 *   post:
 *     summary: "Parolni yangilash"
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: adminId
 *         schema:
 *           type: string
 *         required: true
 *         description: "Admin IDsi"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               oldPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *             example:
 *               oldPassword: "oldPassword123"
 *               newPassword: "newPassword456"
 *     responses:
 *       200:
 *         description: "Parol muvaffaqiyatli yangilandi"
 *       400:
 *         description: "Xato: Barcha kiritishlar talab qilinadi yoki noto'g'ri ma'lumotlar"
 *       404:
 *         description: "Admin topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.passwordReset = async (req, res) => {
  try {
    // Foydalanuvchi kiritgan ma'lumotlarni olish
    const { adminId } = req.query;
    const { oldPassword, newPassword } = req.body;

    // Kiritilgan ma'lumotlarni tekshirish
    if (!(adminId && oldPassword && newPassword)) {
      return res
        .status(400)
        .json({ code: 400, message: "All input is required" });
    }

    // Adminni bazadan topish
    const admin = await prisma.admin.findFirst({
      where: { id: adminId, status: "active" },
    });

    // Agar admin topilmasa
    if (!admin) {
      return res.status(404).json({ code: 404, message: "Admin not found" });
    }

    // Eski parolni tekshirish
    const isOldPasswordValid = await bcrypt.compare(
      oldPassword,
      admin.password
    );
    if (!isOldPasswordValid) {
      return res
        .status(400)
        .json({ code: 400, message: "Old password is incorrect" });
    }

    // Yangi parolni shifrlash
    const newSalt = await bcrypt.genSalt(10);
    const hashedNewPassword = await bcrypt.hash(newPassword, newSalt);

    // Tranzaksiya qo'shish
    await prisma.$transaction([
      prisma.admin.update({
        where: { id: adminId },
        data: {
          password: hashedNewPassword,
          salt: newSalt,
        },
      }),
      prisma.log.create({
        data: {
          recordId: adminId,
          tableName: "Admin",
          fieldName: "password",
          oldValue: admin.password, // Eski parolni logga yozish
          newValue: hashedNewPassword, // Yangi parolni logga yozish
          executorId: req.userId, // Foydalanuvchi IDsi, agar mavjud bo'lsa
        },
      }),
    ]);

    // Muvaffaqiyatli javob qaytarish
    return res
      .status(200)
      .json({ code: 200, message: "Password updated successfully" });
  } catch (error) {
    console.error("Error during password reset:", error);
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
 * /api/v1/auth/update:
 *   put:
 *     summary: "Admin ma'lumotlarini yangilash"
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: adminId
 *         schema:
 *           type: string
 *         required: true
 *         description: "Admin IDsi"
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
 *               username:
 *                 type: string
 *               rank:
 *                 type: string
 *               nationality:
 *                 type: string
 *               password:
 *                 type: string
 *               role:
 *                 type: array
 *                 items:
 *                   type: string
 *               birthDate:
 *                 type: string
 *                 format: date
 *             example:
 *               first_name: "Alsu"
 *               last_name: "Sharipova"
 *               username: "admin32"
 *               rank: "Major"
 *               password: "newPassword123"
 *               role: ["admin"]
 *               birthDate: "1993-05-05"
 *     responses:
 *       200:
 *         description: "Admin ma'lumotlari muvaffaqiyatli yangilandi"
 *       400:
 *         description: "Xato: Barcha kiritishlar talab qilinadi yoki noto'g'ri ma'lumotlar"
 *       404:
 *         description: "Admin topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.update = async (req, res) => {
  try {
    // Extract admin ID and fields to update from the request
    const { adminId } = req.query;
    const {
      first_name,
      last_name,
      father_name,
      username,
      password,
      role,
      birthDate,
      photo,
      nationality,
      phone,
      workplace,
      rank,
      gender,
    } = req.body;

    // Validate required parameters
    if (!adminId) {
      return res
        .status(400)
        .json({ code: 400, message: "Admin ID is required" });
    }

    // Find the current admin data
    const currentAdmin = await prisma.admin.findUnique({
      where: { id: adminId },
    });
    if (!currentAdmin) {
      return res.status(404).json({ code: 404, message: "Admin not found" });
    }

    // Prepare the update data and logs
    const data = {};
    const logs = [];

    // Compare and update fields only if they are different
    if (first_name !== currentAdmin.first_name && first_name != null) {
      data.first_name = first_name;
      logs.push({
        recordId: adminId,
        tableName: "Admin",
        fieldName: "first_name",
        oldValue: currentAdmin.first_name || "",
        newValue: first_name || "",
        executorId: req.userId,
      });
    }

    if (phone !== currentAdmin.phone && phone != null) {
      data.phone = phone;
      logs.push({
        recordId: adminId,
        tableName: "Admin",
        fieldName: "phone",
        oldValue: currentAdmin.phone || "",
        newValue: phone || "",
        executorId: req.userId,
      });
    }

    if (gender !== currentAdmin.gender && gender != null) {
      data.gender = gender;
      logs.push({
        recordId: adminId,
        tableName: "Admin",
        fieldName: "gender",
        oldValue: currentAdmin.gender || "",
        newValue: gender || "",
        executorId: req.userId,
      });
    }

    if (nationality !== currentAdmin.nationality && nationality != null) {
      data.nationality = nationality;
      logs.push({
        recordId: adminId,
        tableName: "Admin",
        fieldName: "nationality",
        oldValue: currentAdmin.nationality || "",
        newValue: nationality || "",
        executorId: req.userId,
      });
    }

    if (workplace !== currentAdmin.workplace) {
      data.workplace = workplace;
      logs.push({
        recordId: adminId,
        tableName: "Admin",
        fieldName: "workplace",
        oldValue: currentAdmin.workplace || "",
        newValue: workplace || "",
        executorId: req.userId,
      });
    }

    if (rank !== currentAdmin.rank && rank != null) {
      data.rank = rank;
      logs.push({
        recordId: adminId,
        tableName: "Admin",
        fieldName: "rank",
        oldValue: currentAdmin.rank || "",
        newValue: rank || "",
        executorId: req.userId,
      });
    }

    if (last_name !== currentAdmin.last_name && last_name != null) {
      data.last_name = last_name;
      logs.push({
        recordId: adminId,
        tableName: "Admin",
        fieldName: "last_name",
        oldValue: currentAdmin.last_name || "",
        newValue: last_name || "",
        executorId: req.userId,
      });
    }

    if (photo !== currentAdmin.photo && photo != null) {
      data.photo = photo;
      logs.push({
        recordId: adminId,
        tableName: "Admin",
        fieldName: "photo",
        oldValue: currentAdmin.photo || "",
        newValue: photo || "",
        executorId: req.userId,
      });
    }

    if (father_name !== currentAdmin.father_name && father_name != null) {
      data.father_name = father_name;
      logs.push({
        recordId: adminId,
        tableName: "Admin",
        fieldName: "father_name",
        oldValue: currentAdmin.father_name || "",
        newValue: father_name || "",
        executorId: req.userId,
      });
    }

    if (username !== currentAdmin.username && username != null) {
      const existingAdmin = await prisma.admin.findFirst({
        where: { username },
      });
      if (existingAdmin && existingAdmin.id !== adminId) {
        return res
          .status(400)
          .json({ code: 400, message: "Username is already taken" });
      }
      data.username = username;
      logs.push({
        recordId: adminId,
        tableName: "Admin",
        fieldName: "username",
        oldValue: currentAdmin.username || "",
        newValue: username || "",
        executorId: req.userId,
      });
    }

    if (role !== currentAdmin.role && role != null) {
      data.role = role;
      logs.push({
        recordId: adminId,
        tableName: "Admin",
        fieldName: "role",
        oldValue: currentAdmin.role || "",
        newValue: role || "",
        executorId: req.userId,
      });
    }

    if (new Date(birthDate) !== currentAdmin.birthDate) {
      data.birthDate = new Date(birthDate);
      logs.push({
        recordId: adminId,
        tableName: "Admin",
        fieldName: "birthDate",
        oldValue: safeString((currentAdmin.birthDate)) || "",
        newValue: safeString((birthDate)) || "",
        executorId: req.userId,
      });
    }

    if (password && password !== currentAdmin.password && password != null) {
      const newSalt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, newSalt);
      data.password = hashedPassword;
      data.salt = newSalt;
      logs.push({
        recordId: adminId,
        tableName: "Admin",
        fieldName: "password",
        oldValue: "<hashed_value>",
        newValue: "<hashed_value>",
        executorId: req.userId,
      });
    }
    // Perform the update and create logs in a transaction
    await prisma.$transaction([
      prisma.admin.update({
        where: { id: adminId },
        data,
      }),
      ...logs.map((log) => prisma.log.create({ data: log })),
    ]);

    // Return a success response
    return res
      .status(200)
      .json({ code: 200, message: "Admin updated successfully" });
  } catch (error) {
    console.error("Error updating admin:", error);
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
 * /api/v1/auth/getAdminSessions/{id}:
 *   get:
 *     summary: "Admin va uning sessiyalarini olish"
 *     tags: [Auth]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Admin IDsi"
 *       - in: query
 *         name: pageNumber
 *         schema:
 *           type: string
 *         required: false
 *         description: "Page number"
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: string
 *         required: false
 *         description: "Page size"
 *     responses:
 *       200:
 *         description: "Admin va sessiyalar topildi"
 *       404:
 *         description: "Admin yoki sessiyalar topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.getAdminSessions = async (req, res) => {
  try {
    const { id } = req.params;
    let { pageNumber = 1, pageSize = 10 } = req.query;

    pageNumber = parseInt(pageNumber);
    pageSize = parseInt(pageSize);

    // Kiritilgan ma'lumotlarni tekshirish
    if (!id) {
      return res
        .status(400)
        .json({ code: 400, message: "Admin ID is required" });
    }
    // Adminni bazadan topish
    const seans = await prisma.seans.findMany({
      where: { adminId: id },
      orderBy: {
        createdAt: "desc",
      },
      skip: (pageNumber - 1) * pageSize,
      take: pageSize,
    });
    const totalSessions = await prisma.seans.count({
      where: { adminId: id },
    });

    // Agar admin yoki sessiyalar topilmasa
    if (!seans) {
      return res
        .status(404)
        .json({ code: 404, message: "Admin or sessions not found" });
    }

    // Muvaffaqiyatli javob qaytarish
    return res.status(200).json({
      code: 200,
      message: "Admin and sessions found",
      sessions: seans,
      totalSessions: totalSessions,
    });
  } catch (error) {
    console.error("Error fetching admin sessions:", error);
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
 * /api/v1/auth/getAdminServices/{id}:
 *   get:
 *     summary: "Adminning xizmatlarga kirish huquqlarini olish"
 *     tags: [Auth]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Admin IDsi"
 *       - in: query
 *         name: pageNumber
 *         schema:
 *           type: string
 *         required: false
 *         description: "Page number"
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: string
 *         required: false
 *         description: "Page size"
 *     responses:
 *       200:
 *         description: "Admin va xizmatlar topildi"
 *       404:
 *         description: "Admin yoki xizmatlar topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.getAdminServices = async (req, res) => {
  try {
    // Foydalanuvchi kiritgan ma'lumotlarni olish
    const { id } = req.params;
    let { pageNumber = 1, pageSize = 10 } = req.query;
    console.log(id);
    console.log(pageNumber, pageSize);
    pageNumber = parseInt(pageNumber);
    pageSize = parseInt(pageSize);

    // Kiritilgan ma'lumotlarni tekshirish
    if (!id) {
      return res
        .status(400)
        .json({ code: 400, message: "Admin ID is required" });
    }

    // Admin va uning xizmatlarini bazadan topish
    const services = await prisma.AdminServiceAccess.findMany({
      where: { adminId: id },
      skip: (pageNumber - 1) * pageSize,
      include: {
        service: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
        grantedByAdmin: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            username: true,
          },
        },
      },
      take: pageSize,
    });
    const totalServices = await prisma.AdminServiceAccess.count({
      where: { adminId: id },
    });

    // Agar admin yoki xizmatlar topilmasa
    if (!services) {
      return res
        .status(404)
        .json({ code: 404, message: "Admin or services not found" });
    }
    if (services.length === 0) {
      return res
        .status(404)
        .json({ code: 404, message: "Admin or services not found" });
    }

    // Muvaffaqiyatli javob qaytarish
    return res.status(200).json({
      code: 200,
      message: "Admin and services found",
      services: services,
      totalServices: totalServices,
    });
  } catch (error) {
    console.error("Error fetching admin services:", error);
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
 * /api/v1/auth/changeStatus:
 *   put:
 *     summary: "Adminning statusini o'zgartirish"
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: adminId
 *         schema:
 *           type: string
 *         required: true
 *         description: "Admin IDsi"
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         required: true
 *         description: "Yangi status (active/inactive)"
 *     responses:
 *       200:
 *         description: "Admin statusi muvaffaqiyatli o'zgartirildi"
 *       400:
 *         description: "Xato: Barcha kiritishlar talab qilinadi yoki noto'g'ri ma'lumotlar"
 *       404:
 *         description: "Admin topilmadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.changeStatus = async (req, res) => {
  try {
    // Foydalanuvchi kiritgan ma'lumotlarni olish
    const { adminId, status } = req.query;

    // Kiritilgan ma'lumotlarni tekshirish
    if (!adminId || !status) {
      return res
        .status(400)
        .json({ code: 400, message: "Admin ID and status are required" });
    }

    // Adminni bazadan topish
    const admin = await prisma.admin.findFirst({
      where: { id: adminId },
    });

    // Agar admin topilmasa
    if (!admin) {
      return res.status(404).json({ code: 404, message: "Admin not found" });
    }

    // Admin statusini yangilash
    await prisma.admin.update({
      where: { id: adminId },
      data: { status },
    });

    // Muvaffaqiyatli javob qaytarish
    return res
      .status(200)
      .json({ code: 200, message: "Admin status updated successfully" });
  } catch (error) {
    console.error("Error during admin status update:", error);
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
 * /api/v1/auth/refreshToken:
 *   post:
 *     summary: "Yangi kirish tokenini olish uchun refresh tokenni yangilash"
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *             example:
 *               refreshToken: "your-refresh-token-here"
 *     responses:
 *       200:
 *         description: "Yangi kirish tokeni muvaffaqiyatli yaratildi"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *       403:
 *         description: "Refresh token talab qilinadi yoki mavjud emas"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       500:
 *         description: "Ichki server xatosi"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 error:
 *                   type: string
 */
exports.refreshToken = async (req, res) => {
  const { refreshToken: requestToken } = req.body;

  if (!requestToken) {
    return res
      .status(403)
      .json({ code: 403, message: "Refresh Token is required!" });
  }

  try {
    const refreshToken = await prisma.refreshToken.findFirst({
      where: { token: requestToken },
    });

    if (!refreshToken) {
      return res
        .status(403)
        .json({ code: 403, message: "Refresh token is not in database!" });
    }

    const status = refreshToken.expiredAt > new Date();
    const checkAdmin = await prisma.admin.findFirst({
      where: { id: refreshToken?.adminId, status: "active" },
    });
    if (!status || !checkAdmin) {
      prisma.refreshToken.delete({ where: { id: refreshToken.id } });

      return res.status(403).json({
        code: 403,
        message: "Refresh token was expired. Please make a new signin request",
      });
    }

    const newAccessToken = jwt.sign(
      { id: refreshToken.adminId },
      config.secret,
      {
        expiresIn: config.jwtExpiration,
      }
    );

    return res.status(200).json({
      accessToken: newAccessToken,
      refreshToken: refreshToken.token,
    });
  } catch (err) {
    console.error("Error refreshing token:", err);
    return res
      .status(500)
      .json({
        code: 500,
        message: "Internal server error",
        error: err.message,
      });
  }
};

/**
 * @swagger
 * /api/v1/auth/checkUsername:
 *   get:
 *     summary: "Foydalanuvchi nomini mavjudligini tekshirish"
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: username
 *         schema:
 *           type: string
 *         required: true
 *         description: "Tekshiriladigan foydalanuvchi nomi"
 *     responses:
 *       201:
 *         description: "Foydalanuvchi nomi mavjud emas va foydalanish mumkin"
 *       400:
 *         description: "Xato: Foydalanuvchi nomi kiritilishi shart"
 *       409:
 *         description: "Foydalanuvchi nomi allaqachon mavjud"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.checkUsername = async (req, res) => {
  try {
    // Foydalanuvchi nomini so'rovdan olish
    const { username } = req.query;

    // Foydalanuvchi nomi kiritilganligini tekshirish
    if (!username) {
      return res.status(400).json({
        code: 400,
        message: "Username is required",
      });
    }
    // Foydalanuvchi nomini bazadan qidirish
    const existingUser = await prisma.admin.findFirst({
      where: { username },
    });

    // Agar foydalanuvchi nomi bazada mavjud bo'lsa
    if (existingUser) {
      return res.status(409).json({
        code: 409,
        message: "Username already exists",
      });
    }

    // Foydalanuvchi nomi mavjud emas - foydalanish mumkin
    return res.status(201).json({
      code: 201,
      message: "Username is available",
    });
  } catch (error) {
    console.error("Error checking username:", error);
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
 * /api/v1/auth/checkUsernameUpdate:
 *   get:
 *     summary: "Foydalanuvchi nomini mavjudligini tekshirish"
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: username
 *         schema:
 *           type: string
 *         required: true
 *         description: "Tekshiriladigan foydalanuvchi nomi"
 *       - in: query
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Admin IDsi"
 *     responses:
 *       201:
 *         description: "Foydalanuvchi nomi mavjud emas va foydalanish mumkin"
 *       400:
 *         description: "Xato: Foydalanuvchi nomi kiritilishi shart"
 *       409:
 *         description: "Foydalanuvchi nomi allaqachon mavjud"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.checkUsernameUpdate = async (req, res) => {
  try {
    // Foydalanuvchi nomini so'rovdan olish
    const { username, id } = req.query;

    if (!id && !username) {
      return res.status(400).json({
        code: 400,
        message: "Admin ID and username are required",
      });
    }
    // Foydalanuvchi nomini bazadan qidirish
    const existingUser = await prisma.admin.findFirst({
      where: { id: id },
    });
    if (existingUser.username === username) {
      return res.status(201).json({
        code: 201,
        message: "User is available",
      });
    }

    const checkUsername = await prisma.admin.findFirst({
      where: { username: username },
    });
    // Agar foydalanuvchi nomi bazada mavjud bo'lsa
    if (checkUsername) {
      return res.status(409).json({
        code: 409,
        message: "Username already exists",
      });
    }

    // Foydalanuvchi nomi mavjud emas - foydalanish mumkin
    return res.status(201).json({
      code: 201,
      message: "Username is available",
    });
  } catch (error) {
    console.error("Error checking username:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {
    // Prisma clientni uzish

  }
};
