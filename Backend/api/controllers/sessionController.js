const { PrismaClient } = require("@prisma/client");
const dotenv = require("dotenv");

// Initialize Prisma Client
const prisma = require('../../db/database');

dotenv.config();

/**
 * @swagger
 * /api/v1/sessions/create:
 *   post:
 *     summary: "Create a new session"
 *     tags: [Sessions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               registrationId:
 *                 type: string
 *                 description: "ID of the registration record"
 *               type:
 *                 type: string
 *                 enum: [SESSION, RESERVE, RAPORT]
 *                 description: "Type of session"
 *             required:
 *               - registrationId
 *               - type
 *             example:
 *               registrationId: "123e4567-e89b-12d3-a456-426614174000"
 *               type: "SESSION"
 *     responses:
 *       201:
 *         description: "Session created successfully"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 201
 *                 message:
 *                   type: string
 *                   example: "Session created successfully"
 *                 session:
 *                   type: object
 *       400:
 *         description: "Invalid input or registration not found"
 *       500:
 *         description: "Internal server error"
 */
exports.createSession = async (req, res) => {
  try {
    const { registrationId, type } = req.body;
    const adminId = req.userId;

    // 1. Validate required fields
    if (!registrationId || !type) {
      return res.status(400).json({
        code: 400,
        message: "Registration ID and type are required",
      });
    }

    // 2. Validate session type
    const validTypes = ["SESSION", "RESERVE", "RAPORT"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        code: 400,
        message: "Invalid session type",
      });
    }

    const existingSession = await prisma.session.findFirst({
      where: {
        registrationId: registrationId,
        type: type,
      },
    });

    if (existingSession) {
      return res.status(400).json({
        code: 400,
        message: "Session with this registration ID already exists",
      });
    }

    // 3. Try to find a Registration or a Relative with this ID
    const [registration, relative] = await Promise.all([
      prisma.registration.findUnique({ where: { id: registrationId } }),
      prisma.relatives.findUnique({ where: { id: registrationId } }),
    ]);

    // 4. If neither exists, bail out
    if (!registration && !relative) {
      return res.status(400).json({
        code: 400,
        message: "No Registration or Relative found with that ID",
      });
    }

    // 5. Choose the one that exists
    const source = registration || relative;

    // 6. Compute next order
    const lastSession = await prisma.session.findFirst({
      where: { adminId, type },
      orderBy: { order: "desc" },
    });
    const nextOrder = lastSession ? lastSession.order + 1 : 1;

    // 7. Create the session using shared fields
    const newSession = await prisma.session.create({
      data: {
        registrationId,
        regNumber: source.regNumber,
        fullName: source.fullName,
        firstName: source.firstName,
        lastName: source.lastName,
        fatherName: source.fatherName,
        birthYear: source.birthYear,
        birthDate: source.birthDate,
        birthPlace: source.birthPlace,
        workplace: source.workplace,
        position: source.position,
        residence: source.residence,
        model: source.model,
        notes: source.notes,
        additionalNotes: source.additionalNotes,
        externalNotes: source.externalNotes,
        adminId,
        type,
        order: nextOrder,
      },
    });

    return res.status(201).json({
      code: 201,
      message: "Session created successfully",
      session: newSession,
    });
  } catch (error) {
    console.error("Error creating session:", error);
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
 * /api/v1/sessions/delete/{id}:
 *   delete:
 *     summary: "Delete a session and reorder remaining sessions"
 *     tags: [Sessions]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Session ID"
 *     responses:
 *       200:
 *         description: "Session deleted successfully"
 *       404:
 *         description: "Session not found"
 *       500:
 *         description: "Internal server error"
 */
exports.deleteSession = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.userId;

    // Find the session to delete
    const sessionToDelete = await prisma.session.findFirst({
      where: {
        id,
        adminId,
      },
    });

    if (!sessionToDelete) {
      return res.status(404).json({
        code: 404,
        message: "Session not found",
      });
    }

    const { type, order: deletedOrder } = sessionToDelete;

    // Use transaction to delete session and reorder
    await prisma.$transaction(async (tx) => {
      // Delete the session
      await tx.session.delete({
        where: { id },
      });

      // Update orders for sessions that come after the deleted one
      await tx.session.updateMany({
        where: {
          adminId,
          type,
          order: {
            gt: deletedOrder,
          },
        },
        data: {
          order: {
            decrement: 1,
          },
        },
      });
    });

    return res.status(200).json({
      code: 200,
      message: "Session deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting session:", error);
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
 * /api/v1/sessions/swap:
 *   post:
 *     summary: "Swap positions of two sessions (drag and drop functionality)"
 *     tags: [Sessions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [SESSION, RESERVE, RAPORT]
 *                 description: "Type of session"
 *               activeIndex:
 *                 type: integer
 *                 description: "Current index of the item being moved"
 *               overIndex:
 *                 type: integer
 *                 description: "Target index where the item will be moved"
 *             required:
 *               - type
 *               - activeIndex
 *               - overIndex
 *             example:
 *               type: "SESSION"
 *               activeIndex: 2
 *               overIndex: 5
 *     responses:
 *       200:
 *         description: "Sessions swapped successfully"
 *       400:
 *         description: "Invalid input"
 *       500:
 *         description: "Internal server error"
 */
exports.swapSessions = async (req, res) => {
  try {
    const { type, activeIndex, overIndex } = req.body;
    const adminId = req.userId;

    // Validate required fields
    if (
      !type ||
      activeIndex === undefined ||
      overIndex === undefined ||
      activeIndex === "" ||
      overIndex === ""
    ) {
      return res.status(400).json({
        code: 400,
        message: "Type, activeIndex, and overIndex are required",
      });
    }

    // Validate session type
    const validTypes = ["SESSION", "RESERVE", "RAPORT"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        code: 400,
        message: "Invalid session type",
      });
    }

    // Convert to 1-based indexing (assuming frontend sends 0-based)
    const activeOrder = activeIndex + 1;
    const overOrder = overIndex + 1;

    console.log("Moving from order:", activeOrder, "to order:", overOrder);

    if (activeOrder === overOrder) {
      return res.status(200).json({
        code: 200,
        message: "No change needed",
      });
    }

    // Use transaction to perform the reordering
    await prisma.$transaction(async (tx) => {
      // First, set the active item to a temporary order to avoid conflicts
      const tempOrder = -1;
      await tx.session.updateMany({
        where: {
          adminId,
          type,
          order: activeOrder,
        },
        data: {
          order: tempOrder,
        },
      });

      if (activeOrder < overOrder) {
        // Moving item down: shift items between activeOrder and overOrder up by 1
        await tx.session.updateMany({
          where: {
            adminId,
            type,
            order: {
              gt: activeOrder,
              lte: overOrder,
            },
          },
          data: {
            order: {
              decrement: 1,
            },
          },
        });
      } else {
        // Moving item up: shift items between overOrder and activeOrder down by 1
        await tx.session.updateMany({
          where: {
            adminId,
            type,
            order: {
              gte: overOrder,
              lt: activeOrder,
            },
          },
          data: {
            order: {
              increment: 1,
            },
          },
        });
      }

      // Finally, set the moved item to its new position
      await tx.session.updateMany({
        where: {
          adminId,
          type,
          order: tempOrder,
        },
        data: {
          order: overOrder,
        },
      });
    });

    return res.status(200).json({
      code: 200,
      message: "Sessions swapped successfully",
    });
  } catch (error) {
    console.error("Error swapping sessions:", error);
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
 * /api/v1/sessions/list:
 *   get:
 *     summary: "List sessions with pagination"
 *     tags: [Sessions]
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
 *         description: "Number of sessions per page"
 *         default: 10
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [SESSION, RESERVE, RAPORT]
 *         required: true
 *         description: "Type of session"
 *     responses:
 *       200:
 *         description: "List of sessions retrieved successfully"
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
 *                   example: "Sessions retrieved successfully"
 *                 total_pages:
 *                   type: integer
 *                 total_sessions:
 *                   type: integer
 *                 sessions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       registrationId:
 *                         type: string
 *                       regNumber:
 *                         type: string
 *                       fullName:
 *                         type: string
 *                       firstName:
 *                         type: string
 *                       lastName:
 *                         type: string
 *                       fatherName:
 *                         type: string
 *                       birthYear:
 *                         type: integer
 *                       birthDate:
 *                         type: string
 *                         format: date-time
 *                       birthPlace:
 *                         type: string
 *                       workplace:
 *                         type: string
 *                       position:
 *                         type: string
 *                       residence:
 *                         type: string
 *                       model:
 *                         type: string
 *                       notes:
 *                         type: string
 *                       additionalNotes:
 *                         type: string
 *                       externalNotes:
 *                         type: string
 *                       adminId:
 *                         type: string
 *                       type:
 *                         type: string
 *                         enum: [SESSION, RESERVE, RAPORT]
 *                       order:
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
exports.listSessions = async (req, res) => {
  try {
    let { pageNumber, pageSize, type } = req.query;
    const adminId = req.userId;

    pageNumber = parseInt(pageNumber);
    pageSize = parseInt(pageSize);

    // Validate input
    if (!(pageNumber && pageSize && type)) {
      return res.status(400).json({
        code: 400,
        message: "Page number, page size, and type are required",
      });
    }

    // Validate session type
    const validTypes = ["SESSION", "RESERVE", "RAPORT"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        code: 400,
        message: "Invalid session type",
      });
    }

    const filter = {
      adminId,
      type,
    };

    // Get paginated sessions from the database
    const sessions = await prisma.session.findMany({
      skip: (pageNumber - 1) * pageSize,
      take: pageSize,
      where: filter,
      orderBy: {
        order: "asc",
      },
    });

    // Get the total number of sessions
    const totalSessions = await prisma.session.count({
      where: filter,
    });

    // Calculate total pages
    const totalPages = Math.ceil(totalSessions / pageSize);

    return res.status(200).json({
      code: 200,
      message: "Sessions retrieved successfully",
      total_pages: totalPages,
      total_sessions: totalSessions,
      sessions: sessions,
    });
  } catch (error) {
    console.error("Error retrieving sessions:", error);
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
 * /api/v1/sessions/list:
 *   get:
 *     summary: "List sessions with pagination"
 *     tags: [Sessions]
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
 *         description: "Number of sessions per page"
 *         default: 10
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [SESSION, RESERVE, RAPORT]
 *         required: true
 *         description: "Type of session"
 *     responses:
 *       200:
 *         description: "List of sessions retrieved successfully"
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
 *                   example: "Sessions retrieved successfully"
 *                 total_pages:
 *                   type: integer
 *                 total_sessions:
 *                   type: integer
 *                 sessions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       registrationId:
 *                         type: string
 *                       regNumber:
 *                         type: string
 *                       fullName:
 *                         type: string
 *                       firstName:
 *                         type: string
 *                       lastName:
 *                         type: string
 *                       fatherName:
 *                         type: string
 *                       birthYear:
 *                         type: integer
 *                       birthDate:
 *                         type: string
 *                         format: date-time
 *                       birthPlace:
 *                         type: string
 *                       workplace:
 *                         type: string
 *                       position:
 *                         type: string
 *                       residence:
 *                         type: string
 *                       model:
 *                         type: string
 *                       notes:
 *                         type: string
 *                       additionalNotes:
 *                         type: string
 *                       externalNotes:
 *                         type: string
 *                       adminId:
 *                         type: string
 *                       type:
 *                         type: string
 *                         enum: [SESSION, RESERVE, RAPORT]
 *                       order:
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
exports.count = async (req, res) => {
  try {
    let { type } = req.query;
    const adminId = req.userId;

    // Validate session type
    const validTypes = ["SESSION", "RESERVE", "RAPORT"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        code: 400,
        message: "Invalid session type",
      });
    }

    const filter = {
      adminId,
      type,
    };

    // Get paginated sessions from the database
    const sessions = await prisma.session.count({
      where: filter,
    });

    return res.status(200).json({
      code: 200,
      message: "Sessions retrieved successfully",
      total_sessions: sessions,
    });
  } catch (error) {
    console.error("Error retrieving sessions:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {

  }
};

exports.clear = async (req, res) => {
  try {
    const { type } = req.body;
    const adminId = req.userId;

    // Validate input
    if (!type) {
      return res.status(400).json({
        code: 400,
        message: "Session type is required",
      });
    }

    // Validate session type
    const validTypes = ["SESSION", "RESERVE", "RAPORT"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        code: 400,
        message: "Invalid session type",
      });
    }

    // Perform bulk-delete
    const result = await prisma.session.deleteMany({
      where: {
        adminId,
        type,
      },
    });

    return res.status(200).json({
      code: 200,
      message: `Cleared ${result.count} session(s) of type "${type}"`,
      deletedCount: result.count,
    });
  } catch (error) {
    console.error("Error clearing sessions:", error);
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
 * /api/v1/sessions/add-relatives:
 *   post:
 *     summary: "Add relatives to session"
 *     tags: [Sessions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: "Array of registration IDs"
 *               type:
 *                 type: string
 *                 enum: [SESSION, RESERVE, RAPORT]
 *                 description: "Type of session"
 *               registrationId:
 *                 type: string
 *                 description: "Registration ID for context"
 *             required:
 *               - ids
 *               - type
 *               - registrationId
 *             example:
 *               ids: ["123e4567-e89b-12d3-a456-426614174000"]
 *               type: "SESSION"
 *               registrationId: "123e4567-e89b-12d3-a456-426614174000"
 *     responses:
 *       201:
 *         description: "Relatives added to session successfully"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 201
 *                 message:
 *                   type: string
 *                   example: "Relatives added to session successfully"
 *                 addedCount:
 *                   type: integer
 *                 sessions:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: "Invalid input"
 *       500:
 *         description: "Internal server error"
 */
exports.addRelatives = async (req, res) => {
  try {
    const { ids, type, registrationId, model } = req.body;
    const adminId = req.userId;

    // 1. Validate required fields
    if (!ids || !type || !registrationId) {
      return res.status(400).json({
        code: 400,
        message: "IDs array, type, and registrationId are required",
      });
    }

    // 2. Validate session type
    const validTypes = ["SESSION", "RESERVE", "RAPORT"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        code: 400,
        message: "Invalid session type",
      });
    }

    // 3. Validate ids is array
    if (!Array.isArray(ids)) {
      return res.status(400).json({
        code: 400,
        message: "IDs must be an array",
      });
    }

    let finalIds = [];

    // 4. Check if ids length is <= 0
    if (ids.length <= 0) {
      // Get registration by registrationId
      const registration = await prisma.registration.findUnique({
        where: { id: registrationId },
      });

      if (!registration) {
        return res.status(400).json({
          code: 400,
          message: "Registration not found",
        });
      }

      // Check registration model
      if (registration.model === "registration") {
        // Get all relatives for this registration
        const relatives = await prisma.relatives.findMany({
          where: {
            registrationId: registrationId,
            ...(model !== "" ? { model } : {}),
          },
        });
        finalIds.push(registrationId,...relatives.map((relative) => relative.id));
      } else if (registration.model === "registration4") {
        // Search registration model by regNumber and add all
        const registrations = await prisma.registration.findMany({
          where: { regNumber: registration.regNumber },
        });
        finalIds = registrations.map((reg) => reg.id);
      }
    } else {
      // Use provided ids - validate they exist in either Registration or Relatives tables
      const validIds = [];

      for (const id of ids) {
        // Check if ID exists in Registration table
        const registration = await prisma.registration.findUnique({
          where: { id },
        });

        if (registration) {
          validIds.push(id);
          continue;
        }

        // Check if ID exists in Relatives table
        const relative = await prisma.relatives.findUnique({
          where: { id },
        });

        if (relative) {
          validIds.push(id);
        }
      }

      // If no valid IDs found, return error
      if (validIds.length === 0) {
        return res.status(400).json({
          code: 400,
          message: "No valid registration or relative IDs found",
        });
      }

      finalIds = validIds;
    }

    // 5. If no IDs to process, return early
    if (finalIds.length === 0) {
      return res.status(200).json({
        code: 200,
        message: "No relatives found to add",
        addedCount: 0,
        sessions: [],
      });
    }
    

    // 6. Use transaction to add all relatives to session
    const result = await prisma.$transaction(async (tx) => {
      const sessionsToCreate = [];

      // Get the last session order for this admin and type
      const lastSession = await tx.session.findFirst({
        where: { adminId, type },
        orderBy: { order: "desc" },
      });
      let nextOrder = lastSession ? lastSession.order + 1 : 1;

      // Process each ID
      for (const id of finalIds) {
        // Try to find in Registration table first
        const registration = await tx.registration.findUnique({
          where: { id },
        });

        console.log(registration);
        

        if (registration) {
          // Check if session already exists for this registration
          const existingSession = await tx.session.findFirst({
            where: {
              registrationId: id,
              adminId,
              type,
            },
          });

          if (!existingSession) {
            let modelSession = "";
            if (registration.model === "relative"||registration.model === "relativeWithoutAnalysis") {
              modelSession = registration.relationDegree;
            } else {
              modelSession = registration.model;
            }
            sessionsToCreate.push({
              registrationId: id,
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
              model: modelSession,
              notes: registration.notes,
              additionalNotes: registration.additionalNotes,
              externalNotes: registration.externalNotes,
              adminId,
              type,
              order: nextOrder++,
            });
          }
          continue;
        }

        // If not found in Registration, try Relatives table
        const relative = await tx.relatives.findUnique({
          where: { id },
        });

        if (relative) {
          // Check if session already exists for this relative
          const existingSession = await tx.session.findFirst({
            where: {
              registrationId: id,
              adminId,
              type,
            },
          });

          if (!existingSession) {
            let modelSession = "";
            if (relative.model === "relative"||relative.model === "relativeWithoutAnalysis") {
              modelSession = relative.relationDegree;
            } else {
              modelSession = relative.model;
            }
            sessionsToCreate.push({
              registrationId: id,
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
              model: modelSession,
              notes: relative.notes,
              additionalNotes: relative.additionalNotes,
              externalNotes: relative.externalNotes,
              adminId,
              type,
              order: nextOrder++,
            });
          }
        }
      }

      // Create all sessions in batch
      const createdSessions = [];
      for (const sessionData of sessionsToCreate) {
        const newSession = await tx.session.create({
          data: sessionData,
        });
        createdSessions.push(newSession);
      }

      return createdSessions;
    });

    return res.status(201).json({
      code: 201,
      message: "Relatives added to session successfully",
      addedCount: result.length,
      sessions: result,
    });
  } catch (error) {
    console.error("Error adding relatives to session:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {

  }
};
