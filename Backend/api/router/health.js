const express = require("express");
const router = express.Router();
const prisma = require("../../db/database");

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check – backend & database status
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Status of backend and database
 */
router.get("/", async (req, res) => {
    let dbConnected = false;
    try {
        await prisma.$queryRawUnsafe("SELECT 1");
        dbConnected = true;
    } catch (err) {
        dbConnected = false;
    }

    res.json({
        backend: true,
        database: dbConnected,
    });
});

module.exports = router;
