const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const uuid = require('uuid');
const { verifyToken, permissionCheck } = require("../middleware/auth");
const { runMigration } = require('../controllers/migration');
const { getEnv } = require('../../config/env');
const env = getEnv();

const isWindows = process.platform === 'win32';
const PROD_UPLOAD_FILE_SIZE_LIMIT = 500 * 1024 * 1024; // 500MB
const DEV_UPLOAD_FILE_SIZE_LIMIT = 2 * 1024 * 1024 * 1024; // 2GB
const uploadFileSizeLimit =
    env.NODE_ENV === 'production' ? PROD_UPLOAD_FILE_SIZE_LIMIT : DEV_UPLOAD_FILE_SIZE_LIMIT;

// Configure multer for Access file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let uploadDir;
        if (env.NODE_ENV === 'production') {
            if (isWindows) {
                uploadDir = path.join(env.PROGRAM_DATA, 'GSPApp', 'uploads', 'migrations');
            } else {
                uploadDir = env.UPLOAD_DIR;
            }
        } else {
            uploadDir = path.join(__dirname, '../../uploads/migrations');
        }
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
    limits: { fileSize: uploadFileSizeLimit }
});

// Dedicated upload middleware for NavMigration modal.
const uploadModal = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: uploadFileSizeLimit }
});

async function handleMigrationUpload(req, res) {
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
}

function handleUploadMiddleware(uploadMiddleware, req, res, next) {
    uploadMiddleware(req, res, (err) => {
        if (!err) {
            return next();
        }

        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            const maxSizeMb = Math.floor(uploadFileSizeLimit / (1024 * 1024));
            return res.status(413).json({
                code: 413,
                message: `File too large. Maximum allowed size is ${maxSizeMb}MB for NODE_ENV=${env.NODE_ENV}.`
            });
        }

        return res.status(400).json({
            code: 400,
            message: err.message || 'Upload failed'
        });
    });
}

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
router.post('/upload', verifyToken, permissionCheck("superAdmin"), (req, res, next) => {
    handleUploadMiddleware(upload.single('file'), req, res, next);
}, handleMigrationUpload);

/**
 * @swagger
 * /api/v1/migration/upload-modal:
 *   post:
 *     tags: [Migration]
 *     summary: Upload Access database from NavMigration modal and run migration
 *     description: Upload limit is 2GB in development and 500MB in production (from Backend .env NODE_ENV).
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
router.post('/upload-modal', verifyToken, permissionCheck("superAdmin"), (req, res, next) => {
    handleUploadMiddleware(uploadModal.single('file'), req, res, next);
}, handleMigrationUpload);

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

        if (isWindows) {
            // Windows: check PowerShell scripts + OleDb driver
            const schemaScript = path.join(__dirname, '../../scripts/_ps_schema.ps1');
            const streamScript = path.join(__dirname, '../../scripts/_ps_stream.ps1');
            const scriptsExist = fs.existsSync(schemaScript) && fs.existsSync(streamScript);

            const accessDriverAvailable = await new Promise((resolve) => {
                try {
                    const ps = spawn('powershell.exe', ['-Command',
                        'try { $conn = New-Object System.Data.OleDb.OleDbConnection; $true } catch { $false }'
                    ]);
                    ps.on('error', () => resolve(false));
                    ps.on('close', (code) => resolve(code === 0));
                } catch (e) {
                    resolve(false);
                }
            });

            return res.status(200).json({
                code: 200,
                data: {
                    platform: 'win32',
                    driver: 'powershell+oledb',
                    scriptsExist,
                    accessDriverAvailable,
                    ready: scriptsExist && accessDriverAvailable
                }
            });
        } else {
            // Linux/macOS: check mdb-tools availability
            const mdbToolsAvailable = await new Promise((resolve) => {
                try {
                    const proc = spawn('mdb-tables', ['--version']);
                    proc.on('error', () => resolve(false));
                    proc.on('close', () => resolve(true));
                } catch (e) {
                    resolve(false);
                }
            });

            return res.status(200).json({
                code: 200,
                data: {
                    platform: process.platform,
                    driver: 'mdb-tools',
                    mdbToolsAvailable,
                    ready: mdbToolsAvailable,
                    ...(!mdbToolsAvailable && { message: 'Install mdb-tools: sudo apt install mdbtools' })
                }
            });
        }
    } catch (err) {
        return res.status(500).json({
            code: 500,
            message: err.message
        });
    }
});

module.exports = router;
