const prisma = require('../../db/database');

/**
 * @swagger
 * /api/v1/logs/list:
 *   get:
 *     summary: "Get logs from the database"
 *     tags: [Logs]
 *     parameters:
 *       - in: query
 *         name: recordId
 *         schema:
 *           type: string
 *         required: false
 *         description: "Record ID to filter logs"
 *       - in: query
 *         name: tableName
 *         schema:
 *           type: string
 *         required: false
 *         description: "Table name to filter logs"
 *       - in: query
 *         name: pageNumber
 *         schema:
 *           type: integer
 *           default: 1
 *         required: false
 *         description: "Page number for pagination"
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 10
 *         required: false
 *         description: "Number of logs per page"
 *     responses:
 *       200:
 *         description: "Logs retrieved successfully"
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
 *                   example: "Logs retrieved successfully"
 *                 logs:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       recordId:
 *                         type: string
 *                       tableName:
 *                         type: string
 *                       fieldName:
 *                         type: string
 *                       oldValue:
 *                         type: string
 *                       newValue:
 *                         type: string
 *                       executorId:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       400:
 *         description: "Invalid input"
 *       500:
 *         description: "Internal server error"
 */
exports.getLogs = async (req, res) => {
  try {
    let { recordId, tableName, field, pageNumber = 1, pageSize = 10 } = req.query;
    pageNumber = parseInt(pageNumber, 10);
    pageSize = parseInt(pageSize, 10);


    if (isNaN(pageNumber) || isNaN(pageSize) || pageNumber < 1 || pageSize < 1) {
      return res.status(400).json({ message: "Invalid pagination parameters" });
    }

    let where = {};
    if (recordId) where.recordId = recordId;
    if (tableName) where.tableName = tableName;
    if (field) where.fieldName = field;

    const skip = (pageNumber - 1) * pageSize;
    const take = pageSize;

    const logs = await prisma.log.findMany({
      where,
      include: {
        executor: {
          select: {
            first_name: true,
            last_name: true,
            father_name: true,
          },
        },
      },
      skip,
      take,
      orderBy: {
        createdAt: 'desc',
      },
    });

    const totalCount = await prisma.log.count({
      where,
    });

    return res.status(200).json({
      code: 200,
      message: "Logs retrieved successfully",
      logs,
      totalCount,
    });
  } catch (error) {
    console.error("Error fetching logs:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {

  }
}; 
