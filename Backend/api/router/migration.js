const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const uuid = require('uuid');
const { verifyToken, permissionCheck } = require("../middleware/auth");
const { runMigration } = require('../controllers/migration');

// Configure multer for Access file uploads
// Use ProgramData directory (writable) instead of Program Files (read-only in production)
const programData = process.env.ProgramData || process.env.PROGRAMDATA || 'C:\\ProgramData';
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = process.env.NODE_ENV === 'production'
            ? path.join(programData, 'GSPApp', 'uploads', 'migrations')
            : path.join(__dirname, '../../uploads/migrations');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        cb(null, uuid.v1() + ext);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedExtensions = ['.accdb', '.mdb'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Only Access database files (.accdb, .mdb) are allowed'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB max
});

/**
 * @swagger
 * /api/v1/migration/upload:
 *   post:
 *     tags: [Migration]
 *     summary: Upload Access database and run migration
 *     description: Upload an Access (.accdb) file and migrate all data to PostgreSQL
 *     security:
 *       - apiKeyAuth: []
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
 *                 description: Access database file (.accdb or .mdb)
 *     responses:
 *       200:
 *         description: Migration completed successfully
 *       400:
 *         description: No file uploaded or invalid file type
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - superAdmin access required
 *       500:
 *         description: Migration failed
 */
router.post('/upload', verifyToken, permissionCheck("superAdmin"), upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                code: 400,
                message: 'Please upload an Access database file (.accdb or .mdb)'
            });
        }

        const accessFilePath = req.file.path;
        console.log(`Starting migration for file: ${accessFilePath}`);

        // Run migration
        const result = await runMigration(accessFilePath);

        // Clean up uploaded file after migration
        try {
            fs.unlinkSync(accessFilePath);
        } catch (cleanupErr) {
            console.warn(`Could not delete temp file: ${cleanupErr.message}`);
        }

        if (result.success) {
            return res.status(200).json({
                code: 200,
                message: result.message,
                data: { migratedFile: req.file.originalname }
            });
        } else {
            return res.status(500).json({
                code: 500,
                message: result.message
            });
        }
    } catch (err) {
        console.error('Migration error:', err);
        return res.status(500).json({
            code: 500,
            message: err.message || 'Migration failed'
        });
    }
});

/**
 * @swagger
 * /api/v1/migration/status:
 *   get:
 *     tags: [Migration]
 *     summary: Check migration prerequisites
 *     description: Check if all migration prerequisites are met
 *     security:
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Prerequisites status
 */
router.get('/status', verifyToken, permissionCheck("superAdmin"), async (req, res) => {
    try {
        const { spawn } = require('child_process');

        // Check if PowerShell scripts exist
        const schemaScript = path.join(__dirname, '../../scripts/_ps_schema.ps1');
        const streamScript = path.join(__dirname, '../../scripts/_ps_stream.ps1');

        const scriptsExist = fs.existsSync(schemaScript) && fs.existsSync(streamScript);

        // Check Access driver availability (quick test)
        let accessDriverAvailable = false;
        try {
            const ps = spawn('powershell.exe', ['-Command',
                'try { $conn = New-Object System.Data.OleDb.OleDbConnection; $true } catch { $false }'
            ]);
            accessDriverAvailable = true;
        } catch (e) {
            accessDriverAvailable = false;
        }

        return res.status(200).json({
            code: 200,
            data: {
                scriptsExist,
                accessDriverAvailable,
                ready: scriptsExist
            }
        });
    } catch (err) {
        return res.status(500).json({
            code: 500,
            message: err.message
        });
    }
});

module.exports = router;
