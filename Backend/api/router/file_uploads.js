const express = require('express');
const router = express.Router();
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const uuid = require('uuid');
const { verifyToken, permissionCheck } = require("../middleware/auth");
const { SERVER_URL } = require('../helpers/constants');

var storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads');
    },
    filename: function (req, file, cb) {
        cb(null, uuid.v1() + '.' + file.originalname.match(/\.(.+)$/)?.[1] || 'No extension');
    }
});

var upload = multer({ storage: storage });

/**
 * @swagger
 * /api/v1/upload:
 *   post:
 *     tags: [Upload]
 *     summary: Fayl yuklash
 *     description: Yangi faylni yuklash va saqlash
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Yuklanadigan fayl
 *     responses:
 *       201:
 *         description: Fayl muvaffaqiyatli yuklandi
 *       400:
 *         description: Fayl yuklanmadi
 *       500:
 *         description: Ichki server xatosi
 */
router.post('/', verifyToken, permissionCheck("admin"), upload.single('file'), async (req, res) => {
    try {
        // console.log(req);
        const file = req.file;
        // console.log(req.file);

        if (!file) {
            return res.status(400).json({ code: 400, message: 'Please upload a file' });
        }
        const savedFile = await prisma.upload.create({
            data: {
                file_link: `${SERVER_URL}/api/v1/download/${file.filename}`,
                uploadedBy: req.userId,
            }
        });

        res.status(201).json({ code: 201, data: savedFile, link: savedFile.file_link});
    } catch (err) {
        if (!err.httpStatusCode) {
            err.httpStatusCode = 500;
        }
        return res.status(err.httpStatusCode).json({ code: err.httpStatusCode, message: err.message, err: err });
    }
});

/**
 * @swagger
 * /api/v1/upload/list:
 *   get:
 *     tags: [Upload]
 *     summary: Yuklangan fayllar ro'yxati
 *     description: Barcha yuklangan fayllarni olish
 *     parameters:
 *       - in: query
 *         name: pageNumber
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Sahifa raqami
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Har bir sahifadagi elementlar soni
 *     responses:
 *       200:
 *         description: Fayllar muvaffaqiyatli olindi
 *       500:
 *         description: Ichki server xatosi
 */
router.get('/list',verifyToken, permissionCheck("admin"), async (req, res) => {
    try {
        const pageNumber = parseInt(req.query.pageNumber) || 1;
        const pageSize = parseInt(req.query.pageSize) || 20;
        const skip = (pageNumber - 1) * pageSize;

        const files = await prisma.upload.findMany({
            skip: skip,
            take: pageSize,
        });

        if (files.length === 0) {
            return res.status(400).json({ code: 400, message: 'Nothing appeared' });
        }

        return res.status(200).json({ code: 200, data: files });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ code: 500, message: 'Internal Server Error', err: err });
    }
});

module.exports = router;
