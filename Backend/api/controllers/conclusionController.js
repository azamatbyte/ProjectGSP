const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const fsp = fs.promises;
const DATA_FILE = path.resolve(__dirname, "../temp/conclusions.json");

async function ensureDataFile() {
    try {
        await fsp.access(DATA_FILE);
    } catch (_) {
        await fsp.mkdir(path.dirname(DATA_FILE), { recursive: true });
        await fsp.writeFile(DATA_FILE, "[]", "utf-8");
    }
}


async function readConclusions() {
    await ensureDataFile();
    const raw = await fsp.readFile(DATA_FILE, "utf-8");
    try {
        const data = JSON.parse(raw);
        return Array.isArray(data) ? data : [];
    } catch (_) {
        return [];
    }
}

async function writeConclusions(data) {
    await fsp.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}


/**
 * @swagger
 * /api/v1/conclusion/create:
 *   post:
 *     summary: Create a conclusion record
 *     tags: [Conclusion]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               title:
 *                 type: string
 *               to_who:
 *                 type: string
 *               to_position:
 *                 type: string
 *               tittle_center:
 *                 type: string
 *               executor:
 *                 type: string
 *               boss:
 *                 type: string
 *           example:
 *             name: "Conclusion A"
 *             title: "Internal memo"
 *             to_who: "Head of Dept."
 *             to_position: "звание"
 *             tittle_center: "CENTER"
 *             executor: "John Doe"
 *             boss: "Jane Smith"
 *     responses:
 *       201:
 *         description: Created successfully
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Internal server error
 */
exports.createConclusion = async (req, res) => {
    try {
        const { name, title,to_organization, to_who, to_position, tittle_center, executor, boss, first_input, second_input } = req.body || {};
        if (!name) {
            return res.status(400).json({ message: "name is required" });
        }
        const now = new Date().toISOString();
        const item = {
            id: uuidv4(),
            name: name ?? null,
            title: title ?? null,
            to_organization: to_organization ?? null,
            to_who: to_who ?? null,
            to_position: to_position ?? null,
            tittle_center: tittle_center ?? null,
            executor: executor ?? null,
            boss: boss ?? null,
            first_input: first_input ?? "",
            second_input: second_input ?? "",
            createdAt: now,
            updatedAt: now,
        };
        const data = await readConclusions();
        data.push(item);
        await writeConclusions(data);
        return res.status(201).json({ message: "Created", data: item });
    } catch (error) {
        console.error("createConclusion error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * @swagger
 * /api/v1/conclusion/list:
 *   get:
 *     summary: List all conclusions
 *     tags: [Conclusion]
 *     parameters:
 *       - in: query
 *         name: pageNumber
 *         schema:
 *           type: integer
 *         required: false
 *         description: Page number for pagination
 *         default: 1
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *         required: false
 *         description: Number of items per page
 *         default: 10
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         required: false
 *         description: Filter by name (contains)
 *     responses:
 *       200:
 *         description: List retrieved successfully
 *       500:
 *         description: Internal server error
 */
exports.listConclusions = async (req, res) => {
    try {
        let { pageNumber = 1, pageSize = 10, name } = req.query || {};
        pageNumber = parseInt(pageNumber) || 1;
        pageSize = parseInt(pageSize) || 10;

        const data = await readConclusions();
        let filtered = data;
        if (name) {
            const q = String(name).toLowerCase();
            filtered = data.filter((x) => (x.name || "").toLowerCase().includes(q));
        }

        const total = filtered.length;
        const total_pages = Math.max(1, Math.ceil(total / pageSize));
        const start = (pageNumber - 1) * pageSize;
        const conclusions = filtered.slice(start, start + pageSize);

        return res.status(200).json({ total_pages, total_conclusions: total, conclusions });
    } catch (error) {
        console.error("listConclusions error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * @swagger
 * /api/v1/conclusion/get/{id}:
 *   get:
 *     summary: Get conclusion by ID
 *     tags: [Conclusion]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Conclusion ID
 *     responses:
 *       200:
 *         description: Conclusion found
 *       404:
 *         description: Not found
 *       500:
 *         description: Internal server error
 */
exports.getConclusionById = async (req, res) => {
    try {
        const { id } = req.params || {};
        if (!id) return res.status(400).json({ message: "id is required" });
        const data = await readConclusions();
        const found = data.find((x) => x.id === id);
        if (!found) return res.status(404).json({ message: "Conclusion not found" });
        return res.status(200).json(found);
    } catch (error) {
        console.error("getConclusionById error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * @swagger
 * /api/v1/conclusion/update:
 *   post:
 *     summary: Update a conclusion
 *     tags: [Conclusion]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               name:
 *                 type: string
 *               title:
 *                 type: string
 *               to_who:
 *                 type: string
 *               to_position:
 *                 type: string
 *               tittle_center:
 *                 type: string
 *               executor:
 *                 type: string
 *               boss:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: Not found
 *       500:
 *         description: Internal server error
 */
exports.updateConclusion = async (req, res) => {
    try {
        const { id, name, title, to_organization, to_who, to_position, tittle_center, executor, boss, first_input, second_input } = req.body || {};
        if (!id) return res.status(400).json({ message: "id is required" });

        const data = await readConclusions();
        const idx = data.findIndex((x) => x.id === id);
        if (idx === -1) return res.status(404).json({ message: "Conclusion not found" });

        const updated = {
            ...data[idx],
            name: name ?? data[idx].name,
            title: title ?? data[idx].title,
            to_organization: to_organization ?? data[idx].to_organization,
            to_who: to_who ?? data[idx].to_who,
            to_position: to_position ?? data[idx].to_position,
            tittle_center: tittle_center ?? data[idx].tittle_center,
            executor: executor ?? data[idx].executor,
            boss: boss ?? data[idx].boss,
            first_input: first_input ?? data[idx].first_input,
            second_input: second_input ?? data[idx].second_input,
            updatedAt: new Date().toISOString(),
        };
        data[idx] = updated;
        await writeConclusions(data);
        return res.status(200).json({ message: "Updated", data: updated });
    } catch (error) {
        console.error("updateConclusion error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * @swagger
 * /api/v1/conclusion/genreate_conclusion:
 *   post:
 *     summary: Generate a conclusion document (placeholder)
 *     tags: [Conclusion]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Will be detailed later
 *     responses:
 *       200:
 *         description: Endpoint stub is active
 *       500:
 *         description: Internal server error
 */
// Placeholder for future implementation. Will be detailed later.
exports.genreate_conclusion = async (_req, res) => {
    try {
        return res.status(200).json({ message: "genreate_conclusion is pending implementation" });
    } catch (error) {
        return res.status(500).json({ message: "Internal server error" });
    }
};


exports.ensureDataFile = ensureDataFile;
exports.readConclusions = readConclusions;
exports.writeConclusions = writeConclusions;
