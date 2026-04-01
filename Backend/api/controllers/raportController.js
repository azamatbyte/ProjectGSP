const { PrismaClient, Prisma } = require("@prisma/client");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  UnderlineType,
  VerticalAlign,
  ShadingType,
} = require("docx");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { RaportTypeSchema } = require("../helpers/validator");
const { readConclusions } = require("./conclusionController");
const { MODEL_TYPE, SERVER_URL, MODEL_STATUS, ACCESS_STATUS } = require("../helpers/constants");
const {
  buildQuerySignedListBlocks: buildQuerySignedListBlocksHelper,
  formatQuerySignerDisplayName: formatSignerDisplayName,
  getQueryApprovalLabelMode,
  splitQuerySigners,
} = require("../helpers/querySignerLayout");
const safeString = require("../helpers/safeString");
const { checkRegistrationNumber } = require("./registerController");
const role = require("../middleware/role");

// Initialize Prisma Client
const prisma = require('../../db/database');

const createPageBreakSection = () => ({
  properties: {},
  children: [new Paragraph({ children: [new TextRun({ break: 2 })] })],
});

const RAPORT_TYPE_SELECT = Prisma.sql`
  rt."id",
  rt."name",
  rt."code",
  rt."code_ru",
  rt."code_uz",
  rt."organization",
  rt."requested_organization",
  COALESCE(rt."data"->>'rank', '') AS "rank",
  rt."signed_fio",
  rt."signed_position",
  rt."link",
  rt."notes",
  rt."executorId",
  rt."data",
  rt."createdAt",
  rt."updatedAt"
`;

const RAPORT_TYPE_SELECT_WITH_EXECUTOR = Prisma.sql`
  ${RAPORT_TYPE_SELECT},
  CASE
    WHEN e."id" IS NULL THEN NULL
    ELSE json_build_object(
      'id', e."id",
      'first_name', e."first_name",
      'last_name', e."last_name",
      'father_name', e."father_name"
    )
  END AS executor
`;

const queryRaportTypesRaw = async ({
  where = Prisma.sql`TRUE`,
  includeExecutor = false,
  limit,
  offset,
  orderByCreatedAtDesc = false,
}) => {
  const selectSql = includeExecutor
    ? RAPORT_TYPE_SELECT_WITH_EXECUTOR
    : RAPORT_TYPE_SELECT;
  const joinSql = includeExecutor
    ? Prisma.sql`LEFT JOIN "Admin" e ON e."id" = rt."executorId"`
    : Prisma.empty;
  const orderSql = orderByCreatedAtDesc
    ? Prisma.sql`ORDER BY rt."createdAt" DESC`
    : Prisma.empty;
  const limitSql = typeof limit === "number" ? Prisma.sql`LIMIT ${limit}` : Prisma.empty;
  const offsetSql = typeof offset === "number" ? Prisma.sql`OFFSET ${offset}` : Prisma.empty;

  return prisma.$queryRaw(Prisma.sql`
    SELECT ${selectSql}
    FROM "RaportTypes" rt
    ${joinSql}
    WHERE ${where}
    ${orderSql}
    ${limitSql}
    ${offsetSql}
  `);
};

const countRaportTypesRaw = async (where = Prisma.sql`TRUE`) => {
  const result = await prisma.$queryRaw(Prisma.sql`
    SELECT COUNT(*)::int AS count
    FROM "RaportTypes" rt
    WHERE ${where}
  `);

  return result?.[0]?.count || 0;
};

const getRaportTypeByIdRaw = async (id) => {
  const rows = await queryRaportTypesRaw({
    where: Prisma.sql`rt."id" = ${id}`,
    limit: 1,
  });

  return rows?.[0] || null;
};

const getRaportTypesByLinksRaw = async (links = []) => {
  if (!links.length) {
    return [];
  }

  return queryRaportTypesRaw({
    where: Prisma.sql`(${Prisma.join(
      links.map((link) => Prisma.sql`rt."link" ILIKE ${`%${link}%`}`),
      Prisma.sql` OR `
    )})`,
  });
};

const buildCombinedDocument = (documents, { addPageBreakBetween = false } = {}) => {
  const validDocuments = documents.filter(
    (doc) => Array.isArray(doc?.sections) && doc.sections.length > 0
  );

  if (!validDocuments.length) {
    return null;
  }

  const sections = [];
  validDocuments.forEach((doc, index) => {
    sections.push(...doc.sections);
    if (addPageBreakBetween && index < validDocuments.length - 1) {
      sections.push(createPageBreakSection());
    }
  });

  return new Document({ sections });
};

const getPsychoRaportTypes = (raportTypes, name) => {
  const allRaportTypes = Array.isArray(raportTypes) ? raportTypes : [];
  const type3RaportTypes = allRaportTypes.filter((item) =>
    String(item?.link || "").includes("type3")
  );
  const type2RaportTypes = allRaportTypes.filter((item) =>
    String(item?.link || "").includes("type2")
  );

  const fallbackByLink = type3RaportTypes.length
    ? type3RaportTypes
    : type2RaportTypes.length
      ? type2RaportTypes
      : allRaportTypes;

  const preferredCodesByType = {
    type6: ["nd", "nd1"],
    type7: ["nd", "nd2"],
  };
  const preferredCodes = preferredCodesByType[name];
  if (!preferredCodes?.length) {
    return fallbackByLink;
  }

  const selectedByCode = fallbackByLink.filter((item) =>
    preferredCodes.includes(String(item?.code || "").toLowerCase())
  );

  return selectedByCode.length ? selectedByCode : fallbackByLink;
};

const selectRaportTypesByCodeOrFallback = async ({
  code,
  name,
  fallbackLinks = ["type2", "type1"],
}) => {
  const normalizedCode = String(code || "").trim();
  const normalizedName = String(name || "").trim();
  let raportTypes = [];

  if (normalizedCode) {
    raportTypes = await queryRaportTypesRaw({
      where: Prisma.sql`rt."code" ILIKE ${`%${normalizedCode}%`}`,
    });
  }

  if (!raportTypes.length && normalizedName) {
    raportTypes = await queryRaportTypesRaw({
      where: Prisma.sql`(
        rt."link" ILIKE ${`%${normalizedName}%`}
        OR rt."name" ILIKE ${`%${normalizedName}%`}
        OR rt."code" ILIKE ${`%${normalizedName}%`}
      )`,
    });
  }

  if (!raportTypes.length) {
    for (const link of fallbackLinks) {
      raportTypes = await queryRaportTypesRaw({
        where: Prisma.sql`rt."link" ILIKE ${`%${link}%`}`,
      });
      if (raportTypes.length) {
        break;
      }
    }
  }

  if (!raportTypes.length) {
    raportTypes = await queryRaportTypesRaw({});
  }

  return raportTypes;
};

const formatQueryPersonDisplayName = (item) => {
  const lastName = item?.last_name || item?.lastName || "";
  const firstName = item?.first_name || item?.firstName || "";
  const fatherName = item?.father_name || item?.fatherName || "";

  return `${lastName}${firstName ? ` ${firstName.slice(0, 1)}.` : ""}${fatherName ? `${fatherName.slice(0, 1)}.` : ""}`.trim();
};

const buildQuerySignerHeadData = (signer, currentMonthRu, year) => {
  const headLines = [signer?.position, signer?.workplace]
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  return {
    data: headLines.join(", "),
    rank: String(signer?.rank || "").trim(),
    data1: formatSignerDisplayName(signer),
    time: `«____» ${currentMonthRu} ${year} года`,
  };
};

const buildQueryRecipientData = (signer, raportType) => {
  const signerName = formatSignerDisplayName(signer);
  const fallbackName = [raportType?.rank, raportType?.signed_fio]
    .filter(Boolean)
    .join(" ")
    .trim();
  const signerNameWithRank = [signer?.rank, signerName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    approverTitle:
      String(signer?.workplace || "").trim()
      || raportType?.requested_organization
      || "РУКОВОДИТЕЛЬ",
    position:
      String(signer?.position || "").trim()
      || raportType?.signed_position
      || "звание",
    fullName: signerNameWithRank || fallbackName || "Ф.И.О.",
  };
};

const buildQuerySignedListBlocks = (
  signList = [],
  dateText = "«____» __________ 20__ года",
  { approvalLabelMode = "first" } = {}
) =>
  (Array.isArray(signList) ? signList : [])
    .filter(Boolean)
    .map((item, idx, arr) => {
      const shouldAddApprovalLabel =
        approvalLabelMode === "none"
          ? false
          : approvalLabelMode === "afterFirst"
            ? idx >= 1
          : approvalLabelMode === "all"
          ? true
          : approvalLabelMode === "first"
            ? idx === 0
            : idx === arr.length - 1;
      const lines = [
        shouldAddApprovalLabel ? "«СОГЛАСОВАНО»" : "",
        String(item?.position || "").trim(),
        String(item?.workplace || "").trim(),
        [String(item?.rank || "").trim(), formatSignerDisplayName(item)]
          .filter(Boolean)
          .join("     ")
          .trim(),
        dateText,
      ].filter(Boolean);

      return lines.join("\n");
    });

const buildQuerySignerLinesLegacy = (signList, currentMonthRu, year) =>
  signList.map((item, idx) => {
    const nameLine = formatSignerDisplayName(item);
    const positionLine = item?.position ? item.position : "";
    const workPlaceLine = item?.workplace ? item.workplace : "";
    const rankLine = item?.rank ? item.rank : "";

    if (idx === signList.length - 1) {
      return `«СОГЛАСОВАНО»\n${positionLine}\n${workPlaceLine}\n${rankLine}     ${nameLine}\n«____» ${currentMonthRu} ${year} года`;
    }

    return `${positionLine}\n${workPlaceLine}\n${rankLine}     ${nameLine}\n«____» ${currentMonthRu} ${year} года\n`;
  });

const buildQuerySignerLines = (
  signList,
  currentMonthRu,
  year,
  { approvalLabelMode = "last" } = {}
) =>
  signList.map((item, idx) => {
    const nameLine = formatSignerDisplayName(item);
    const positionLine = item?.position ? item.position : "";
    const workPlaceLine = item?.workplace ? item.workplace : "";
    const rankLine = item?.rank ? item.rank : "";
    const shouldAddApprovalLabel =
      approvalLabelMode === "afterFirst"
        ? idx >= 1
        : approvalLabelMode === "all"
        ? true
        : approvalLabelMode === "first"
          ? idx === 0
          : idx === signList.length - 1;
    const approvalLabel = shouldAddApprovalLabel ? "«СОГЛАСОВАНО»\n" : "";

    return `${approvalLabel}${positionLine}\n${workPlaceLine}\n${rankLine}     ${nameLine}\n«____» ${currentMonthRu} ${year} года`;
  });

const buildQueryPersonPayload = async (data) => {
  const fullName = data?.fullName
    || `${data?.lastName ? data.lastName : ""} ${data?.firstName ? data.firstName : ""} ${data?.fatherName ? data.fatherName : ""}`.trim();

  const dob = data?.birthDate
    ? data.birthDate instanceof Date
      ? String(data.birthDate.getFullYear())
      : String(data.birthDate)
    : data?.birthYear
      ? String(data.birthYear)
      : "";

  if (data?.model !== MODEL_TYPE.REGISTRATION_FOUR) {
    return [{
      fullName,
      roleLabel: data?.position || "",
      dob,
      birthplace: data?.birthPlace || "",
      noteLabel: data?.notes || "",
      residence: data?.residence || "",
      workplace: data?.workplace || "",
    }];
  }

  const relatives = await prisma.relatives.findMany({
    where: {
      registrationId: data.id,
      AND: [
        { notes: { not: null } },
        { notes: { not: "" } },
      ],
    },
    select: {
      relationDegree: true,
      fullName: true,
      notes: true,
      birthDate: true,
      birthYear: true,
      birthPlace: true,
    },
  });

  const relativeNotes = (relatives || []).map((relative) =>
    `${relative.relationDegree} - ${relative.fullName}, ${relative.birthDate
      ? relative.birthDate.toLocaleDateString("ru-RU")
      : (relative.birthYear || "")
    }, уроженец ${relative.birthPlace || ""}, ${relative.notes || ""}`
  );

  return [{
    fullName,
    roleLabel: data?.position || "",
    dob,
    birthplace: data?.birthPlace || "",
    noteLabel: [data?.notes || "", relativeNotes.join("; ")].filter(Boolean).join(", "),
    residence: data?.residence || "",
    workplace: data?.workplace || "",
  }];
};

const formatQueryBirthDate = (birthDate, birthYear) => {
  if (birthDate instanceof Date && !Number.isNaN(birthDate.getTime())) {
    return birthDate.toLocaleDateString("ru-RU");
  }

  if (typeof birthDate === "string" && birthDate.trim()) {
    const parsed = new Date(birthDate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString("ru-RU");
    }

    return birthDate.trim();
  }

  if (birthYear !== undefined && birthYear !== null && `${birthYear}`.trim()) {
    return `${birthYear}`.trim();
  }

  return "";
};

const buildMalumotnomaQueryDoc = async ({
  data,
  reqUserId,
  headerSigner,
  agreedSigners,
  signList,
  raportType,
  name,
}) => {
  const getExecutor = await prisma.admin.findUnique({
    where: { id: reqUserId },
  });

  const getExecutorName = getExecutor
    ? `${getExecutor?.last_name ? getExecutor.last_name : ""} ${getExecutor?.first_name ? getExecutor.first_name.slice(0, 1) + "." : ""}${getExecutor?.father_name ? getExecutor.father_name.slice(0, 1) + "." : ""}`
    : "";

  const getAdmin = await prisma.admin.findUnique({
    where: { id: reqUserId },
    select: { first_name: true, last_name: true },
  });

  const currentMonthRu = new Date().toLocaleString("ru-RU", {
    month: "long",
  });
  const year = new Date().getFullYear();
  const approvalLabelMode = getQueryApprovalLabelMode(signList);

  const signedListDateText = `«____» ${currentMonthRu} ${year} года`;
  const agreedLabel = buildQuerySignedListBlocksHelper(agreedSigners, signedListDateText, {
    approvalLabelMode,
  });
  const headSignerData = buildQuerySignerHeadData(
    headerSigner,
    currentMonthRu,
    year
  );
  const recipientData = buildQueryRecipientData(headerSigner, raportType);
  const persons = await buildQueryPersonPayload(data);
  const generator = name === "type9"
    ? generateQueryDocxSgbDedicated
    : generateQueryDocxGsbpDedicated;
  const queryRecipientPosition = raportType?.signed_position || "звание";
  const queryRecipientFullName = [raportType?.rank, raportType?.signed_fio]
    .filter(Boolean)
    .join(" ") || "Ф.И.О.";
  const queryEditableTextNotes =
    raportType?.notes ||
    "бу ерда узгартириш имкони булган маълумотлар киритилади";
  const queryEditableText =
    raportType?.data?.editableWord ||
    "бу ерда узгартириш имкони булган маълумотлар киритилади";

  return generator("запрос.docx", {
    leftHeader: `${getAdmin?.first_name?.slice(0, 1)?.toLowerCase() || ""}${getAdmin?.last_name?.slice(0, 1)?.toLowerCase() || ""}-1`,
    rightHeader: "Секретно \n Экз.№_",
    approverTitle: raportType?.requested_organization || "РУКОВОДИТЕЛЬ",
    position: queryRecipientPosition,
    sign: "подпись",
    fio: queryRecipientFullName,
    operatorName: "А.Ахмадов",
    chiefName: "А.Ахмадов",
    monthLabel: "«25» июля",
    year,
    person: persons,
    agreedLabel,
    underline: false,
    operator: {
      data: `${getExecutor?.workplace ?? "Оператор подразделения"}`,
      rank: `${getExecutor?.rank ?? "Должность"}`,
      data1: `${getExecutorName}`,
      time: `«____» ${currentMonthRu} ${year} года`,
    },
    head: headSignerData,
    approverTitle: recipientData.approverTitle,
    position: recipientData.position,
    fio: recipientData.fullName,
    recordNumbers: data?.regNumber || data?.recordNumber || "",
    recordNumber: data?.regNumber || data?.recordNumber || "",
    queryExecutorName: getExecutorName || "Ф.И.О.",
    queryInitiatorName: formatQueryPersonDisplayName(data?.Initiator) || "Ф.И.О.",
    querySubjectBirthDate: formatQueryBirthDate(data?.birthDate, data?.birthYear),
    queryRecipientRank: recipientData.position,
    queryRecipientName: recipientData.fullName,
    querySourceText: persons?.[0]?.noteLabel || "",
    queryEditableIntroText: queryEditableTextNotes,
    queryEditableRequirementsText: queryEditableText,
  });
};

const loadQueryRaportSourceData = async (id) => {
  let data = await prisma.registration.findUnique({
    where: { id },
    include: {
      Initiator: {
        select: {
          first_name: true,
          last_name: true,
          father_name: true,
        },
      },
      executor: {
        select: {
          first_name: true,
          last_name: true,
          father_name: true,
          phone: true,
        },
      },
    },
  });

  if (!data) {
    data = await prisma.relatives.findUnique({
      where: { id },
      include: {
        Initiator: {
          select: {
            first_name: true,
            last_name: true,
            father_name: true,
          },
        },
        executor: {
          select: {
            first_name: true,
            last_name: true,
            father_name: true,
            phone: true,
          },
        },
      },
    });
  }

  return data;
};

const generateDedicatedQueryRaportSGB = async (req, res, fixedName) => {
  try {
    const { id, signListIds } = req.body;

    if (!signListIds || signListIds.length === 0) {
      return res
        .status(404)
        .json({ code: 404, message: "signListIds not found" });
    }

    const signList = (
      await Promise.all(
        signListIds.map((signListId) =>
          prisma.signList.findUnique({ where: { id: signListId } })
        )
      )
    ).filter(Boolean);

    if (!signList.length) {
      return res.status(404).json({ code: 404, message: "signList not found" });
    }
    const { headerSigner, agreedSigners } = splitQuerySigners(signList);

    const data = await loadQueryRaportSourceData(id);

    if (!data) {
      return res.status(404).json({ code: 404, message: "data not found" });
    }

    const raportTypes = await selectRaportTypesByCodeOrFallback({
      code: fixedName,
      name: fixedName,
    });

    if (!raportTypes?.length) {
      return res
        .status(404)
        .json({ code: 404, message: "raport type not found" });
    }

    const queryDoc = await buildMalumotnomaQueryDoc({
      data,
      reqUserId: req.userId,
      headerSigner,
      agreedSigners,
      signList,
      raportType: raportTypes[0],
      name: fixedName,
    });

    const combinedDoc = new Document({
      sections: [...queryDoc.sections],
    });

    const buffer = await Packer.toBuffer(combinedDoc);
    const randomFileName = `${uuidv4()}.docx`;
    const filePath = path.join(__dirname, "../../uploads", randomFileName);

    const raport = await prisma.raport.create({
      data: {
        name: fixedName,
        executorId: req.userId,
        link: SERVER_URL + "/api/v1/download/" + randomFileName,
        notes: "",
      },
    });

    await prisma.raportLink.create({
      data: {
        code: "ЗАПРОС СГБ",
        raport: { connect: { id: raport.id } },
        registrations: { connect: { id } },
      },
    });

    fs.writeFileSync(filePath, buffer);

    return res.status(200).json({
      code: 200,
      message: "Document generated and saved successfully",
      link: SERVER_URL + "/api/v1/download/" + randomFileName,
    });
  } catch (error) {
    console.log(error);
    console.error("Error generating report:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const generateDedicatedQueryRaportGSBP = async (req, res, fixedName) => {
  try {
    const { id, signListIds } = req.body;

    if (!signListIds || signListIds.length === 0) {
      return res
        .status(404)
        .json({ code: 404, message: "signListIds not found" });
    }

    const signList = (
      await Promise.all(
        signListIds.map((signListId) =>
          prisma.signList.findUnique({ where: { id: signListId } })
        )
      )
    ).filter(Boolean);

    if (!signList.length) {
      return res.status(404).json({ code: 404, message: "signList not found" });
    }
    const { headerSigner, agreedSigners } = splitQuerySigners(signList);

    const data = await loadQueryRaportSourceData(id);

    if (!data) {
      return res.status(404).json({ code: 404, message: "data not found" });
    }

    const raportTypes = await selectRaportTypesByCodeOrFallback({
      code: fixedName,
      name: fixedName,
    });

    if (!raportTypes?.length) {
      return res
        .status(404)
        .json({ code: 404, message: "raport type not found" });
    }

    const queryDoc = await buildMalumotnomaQueryDoc({
      data,
      reqUserId: req.userId,
      headerSigner,
      agreedSigners,
      signList,
      raportType: raportTypes[0],
      name: fixedName,
    });

    const combinedDoc = new Document({
      sections: [...queryDoc.sections],
    });

    const buffer = await Packer.toBuffer(combinedDoc);
    const randomFileName = `${uuidv4()}.docx`;
    const filePath = path.join(__dirname, "../../uploads", randomFileName);

    const raport = await prisma.raport.create({
      data: {
        name: fixedName,
        executorId: req.userId,
        link: SERVER_URL + "/api/v1/download/" + randomFileName,
        notes: "",
      },
    });

    await prisma.raportLink.create({
      data: {
        code: "ЗАПРОС ГСБП",
        raport: { connect: { id: raport.id } },
        registrations: { connect: { id } },
      },
    });

    fs.writeFileSync(filePath, buffer);

    return res.status(200).json({
      code: 200,
      message: "Document generated and saved successfully",
      link: SERVER_URL + "/api/v1/download/" + randomFileName,
    });
  } catch (error) {
    console.log(error);
    console.error("Error generating report:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * @swagger
 * /api/v1/raport/create:
 *   post:
 *     summary: "IDlar massivi asosida hujjat yaratish"
 *     tags: [Report]
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
 *             example:
 *               ids: ["id1", "id2", "id3"]
 *               name: "test"
 *     responses:
 *       200:
 *         description: "Hujjat muvaffaqiyatli yaratildi va saqlandi"
 *       400:
 *         description: "Xato: IDlar talab qilinadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.generateReport = async (req, res) => {
  try {
    const { name = "Заключение", type, signListIds } = req.body;
    const executorId = req.userId;
    let { ids = [] } = req.body;

    // 2. Validate session type
    const validTypes = ["SESSION", "RESERVE", "RAPORT"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        code: 400,
        message: "Invalid session type",
      });
    }

    const getExecutor = await prisma.admin.findUnique({
      where: { id: executorId },
    });

    const getExecutorName = getExecutor
      ? `${getExecutor?.last_name ? getExecutor?.last_name : ""} ${getExecutor?.first_name ? getExecutor?.first_name.slice(0, 1) + "." : ""}${getExecutor?.father_name ? getExecutor?.father_name.slice(0, 1) + "." : ""}`
      : "";

    const conclusionCheck = await readConclusions();
    const conclusion = conclusionCheck.find((x) => x.name === "Conclusion");

    if (!conclusion)
      return res.status(404).json({ message: "Conclusion not found" });

    if (!ids || ids.length <= 0) {
      const sessionData = await prisma.session.findMany({
        where: { type, adminId: executorId },
        orderBy: { order: "asc" },
      });
      if (!sessionData.length) {
        return res.status(404).json({ code: 404, message: "No data found" });
      }
      ids = sessionData.map((data, index) => ({
        id: data.registrationId,
        key: index,
      }));
    } else {
      ids = ids.map((id, index) => ({
        id,
        key: index,
      }));
    }

    if (signListIds?.length === 0) {
      return res
        .status(404)
        .json({ code: 404, message: "signListIds not found" });
    }

    // Fetch signers in the order of signListIds
    const signList = await Promise.all(
      signListIds.map(
        async (id) => await prisma.signList.findUnique({ where: { id } })
      )
    );

    if (!signList) {
      return res.status(404).json({ code: 404, message: "signList not found" });
    }

    const currentMonthRu = new Date().toLocaleString("ru-RU", {
      month: "long",
    });
    const year = new Date().getFullYear();

    const signListFormatted = signList.map(
      (item) =>
        `${item?.lastName ? item?.lastName : ""} ${item?.firstName ? item?.firstName.slice(0, 1) + "." : ""}${item?.fatherName ? item?.fatherName.slice(0, 1) + "." : ""}`
    );

    const executorList = signList.map((item, idx) => {
      const nameLine =
        (item?.lastName ? item?.lastName : "") +
        " " +
        (item?.firstName ? item?.firstName.slice(0, 1) + "." : "") +
        "" +
        (item?.fatherName ? item?.fatherName.slice(0, 1) + "." : "");
      const positionLine = item?.position ? item?.position : "";
      const workPlaceLine = item?.workplace ? item?.workplace : "";
      const rank = item?.rank ? item?.rank : "";
      if (idx === signList.length - 1) {
        // last signer: no «СОГЛАСОВАНО» prefix
        return `«СОГЛАСОВАНО»\n${positionLine}\n${workPlaceLine}\n${rank}     ${nameLine}\n«____» ${currentMonthRu} ${year} года`;
      }
      return `${positionLine}\n${workPlaceLine}\n${rank}     ${nameLine}\n«____» ${currentMonthRu} ${year} года\n`;
    });

    // Fetch data from database based on IDs
    let data_registration = [];
    let order_index = 0;
    try {
      const registrations = await Promise.all(
        ids.map(async (item) => {
          const registrationCheck = await prisma.registration.findFirst({
            where: { id: item.id },
          });

          if (!registrationCheck) {
            return null;
          }

          order_index++;

          return {
            id: registrationCheck.id,
            key: order_index,
            firstName: registrationCheck.firstName || "",
            lastName: registrationCheck.lastName || "",
            fatherName: registrationCheck.fatherName || "",
            fullName: registrationCheck.fullName || "",
            birthDate: registrationCheck.birthDate
              ? registrationCheck.birthDate.getFullYear()
              : registrationCheck.birthYear || "",
            model: registrationCheck.model || "",
            birthPlace: registrationCheck.birthPlace || "",
            workplace: registrationCheck.workplace || "",
            regNumber: registrationCheck.regNumber || "",
            residence: registrationCheck.residence || "",
            recordNumber: registrationCheck.recordNumber || "",
          };
        })
      );

      // Filter out null values and assign to data array
      data_registration = registrations.filter((reg) => reg !== null);
    } catch (error) {
      console.error("Error fetching registrations:", error);
      return res.status(500).json({
        code: 500,
        message: "Internal server error",
        error: error.message,
      });
    }
    order_index = 0;
    try {
      // const relatives = await Promise.all(
      //   data_registration.map(async (registartion) => {
      //     for (let index = 0; index < ids.length; index++) {
      //       const element = ids[index];
      //       const relativesCheck = await prisma.relatives.findFirst({
      //         where: { id: registartion.id, registrationId: registartion.id },
      //       });
      //       if (!relativesCheck) {
      //         return null;
      //       }
      //     }
      //   })
      // );
      // console.log("relatives", relatives);
      // console.log("data_registration1", data_registration);
      // // Filter out null values and assign to data array
      // data_registration = relatives.filter((reg) => reg !== null);
    } catch (error) {
      console.error("Error fetching registrations:", error);
      return res.status(500).json({
        code: 500,
        message: "Internal server error",
        error: error.message,
      });
    }

    const checkModel = data_registration.map(
      (r) => r.model === MODEL_TYPE.REGISTRATION_FOUR
    );

    const persons = checkModel.length !== 1
      ? data_registration.map((item) => ({
        fullName: item.fullName,
        roleLabel: item.position || "",
        dob: item.birthDate
          ? item.birthDate instanceof Date
            ? item.birthDate.toLocaleDateString("ru-RU")
            : item.birthDate.toString()
          : "",
        birthplace: item.birthPlace || "",
        noteLabel: item.notes || "",
        residence: item.residence || "",
        workplace: item.workplace || "",
      }))
      : await Promise.all(
        data_registration.map(async (item) => {
          const relatives = await prisma.relatives.findMany({
            where: {
              registrationId: item.id,
              AND: [
                { notes: { not: null } },
                { notes: { not: '' } }
              ]
            },
            select: {
              relationDegree: true,
              fullName: true,
              notes: true,
              birthDate: true,
              birthYear: true,
              birthPlace: true,
              residence: true,
              workplace: true,
            },
          });
          let normalizeRelativeInfo = (relatives || []).map(
            (relative) =>
              `${relative.relationDegree} - ${relative.fullName}, ${relative.birthDate
                ? relative.birthDate.toLocaleDateString("ru-RU")
                : (relative.birthYear || "")
              }, уроженец ${relative.birthPlace || ""}, ${relative.notes || ""
              }`
          );

          const registrationCheck = await prisma.registration.findFirst({
            where: {
              id: item.id,
              AND: [
                { notes: { not: null } },
                { notes: { not: '' } }
              ]
            },
          });

          // if (registrationCheck) {
          //   normalizeRelativeInfo=`${registrationCheck.notes}, ${normalizeRelativeInfo.join("; ")}`
          // }

          return {
            fullName: item.fullName,
            roleLabel: item.position || "",
            dob: item.birthDate
              ? item.birthDate instanceof Date
                ? item.birthDate.toLocaleDateString("ru-RU")
                : item.birthDate.toString()
              : "",
            birthplace: item.birthPlace || "",
            ...(registrationCheck ? { noteLabel: `${registrationCheck.notes}, ${normalizeRelativeInfo.join("; ")}` } : { noteLabel: normalizeRelativeInfo.join("; ") }),
            residence: item.residence || "",
            workplace: item.workplace || "",
          };
        })
      );

    const recordNumbers = data_registration[0].regNumber || "";

    const getAdmin = (await prisma.admin.findUnique({
      where: { id: req.userId }, select: { first_name: true, last_name: true }
    }))

    const doc = checkModel.length == 1 ? generateConclusionDocx("ф-4 заключение.docx", {
      leftHeader: `${getAdmin?.first_name.slice(0, 1).toLowerCase()}${getAdmin?.last_name?.slice(0, 1).toLowerCase()}-1`,
      rightHeader: "Секретно \n Экз.№_",
      rightHeader2: conclusion?.title ?? "У Т В Е Р Ж Д А Ю",
      approverTitle: conclusion?.to_organization ?? "РУКОВОДИТЕЛЬ",
      position: conclusion?.to_position ?? "Должность",
      sign: "подпись",
      fio: conclusion?.to_who ?? "Ф.И.О.",
      operatorName: "А.Ахмадов",
      chiefName: "А.Ахмадов",
      monthLabel: "«25» июля", // e.g., 'июля'
      year: 2025,
      heading: conclusion?.title_center ?? "Заключение",
      intro1: conclusion?.first_input ?? "Текст вводится самостоятельно:",
      person: persons,
      intro2: conclusion?.second_input ?? "Текст вводится самостоятельно.",
      agreedLabel: executorList?.slice(1),
      underline: false,
      operator: {
        data: `${getExecutor?.workplace ?? "Оператор подразделения"}`,
        rank: `${getExecutor?.rank ?? "Должность"}`,
        data1: `${getExecutorName}`,
        time: `«____» ${currentMonthRu} ${year} года`,
      },
      head: {
        data: `${(signList[0]?.position ?? "Начальник подразделения") + (`, ${signList[0]?.workplace ?? "Должность"}`)}`,
        rank: `${signList[0]?.rank ?? "Должность"}`,
        data1: `${signListFormatted[0] ? signListFormatted[0] : signListFormatted[0]}`,
        time: `«____» ${currentMonthRu} ${year} года`,
      },
      recordNumbers,
    }) : generateConclusionDocxF4("ф-4 заключение.docx", {
      leftHeader: `${getAdmin?.first_name.slice(0, 1).toLowerCase()}${getAdmin?.last_name?.slice(0, 1).toLowerCase()}-1`,
      rightHeader: "Секретно \n Экз.№_",
      rightHeader2: conclusion?.title ?? "У Т В Е Р Ж Д А Ю",
      approverTitle: conclusion?.to_organization ?? "Руководитель",
      position: conclusion?.to_position ?? "Должность",
      sign: "подпись",
      fio: conclusion?.to_who ?? "Ф.И.О.",
      operatorName: "А.Ахмадов",
      chiefName: "А.Ахмадов",
      monthLabel: "«25» июля", // e.g., 'июля'
      year: 2025,
      heading: conclusion?.title_center ?? "Заключение",
      intro1: conclusion?.first_input ?? "Текст вводится самостоятельно:",
      person: persons,
      intro2: conclusion?.second_input ?? "Текст вводится самостоятельно.",
      agreedLabel: executorList?.slice(1),
      underline: false,
      operator: {
        data: `${getExecutor?.workplace ?? "Оператор подразделения"}`,
        rank: `${getExecutor?.rank ?? "Должность"}`,
        data1: `${getExecutorName}`,
        time: `«____» ${currentMonthRu} ${year} года`,
      },
      head: {
        data: `${(signList[0]?.position ?? "Начальник подразделения") + (`, ${signList[0]?.workplace ?? "Должность"}`)}`,
        rank: `${signList[0]?.rank ?? "Должность"}`,
        data1: `${signListFormatted[0] ? signListFormatted[0] : signListFormatted[0]}`,
        time: `«____» ${currentMonthRu} ${year} года`,
      },
      recordNumber: recordNumbers,
    });

    const combinedDoc = new Document({
      sections: [...doc.sections],
    });
    // Hujjat buferini yaratish
    const buffer = await Packer.toBuffer(combinedDoc);

    // Tasodifiy nom yaratish
    const randomFileName = `${uuidv4()}.docx`;
    const filePath = path.join(__dirname, "../../uploads", randomFileName);

    const raport = await prisma.raport.create({
      data: {
        name: name,
        executorId: req.userId,
        link: SERVER_URL + "/api/v1/download/" + randomFileName,
        notes: "",
      },
    });

    // Collect only real Registration model IDs (exclude relatives or any non-registration models)
    const registrationIds = [
      ...new Set(
        data_registration
          .filter(
            (r) =>
              (r.model === MODEL_TYPE.REGISTRATION ||
                r.model === MODEL_TYPE.REGISTRATION_FOUR) &&
              r.id
          )
          .map((r) => r.id)
      ),
    ];

    await prisma.raportLink.create({
      data: {
        raportId: raport.id,
        ...(data_registration.some(
          (r) => r.model === MODEL_TYPE.REGISTRATION_FOUR
        )
          ? {
            regNumber: data_registration.find(
              (r) => r.model === MODEL_TYPE.REGISTRATION_FOUR
            )?.regNumber,
          }
          : {}),
        code: name,
        // Use Prisma m:n connect syntax only if we have at least one registration id
        ...(registrationIds.length
          ? {
            registrations: { connect: registrationIds.map((id) => ({ id })) },
          }
          : {}),
      },
    });

    data_registration.forEach(async (item) => {
      const registration = await prisma.registration.findUnique({
        where: { id: item.id },
      });
      if (!registration) return;
      const code =
        registration?.regNumber + " " + "ф-" + registration?.form_reg;

      const accessStatus = !(
        (registration?.accessStatus.toLocaleLowerCase().includes("снят") ||
          registration?.accessStatus == "ДОПУСК") &&
        registration.expired &&
        new Date(registration.expired) >= new Date()
      );

      await prisma.registration.update({
        where: { id: item.id },
        data: {
          accessStatus: registration?.accessStatus === ACCESS_STATUS.PROVERKA
            ? ACCESS_STATUS.CONCLUSION
            : registration?.accessStatus,
          completeStatus: MODEL_STATUS.WAITING,
          expired: null,
          conclusionRegNum: code,
          expiredDate: null,
        },
      });
      registration?.accessStatus === ACCESS_STATUS.PROVERKA &&
        (await prisma.registrationLog.create({
          data: {
            registrationId: item.id,
            fieldName: "accessStatus",
            oldValue: registration?.accessStatus,
            newValue: ACCESS_STATUS.CONCLUSION,
            executorId: req.userId,
          },
        }));
      MODEL_STATUS.WAITING !== registration?.completeStatus &&
        (await prisma.registrationLog.create({
          data: {
            registrationId: item.id,
            fieldName: "completeStatus",
            oldValue: registration?.completeStatus,
            newValue: `${MODEL_STATUS.WAITING} ${ACCESS_STATUS.CONCLUSION} ${code}`,
            executorId: req.userId,
          },
        }));
      await prisma.registrationLog.create({
        data: {
          registrationId: item.id,
          fieldName: "conclusionRegNum",
          oldValue: registration?.conclusionRegNum,
          newValue: code,
          executorId: req.userId,
        },
      });
      // await prisma.raportLink.create({
      //   data: {
      //     raportId: raport.id,
      //     registrationId: item.id,
      //     code: code,
      //   },
      // });
    });

    fs.writeFileSync(filePath, buffer);

    // Return the file as a response
    // return res.download(filePath, "report.docx", (err) => {
    //   if (err) {
    //     console.error("Error sending file:", err);
    //     return res.status(500).json({
    //       code: 500,
    //       message: "Error sending file",
    //       error: err.message,
    //     });
    //   }
    // });

    return res.status(200).json({
      code: 200,
      message: "Document generated and saved successfully",
      link: SERVER_URL + "/api/v1/download/" + randomFileName,
    });
  } catch (error) {
    console.error("Error generating report1:", error);
    console.log(error);
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
 * /api/v1/raport/list:
 *   get:
 *     summary: "List all raports"
 *     tags: [Report]
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
 *         description: "Number of raports per page"
 *         default: 10
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: "Search query for filtering raports by name"
 *     responses:
 *       200:
 *         description: "List of raports retrieved successfully"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_pages:
 *                   type: integer
 *                 total_raports:
 *                   type: integer
 *                 raports:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       link:
 *                         type: string
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
exports.listRaports = async (req, res) => {
  try {
    let { pageNumber, pageSize, name = "" } = req.query;
    pageNumber = parseInt(pageNumber);
    pageSize = parseInt(pageSize);

    // Kiritilgan ma'lumotlarni tekshirish
    if (!(pageNumber && pageSize)) {
      return res
        .status(400)
        .json({ code: 400, message: "Page number and page size are required" });
    }

    const filters = {
      AND: [name ? { name: { contains: name } } : {}],
    };

    // Bazadan paginatsiya qilingan hisobotlarni olish
    const raports = await prisma.raport.findMany({
      skip: (pageNumber - 1) * pageSize,
      take: pageSize,
      include: {
        executor: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            father_name: true,
          },
        },
      },
      where: filters,
    });

    // Hisobotlarning umumiy sonini olish
    const totalRaports = await prisma.raport.count({
      where: filters,
    });

    // Umumiy sahifalar sonini hisoblash
    const totalPages = Math.ceil(totalRaports / pageSize);

    return res.status(200).json({
      code: 200,
      message: "Raports retrieved successfully",
      total_pages: totalPages,
      total_raports: totalRaports,
      raports: raports,
    });
  } catch (error) {
    console.error("Error retrieving raports:", error);
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
 * /api/v1/raport/listExecutor:
 *   get:
 *     summary: "List all raports"
 *     tags: [Report]
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
 *         description: "Number of raports per page"
 *         default: 10
 *       - in: query
 *         name: registrationId
 *         schema:
 *           type: string
 *         description: "Search query for filtering raports by name"
 *     responses:
 *       200:
 *         description: "List of raports retrieved successfully"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_pages:
 *                   type: integer
 *                 total_raports:
 *                   type: integer
 *                 raports:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       link:
 *                         type: string
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
exports.listRaportsExecutor = async (req, res) => {
  try {
    let { pageNumber, pageSize, registrationId = "" } = req.query;
    pageNumber = parseInt(pageNumber);
    pageSize = parseInt(pageSize);

    const {
      adminCheck = "all",
      executor: executorFilter,
      fullName,
      name,
      discuss = "all",
      registration4 = "",
      operator = "all",
    } = req.body;

    // Kiritilgan ma'lumotlarni tekshirish
    if (!(pageNumber && pageSize)) {
      return res
        .status(400)
        .json({ code: 400, message: "Page number and page size are required" });
    }

    let registrationFourCheck = null;

    if (registrationId) {
      registrationFourCheck = await prisma.registration.findUnique({
        where: { id: registrationId, model: MODEL_TYPE.REGISTRATION_FOUR },
      });
    }

    console.log("discuss", discuss !== "all");
    console.log("discuss", discuss !== "all");


    const filters = {
      AND: [
        { display: true },
        executorFilter
          ? { raport: { executorId: { contains: executorFilter } } }
          : {},
        fullName
          ? { registrations: { some: { fullName: { contains: fullName } } } }
          : {},
        name ? { raport: { name: { contains: name } } } : {},
        registration4 !== "" ? { regNumber: { equals: registration4 } } : {},
        adminCheck !== "all"
          ? { adminCheck: { equals: adminCheck === "yes" ? true : false } }
          : {},
        discuss !== "all"
          ? { discussCheck: { equals: discuss === "yes" ? true : false } }
          : {},
        operator !== "all"
          ? { operator: { equals: operator === "yes" ? true : false } }
          : {},
      ],
      ...(registrationId || registrationFourCheck
        ? {
          OR: [
            registrationId
              ? {
                registrations: {
                  some: { id: { contains: registrationId } },
                },
              }
              : {},
            registrationFourCheck
              ? { regNumber: { equals: registrationFourCheck.regNumber } }
              : {},
          ],
        }
        : {}),
    };

    // const executor = await prisma.admin.findUnique({
    //   where: { id: req.userId },
    // });

    // if (executor && executor?.role === "superAdmin") {
    //   // filters.AND.push({ executorId: { equals: executorId } });
    // } else if (executor?.id == req.userId) {
    //   filters.AND.push({ raport: { executorId: { contains: req.userId } } });
    // }
    // Bazadan paginatsiya qilingan hisobotlarni olish
    let raports = await prisma.raportLink.findMany({
      where: filters,
      skip: (pageNumber - 1) * pageSize,
      take: pageSize,
      include: {
        raport: {
          include: {
            executor: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                father_name: true,
              },
            },
            links: true,
          },
        },
        registrations: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            fatherName: true,
            fullName: true,
            regNumber: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (registrationFourCheck) {
      filters.AND.push({
        regNumber: { equals: registrationFourCheck.regNumber },
      });
    }

    // Hisobotlarning umumiy sonini olish
    const totalRaports = await prisma.raportLink.count({
      where: filters,
    });

    // Umumiy sahifalar sonini hisoblash
    const totalPages = Math.ceil(totalRaports / pageSize);

    if (checkRegistrationNumber.model === MODEL_TYPE.REGISTRATION_FOUR) {
    }

    return res.status(200).json({
      code: 200,
      message: "Raports retrieved successfully",
      total_pages: totalPages,
      total_raports: totalRaports,
      raports: raports,
    });
  } catch (error) {
    console.error("Error retrieving raports:", error);
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
 * /api/v1/raport/get/:id:
 *   get:
 *     summary: "Get raport by id"
 *     tags: [Report]
 *     parameters:
 *       - in: query
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: "Raport ID"
 *     responses:
 *       200:
 *         description: "List of raports retrieved successfully"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_pages:
 *                   type: integer
 *                 total_raports:
 *                   type: integer
 *                 raports:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       link:
 *                         type: string
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
exports.getRaportById = async (req, res) => {
  try {
    let { id } = req.query;

    // Bazadan paginatsiya qilingan hisobotlarni olish
    const raports = await prisma.raportLink.findFirst({
      where: {
        id,
      },
      include: {
        raport: {
          include: {
            executor: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                father_name: true,
              },
            },
            links: true,
          },
        },
        registrations: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    if (!raports) {
      return res.status(404).json({ code: 404, message: "Raport not found" });
    }

    return res.status(200).json({
      code: 200,
      message: "Raports retrieved successfully",
      raports: raports,
    });
  } catch (error) {
    console.error("Error retrieving raports:", error);
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
 * /api/v1/raport/download:
 *   get:
 *     summary: "Download raport"
 *     tags: [Report]
 *     parameters:
 *       - in: query
 *         name: registrationId
 *         schema:
 *           type: integer
 *         required: true
 *         description: "Registration ID"
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *         required: true
 *         description: "Raport code"
 *     responses:
 *       200:
 *         description: "Raport downloaded successfully"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: string
 *       400:
 *         description: "Invalid input"
 *       500:
 *         description: "Internal server error"
 */
exports.downloadRaport = async (req, res) => {
  try {
    const { registrationId, code } = req.query;
    if (!registrationId || !code) {
      return res
        .status(400)
        .json({ code: 400, message: "Registration ID and code are required" });
    }

    const raportLink = await prisma.raportLink.findFirst({
      where: {
        code,
        registrations: { some: { id: registrationId } },
      },
      include: {
        raport: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    console.log(raportLink);

    if (!raportLink) {
      return res.status(404).json({ code: 404, message: "Raport not found" });
    }

    return res.status(200).json({
      code: 200,
      message: "Raport retrieved successfully",
      data: {
        link: raportLink.raport.link,
        name: raportLink.raport.name,
      },
    });
  } catch (error) {
    console.error("Error retrieving raport:", error);
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
 * /api/v1/raport/updateLinkStatus:
 *   post:
 *     summary: "Update RaportLink checkboxes (display, adminCheck, operator)"
 *     tags: [Report]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               display:
 *                 type: boolean
 *               adminCheck:
 *                 type: boolean
 *               operator:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: "RaportLink updated successfully"
 *       400:
 *         description: "Bad request"
 *       409:
 *         description: "Forbidden"
 *       404:
 *         description: "Not found"
 *       500:
 *         description: "Internal server error"
 */
exports.updateRaportLinkStatus = async (req, res) => {
  try {
    const { id, display, adminCheck, operator, discuss } = req.body;
    console.log("shu yerdaman");

    if (!id) {
      return res
        .status(400)
        .json({ code: 400, message: "RaportLink id is required" });
    }

    // Fetch current admin and the raportLink with raport info
    const [currentAdmin, raportLink] = await Promise.all([
      prisma.admin.findUnique({ where: { id: req.userId } }),
      prisma.raportLink.findUnique({
        where: { id },
        include: { raport: true },
      }),
    ]);

    if (!raportLink) {
      return res
        .status(404)
        .json({ code: 404, message: "RaportLink not found" });
    }

    // Build update object only with provided fields
    const updateData = {};
    if (typeof display !== "undefined") updateData.display = display;

    // adminCheck can only be written by superAdmin
    if (typeof adminCheck !== "undefined") {
      if (!currentAdmin || currentAdmin.role !== "superAdmin") {
        return res.status(409).json({
          code: 409,
          message: "Only superAdmin can change adminCheck",
        });
      }
      updateData.adminCheck = adminCheck;
    }

    // operator can only be changed by raport creator (raport.executorId)
    if (typeof operator !== "undefined") {
      const raportExecutorId = raportLink.raport
        ? raportLink.raport.executorId
        : null;
      if (!raportExecutorId) {
        return res
          .status(400)
          .json({ code: 400, message: "Raport has no executor configured" });
      }
      if (raportExecutorId !== req.userId) {
        return res.status(409).json({
          code: 409,
          message: "Only raport creator can change operator check",
        });
      }
      updateData.operator = operator;
    }

    // operator can only be changed by raport creator (raport.executorId)
    if (typeof discuss !== "undefined") {
      if (!currentAdmin || currentAdmin.role !== "superAdmin") {
        return res.status(409).json({
          code: 409,
          message: "Only superAdmin can change discussCheck",
        });
      }
      updateData.discussCheck = discuss;
    }


    if (Object.keys(updateData).length === 0) {
      return res
        .status(400)
        .json({ code: 400, message: "No updatable fields provided" });
    }

    const updated = await prisma.raportLink.update({
      where: { id },
      data: updateData,
    });

    return res.status(200).json({
      code: 200,
      message: "RaportLink updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("Error updating RaportLink status:", error);
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
 * /api/v1/raport/createSP:
 *   post:
 *     summary: "IDlar massivi asosida hujjat yaratish"
 *     tags: [Report]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *                 example: "1"
 *               name:
 *                 type: string
 *                 example: "Т  А  Л  А  Б  Н  О  М  А"
 *               organization:
 *                 type: string
 *                 default: "Министерство юстиции Республики Узбекистан"
 *               raport_data:
 *                 type: string
 *                 default: "2019-05-02 05:00:00"
 *               signListIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: "Hujjat muvaffaqiyatli yaratildi va saqlandi"
 *       400:
 *         description: "Xato: IDlar talab qilinadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.generateSP = async (req, res) => {
  try {
    const {
      id,
      name = "type 1,type 2,type 3",
      signListIds,
      raport_data = new Date(),
    } = req.body;

    // Fetch data from database based on IDs
    const data = await prisma.registration.findUnique({
      where: { id },
      include: {
        Initiator: {
          select: {
            first_name: true,
            last_name: true,
            father_name: true,
          },
        },
        executor: {
          select: {
            first_name: true,
            last_name: true,
            father_name: true,
            phone: true,
          },
        },
      },
    });

    if (!data) {
      return res
        .status(404)
        .json({ code: 404, message: "registration not found" });
    }

    if (signListIds?.length === 0) {
      return res
        .status(404)
        .json({ code: 404, message: "signListIds not found" });
    }

    const signList = await prisma.signList.findMany({
      where: {
        id: { in: signListIds },
      },
    });

    if (!signList) {
      return res.status(404).json({ code: 404, message: "signList not found" });
    }

    const executorList = signList.map((item) => {
      const name =
        (item?.lastName ? item?.lastName + " " : "") +
        "" +
        (item?.firstName ? item?.firstName.slice(0, 1) + "." : "") +
        "" +
        (item?.fatherName ? item?.fatherName.slice(0, 1) + "." : "");
      const position = item?.position ? item?.position : "";
      return {
        name: name,
        position: position,
      };
    });

    // Normalize and validate raport_data to avoid timezone shifts
    let raportDate = raport_data ? new Date(raport_data) : new Date();
    if (isNaN(raportDate.getTime())) {
      return res
        .status(400)
        .json({ code: 400, message: "Invalid raport_data" });
    }
    const formattedDate = raportDate
      .toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
      .replace("г.", "г");

    const executor =
      (data?.executor?.last_name ? data?.executor?.last_name + " " : "") +
      (data?.executor?.first_name
        ? data?.executor?.first_name.slice(0, 1) + "."
        : "") +
      (data?.executor?.father_name
        ? data?.executor?.father_name.slice(0, 1) + "."
        : "");
    const executor_phone = data?.executor?.phone ? data?.executor?.phone : "";
    const initiator =
      (data?.Initiator?.last_name ? data?.Initiator?.last_name + " " : "") +
      (data?.Initiator?.first_name
        ? data?.Initiator?.first_name.slice(0, 1) + "."
        : "") +
      (data?.Initiator?.father_name
        ? data?.Initiator?.father_name.slice(0, 1) + "."
        : "");
    // Create a new document
    const formattedBirthDate = data?.birthDate
      ? safeString(new Date(data?.birthDate).getFullYear())
      : "";
    // const doc = generateTalabnoma(
    //   name,
    //   "organization",
    //   data?.firstName,
    //   data?.lastName,
    //   data?.fatherName,
    //   formattedBirthDate,
    //   data?.birthPlace,
    //   data?.residence,
    //   data?.workplace
    //     ? data?.workplace
    //     : "" + data?.position
    //     ? data?.position
    //     : "",
    //   data?.notes ? data?.notes : "",
    //   "ГСБП Республики Узбекистан",
    //   formattedDate,
    //   executor,
    //   executor_phone,
    //   initiator,
    //   data?.recordNumber ? data?.recordNumber : ""
    // );

    // const doc2 = generateTalabnoma(
    //   name,
    //   "organization",
    //   data?.firstName,
    //   data?.lastName,
    //   data?.fatherName,
    //   formattedBirthDate,
    //   data?.birthPlace,
    //   data?.residence,
    //   data?.workplace
    //     ? data?.workplace
    //     : "" + data?.position
    //     ? data?.position
    //     : "",
    //   data?.notes ? data?.notes : "",
    //   "Saloom",
    //   formattedDate,
    //   executor,
    //   executor_phone,
    //   initiator,
    //   data?.recordNumber ? data?.recordNumber : ""
    // );

    const raportTypes = await getRaportTypesByLinksRaw(["type1", "type2", "type3"]);
    if (!raportTypes?.length) {
      return res
        .status(404)
        .json({ code: 404, message: "raport type not found" });
    }

    const documents = [];
    const hasType3RaportType = raportTypes.some((item) =>
      String(item?.link || "").includes("type3")
    );
    const ndRaportCodes = ["nd", "nd1", "nd2"];
    for (let i = 0; i < raportTypes?.length; i++) {
      if (
        raportTypes[i]?.link.includes("type1") &&
        !(name === "type7" || name === "type6")
      ) {
        documents.push(
          generateTalabnoma(
            raportTypes[i]?.name,
            raportTypes[i]?.organization,
            data?.firstName,
            data?.lastName,
            data?.fatherName,
            formattedBirthDate,
            data?.birthPlace,
            data?.residence,
            data?.workplace
              ? data?.workplace
              : "" + data?.position
                ? data?.position
                : "",
            data?.notes ? "к/м" : "",
            raportTypes[i]?.requested_organization,
            formattedDate,
            executor,
            executor_phone,
            executorList,
            initiator,
            data?.regNumber ? data?.regNumber : ""
          )
        );
      } else if (
        raportTypes[i]?.link.includes("type2") &&
        !(name === "type7" || name === "type6")
      ) {
        documents.push(
          generateTalabnoma(
            "",
            raportTypes[i]?.organization,
            data?.firstName,
            data?.lastName,
            data?.fatherName,
            formattedBirthDate,
            data?.birthPlace,
            data?.residence,
            data?.workplace
              ? data?.workplace
              : "" + data?.position
                ? data?.position
                : "",
            data?.notes ? "к/м" : "",
            raportTypes[i]?.requested_organization,
            formattedDate,
            executor,
            executor_phone,
            executorList,
            initiator,
            data?.regNumber ? data?.regNumber : ""
          )
        );
      } else if (
        (
          (hasType3RaportType && raportTypes[i]?.link.includes("type3")) ||
          (!hasType3RaportType && raportTypes[i]?.link.includes("type2"))
        ) &&
        (name === "type7" || name === "type6")
      ) {
        if (
          name === "type7" &&
          (
            raportTypes[i]?.code === "nd" ||
            raportTypes[i]?.code === "nd2" ||
            (
              !hasType3RaportType &&
              !ndRaportCodes.includes(String(raportTypes[i]?.code || "").toLowerCase())
            )
          )
        ) {
          documents.push(
            generatePsychoRaport(
              raportTypes[i]?.organization,
              data?.firstName,
              data?.lastName,
              data?.fatherName,
              formattedBirthDate,
              data?.birthPlace,
              data?.residence,
              raportTypes[i]?.requested_organization,
              formattedDate,
              executor,
              executor_phone,
              initiator,
              data?.regNumber ? data?.regNumber : "",
              executorList,
              raportTypes[i]?.notes ? raportTypes[i]?.notes : ""
            )
          );
        } else if (
          name === "type6" &&
          (
            raportTypes[i]?.code === "nd" ||
            raportTypes[i]?.code === "nd1" ||
            (
              !hasType3RaportType &&
              !ndRaportCodes.includes(String(raportTypes[i]?.code || "").toLowerCase())
            )
          )
        ) {
          documents.push(
            generatePsychoRaport(
              raportTypes[i]?.organization,
              data?.firstName,
              data?.lastName,
              data?.fatherName,
              formattedBirthDate,
              data?.birthPlace,
              data?.residence,
              raportTypes[i]?.requested_organization,
              formattedDate,
              executor,
              executor_phone,
              initiator,
              data?.regNumber ? data?.regNumber : "",
              executorList,
              raportTypes[i]?.notes ? raportTypes[i]?.notes : ""
            )
          );
        }
      }
    }
    const isPsychoReport = name === "type7" || name === "type6";
    const combinedDoc = buildCombinedDocument(documents, {
      addPageBreakBetween: !isPsychoReport,
    });
    if (!combinedDoc) {
      return res.status(404).json({
        code: 404,
        message: "No matching raport templates found",
      });
    }

    // Ikkala hujjatning bo'limlarini birlashtirish

    // Hujjat buferini yaratish
    const buffer = await Packer.toBuffer(combinedDoc);

    // Tasodifiy nom yaratish
    const randomFileName = `${uuidv4()}.docx`;
    const filePath = path.join(__dirname, "../../uploads", randomFileName);

    // Save the document to the file system

    const raport = await prisma.raport.create({
      data: {
        name: name,
        executorId: req.userId,
        link: SERVER_URL + "/api/v1/download/" + randomFileName,
        notes: "",
      },
    });

    await prisma.raportLink.create({
      data: {
        raportId: raport.id,
        code: name,
        registrations: { connect: [{ id }] },
      },
    });

    fs.writeFileSync(filePath, buffer);
    // Return the file as a response
    // return res.download(filePath, "report.docx", (err) => {
    //   if (err) {
    //     console.error("Error sending file:", err);
    //     return res.status(500).json({
    //       code: 500,
    //       message: "Error sending file",
    //       error: err.message,
    //     });
    //   }
    // });
    return res.status(200).json({
      code: 200,
      message: "Document generated and saved successfully",
      link: SERVER_URL + "/api/v1/download/" + randomFileName,
    });
  } catch (error) {
    console.log(error);
    console.error("Error generating report:", error);
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
 * /api/v1/raport/generateOPRaport:
 *   post:
 *     summary: "IDlar massivi asosida hujjat yaratish"
 *     tags: [Report]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *                 example: "1"
 *               name:
 *                 type: string
 *                 example: "Т  А  Л  А  Б  Н  О  М  А"
 *               organization:
 *                 type: string
 *                 default: "Министерство юстиции Республики Узбекистан"
 *               raport_data:
 *                 type: string
 *                 default: "2019-05-02 05:00:00"
 *               signListIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: "Hujjat muvaffaqiyatli yaratildi va saqlandi"
 *       400:
 *         description: "Xato: IDlar talab qilinadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.generateOPRaport = async (req, res) => {
  try {
    const {
      id,
      name = "type 1,type 2,type 3",
      ids = [],
      signListIds,
      raport_data = new Date(),
    } = req.body;
    // if(typeof name !== "string"){
    //   return res.status(400).json({ code: 400, message: "Name must be a string" });
    // }
    const data = [];
    // const typeList = name.split(",");
    if (ids.length !== 0) {
      const registrations = await prisma.registration.findMany({
        where: { id: { in: [id, ...ids] } },
        include: {
          Initiator: {
            select: {
              first_name: true,
              last_name: true,
              father_name: true,
            },
          },
          executor: {
            select: {
              first_name: true,
              last_name: true,
              father_name: true,
            },
          },
        },
      });
      const relatives = await prisma.relatives.findMany({
        where: {
          id: { in: [id, ...ids] },
        },
      });

      data.push(...registrations, ...relatives);
    } else {
      const registration = await prisma.registration.findUnique({
        where: { id },
        include: {
          Initiator: {
            select: {
              first_name: true,
              last_name: true,
              father_name: true,
            },
          },
          executor: {
            select: {
              first_name: true,
              last_name: true,
              father_name: true,
            },
          },
        },
      });
      if (registration.model === "registration") {
        const relatives = await prisma.relatives.findMany({
          where: {
            registrationId: registration.id,
            model: "relative",
          },
        });
        data.push(registration, ...relatives);
      } else {
        const companies = await prisma.registration.findMany({
          where: {
            form_reg: registration.form_reg,
          },
        });
        data.push(...companies);
      }
    }

    // Fetch data from database based on IDs
    if (data?.length === 0) {
      return res
        .status(404)
        .json({ code: 404, message: "registration not found" });
    }

    if (signListIds?.length === 0) {
      return res
        .status(404)
        .json({ code: 404, message: "signListIds not found" });
    }

    const signList = await prisma.signList.findMany({
      where: {
        id: { in: signListIds },
      },
    });

    if (!signList) {
      return res.status(404).json({ code: 404, message: "signList not found" });
    }

    const executorList = signList.map((item) => {
      const name =
        (item?.lastName ? item?.lastName + " " : "") +
        "" +
        (item?.firstName ? item?.firstName.slice(0, 1) + "." : "") +
        "" +
        (item?.fatherName ? item?.fatherName.slice(0, 1) + "." : "");
      const position = item?.position ? item?.position : "";
      return {
        name: name,
        position: position,
      };
    });

    // Normalize and validate raport_data to avoid timezone shifts
    let raportDate = raport_data ? new Date(raport_data) : new Date();
    if (isNaN(raportDate.getTime())) {
      return res
        .status(400)
        .json({ code: 400, message: "Invalid raport_data" });
    }
    const formattedDate = raportDate
      .toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
      .replace("г.", "г");

    const realExecutor = await prisma.admin.findUnique({
      where: { id: req.userId }
    });

    const executor =
      (realExecutor?.last_name ? realExecutor?.last_name + " " : "") +
      (realExecutor?.first_name
        ? realExecutor?.first_name.slice(0, 1) + "."
        : "") +
      (realExecutor?.father_name
        ? realExecutor?.father_name.slice(0, 1) + "."
        : "");
    const executor_phone = realExecutor?.phone ? realExecutor?.phone : "";
    const initiator =
      (data[0]?.Initiator?.last_name ? data[0]?.Initiator?.last_name + " " : "") +
      (data[0]?.Initiator?.first_name
        ? data[0]?.Initiator?.first_name.slice(0, 1) + "."
        : "") +
      (data[0]?.Initiator?.father_name
        ? data[0]?.Initiator?.father_name.slice(0, 1) + "."
        : "");

    console.log(data);


    const raportTypes = await getRaportTypesByLinksRaw(["type1", "type2", "type3"]);

    const documents = [];
    const psychoRaportTypes =
      name === "type6" || name === "type7"
        ? getPsychoRaportTypes(raportTypes, name)
        : [];
    psychoRaportTypes.forEach((raportType) => {
      documents.push(
        generatePsychoRaportList(
          raportType?.organization,
          data,
          raportType?.requested_organization,
          formattedDate,
          executor,
          executor_phone,
          initiator,
          data[0]?.regNumber ? data[0]?.regNumber : "",
          executorList,
          raportType?.notes ? raportType?.notes : ""
        )
      );
    });
    const combinedDoc = buildCombinedDocument(documents);
    if (!combinedDoc) {
      return res.status(404).json({
        code: 404,
        message: "No matching raport templates found",
      });
    }

    // Ikkala hujjatning bo'limlarini birlashtirish

    // Hujjat buferini yaratish
    const buffer = await Packer.toBuffer(combinedDoc);

    // Tasodifiy nom yaratish
    const randomFileName = `${uuidv4()}.docx`;
    const filePath = path.join(__dirname, "../../uploads", randomFileName);

    // Save the document to the file system

    const raport = await prisma.raport.create({
      data: {
        name: name,
        executorId: req.userId,
        link: SERVER_URL + "/api/v1/download/" + randomFileName,
        notes: "",
      },
    });

    await prisma.raportLink.create({
      data: {
        raportId: raport.id,
        code: name,
      },
    });

    fs.writeFileSync(filePath, buffer);
    // Return the file as a response
    // return res.download(filePath, "report.docx", (err) => {
    //   if (err) {
    //     console.error("Error sending file:", err);
    //     return res.status(500).json({
    //       code: 500,
    //       message: "Error sending file",
    //       error: err.message,
    //     });
    //   }
    // });
    return res.status(200).json({
      code: 200,
      message: "Document generated and saved successfully",
      link: SERVER_URL + "/api/v1/download/" + randomFileName,
    });
  } catch (error) {
    console.log(error);
    console.error("Error generating report:", error);
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
 * /api/v1/raport/generateMalumotnoma:
 *   post:
 *     summary: "IDlar massivi asosida hujjat yaratish"
 *     tags: [Report]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *                 example: "1"
 *               name:
 *                 type: string
 *                 example: "Т  А  Л  А  Б  Н  О  М  А"
 *               organization:
 *                 type: string
 *                 default: "Министерство юстиции Республики Узбекистан"
 *               raport_data:
 *                 type: string
 *                 default: "2019-05-02 05:00:00"
 *               signListIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: "Hujjat muvaffaqiyatli yaratildi va saqlandi"
 *       400:
 *         description: "Xato: IDlar talab qilinadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.generateMalumotnomaList = async (req, res) => {
  try {
    const {
      type,
      name = "type 1,type 2,type 3",
      ids = [],
      signListIds,
      raport_data = new Date(),
    } = req.body;

    // if(typeof name !== "string"){
    //   return res.status(400).json({ code: 400, message: "Name must be a string" });
    // }
    const data = [];

    // const typeList = name.split(",");
    if (ids.length !== 0) {
      const registrations = await prisma.registration.findMany({
        where: {
          id: { in: ids },
        },
      });
      const relatives = await prisma.relatives.findMany({
        where: {
          id: { in: ids },
        },
      });
      data.push(...registrations, ...relatives);
    } else {
      const sessions = await prisma.session.findMany({
        where: { adminId: req.userId, type: type },
      });
      await Promise.all(
        sessions.map(async (item) => {
          // Avval registration modelini tekshirish
          let registration = await prisma.registration.findFirst({
            where: { id: item.registrationId },
          });

          // Agar registration topilmasa, relatives modelini tekshirish
          if (!registration) {
            registration = await prisma.relatives.findFirst({
              where: { id: item.registrationId },
            });
          }

          if (registration) {
            data.push(registration);
          }
        })
      );
      data.push(...sessions);
    }

    // Fetch data from database based on IDs
    if (data?.length === 0) {
      return res
        .status(404)
        .json({ code: 404, message: "registration not found" });
    }

    if (signListIds?.length === 0) {
      return res
        .status(404)
        .json({ code: 404, message: "signListIds not found" });
    }

    const signList = await prisma.signList.findMany({
      where: {
        id: { in: signListIds },
      },
    });

    if (!signList) {
      return res.status(404).json({ code: 404, message: "signList not found" });
    }

    const executorList = signList.map((item) => {
      const name =
        (item?.lastName ? item?.lastName + " " : "") +
        "" +
        (item?.firstName ? item?.firstName.slice(0, 1) + "." : "") +
        "" +
        (item?.fatherName ? item?.fatherName.slice(0, 1) + "." : "");
      const position = item?.position ? item?.position : "";
      return {
        name: name,
        position: position,
      };
    });

    // Normalize and validate raport_data to avoid timezone shifts
    let raportDate = raport_data ? new Date(raport_data) : new Date();
    if (isNaN(raportDate.getTime())) {
      return res
        .status(400)
        .json({ code: 400, message: "Invalid raport_data" });
    }
    const formattedDate = raportDate
      .toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
      .replace("г.", "г");

    const executor =
      (data?.executor?.last_name ? data?.executor?.last_name + " " : "") +
      (data?.executor?.first_name
        ? data?.executor?.first_name.slice(0, 1) + "."
        : "") +
      (data?.executor?.father_name
        ? data?.executor?.father_name.slice(0, 1) + "."
        : "");
    const executor_phone = data?.executor?.phone ? data?.executor?.phone : "";
    const initiator =
      (data?.Initiator?.last_name ? data?.Initiator?.last_name + " " : "") +
      (data?.Initiator?.first_name
        ? data?.Initiator?.first_name.slice(0, 1) + "."
        : "") +
      (data?.Initiator?.father_name
        ? data?.Initiator?.father_name.slice(0, 1) + "."
        : "");

    const raportTypes = await getRaportTypesByLinksRaw(["type1", "type2", "type3"]);
    if (!raportTypes?.length) {
      return res
        .status(404)
        .json({ code: 404, message: "raport type not found" });
    }

    const type_of_raport =
      name === "type8"
        ? "Рухсатнома рад этилганлиги туғрисида билдиришнома (уведомление об ОТКАЗЕ в допуске)"
        : "Рухсатнома берилгани туғрисида маълумотнома (справка о наличии допуска)";

    const documents = [];
    documents.push(
      generateMalumotnomaListFunc(
        raportTypes[0]?.organization,
        type_of_raport,
        data,
        raportTypes[0]?.requested_organization,
        formattedDate,
        executor,
        executor_phone,
        initiator,
        data?.regNumber ? data?.regNumber : "",
        executorList,
        raportTypes[0]?.notes ? raportTypes[0]?.notes : ""
      )
    );
    const combinedDoc = buildCombinedDocument(documents);
    if (!combinedDoc) {
      return res.status(404).json({
        code: 404,
        message: "No matching raport templates found",
      });
    }

    // Ikkala hujjatning bo'limlarini birlashtirish

    // Hujjat buferini yaratish
    const buffer = await Packer.toBuffer(combinedDoc);

    // Tasodifiy nom yaratish
    const randomFileName = `${uuidv4()}.docx`;
    const filePath = path.join(__dirname, "../../uploads", randomFileName);

    // Save the document to the file system

    const raport = await prisma.raport.create({
      data: {
        name: name,
        executorId: req.userId,
        link: SERVER_URL + "/api/v1/download/" + randomFileName,
        notes: "",
      },
    });

    await prisma.raportLink.create({
      data: {
        raportId: raport.id,
        code: name,
      },
    });

    fs.writeFileSync(filePath, buffer);
    // Return the file as a response
    // return res.download(filePath, "report.docx", (err) => {
    //   if (err) {
    //     console.error("Error sending file:", err);
    //     return res.status(500).json({
    //       code: 500,
    //       message: "Error sending file",
    //       error: err.message,
    //     });
    //   }
    // });
    return res.status(200).json({
      code: 200,
      message: "Document generated and saved successfully",
      link: SERVER_URL + "/api/v1/download/" + randomFileName,
    });
  } catch (error) {
    console.log(error);
    console.error("Error generating report:", error);
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
 * /api/v1/raport/createAVR:
 *   post:
 *     summary: "AVR hujjatini yaratish"
 *     tags: [Report]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *                 example: "1"
 *               name:
 *                 type: string
 *                 example: "Т  А  Л  А  Б  Н  О  М  А"
 *               organization:
 *                 type: string
 *                 default: "Министерство юстиции Республики Узбекистан"
 *               raport_data:
 *                 type: string
 *                 default: "2019-05-02 05:00:00"
 *     responses:
 *       200:
 *         description: "Hujjat muvaffaqiyatli yaratildi va saqlandi"
 *       400:
 *         description: "Xato: IDlar talab qilinadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.generateAVR = async (req, res) => {
  try {
    const {
      id,
      code,
      name = "AVR",
      nationality,
      residence,
      passport,
      travel,
      signListIds,
      additional_information,
      raport_data = new Date(),
    } = req.body;

    // if(typeof name !== "string"){
    //   return res.status(400).json({ code: 400, message: "Name must be a string" });
    // }

    // const typeList = name.split(",");

    // Fetch data from database based on IDs
    let data = await prisma.registration.findUnique({
      where: { id },
      include: {
        Initiator: {
          select: {
            first_name: true,
            last_name: true,
            father_name: true,
          },
        },
        executor: {
          select: {
            first_name: true,
            last_name: true,
            father_name: true,
          },
        },
      },
    });

    if (!data) {
      data = await prisma.relatives.findUnique({
        where: { id },
        include: {
          Initiator: {
            select: {
              first_name: true,
              last_name: true,
              father_name: true,
            },
          },
          executor: {
            select: {
              first_name: true,
              last_name: true,
              father_name: true,
            },
          },
        },
      });

      if (!data) {
        return res.status(404).json({ code: 404, message: "data not found" });
      }
    }

    if (!signListIds || signListIds?.length === 0) {
      return res
        .status(404)
        .json({ code: 404, message: "signListIds not found" });
    }

    const signList = await prisma.signList.findMany({
      where: {
        id: { in: signListIds },
      },
    });

    if (!signList) {
      return res.status(404).json({ code: 404, message: "signList not found" });
    }

    const signListData = signList.map((item) => {
      const name =
        (item?.lastName ? item?.lastName + " " : "") +
        "" +
        (item?.firstName ? item?.firstName.slice(0, 1) + "." : "") +
        "" +
        (item?.fatherName ? item?.fatherName.slice(0, 1) + "." : "");
      const position = item?.position ? item?.position : "";
      return {
        name: name,
        position: position,
      };
    });

    let raportDate = raport_data ? new Date(raport_data) : new Date();
    if (isNaN(raportDate.getTime())) {
      return res
        .status(400)
        .json({ code: 400, message: "Invalid raport_data" });
    }
    const formattedDate = raportDate
      .toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
      .replace("г.", "г");

    const executor =
      (data?.executor?.last_name ? data?.executor?.last_name + " " : "") +
      (data?.executor?.first_name
        ? data?.executor?.first_name.slice(0, 1) + "."
        : "") +
      (data?.executor?.father_name
        ? data?.executor?.father_name.slice(0, 1) + "."
        : "");
    const executor_phone = data?.executor?.phone ? data?.executor?.phone : "";
    const initiator =
      (data?.Initiator?.last_name ? data?.Initiator?.last_name + " " : "") +
      (data?.Initiator?.first_name
        ? data?.Initiator?.first_name.slice(0, 1) + "."
        : "") +
      (data?.Initiator?.father_name
        ? data?.Initiator?.father_name.slice(0, 1) + "."
        : "");
    // Create a new document
    const formattedBirthDate = data?.birthDate
      ? safeString(new Date(data?.birthDate).getFullYear())
      : "";

    const documents = [];

    const raportTypes = await selectRaportTypesByCodeOrFallback({ code, name });

    if (!raportTypes?.length) {
      return res
        .status(404)
        .json({ code: 404, message: "raport type not found" });
    }

    // console.log({
    //   "raportType?.organization": "raportType?.organization",
    //   "data?.firstName": data?.firstName,
    //   "data?.lastName": data?.lastName,
    //   "data?.fatherName": data?.fatherName,
    //   "formattedBirthDate": formattedBirthDate,
    //   "data?.birthPlace": data?.birthPlace,
    //   "data?.residence": data?.residence,
    //   "data?.workplace": data?.workplace,
    //   "data?.position": data?.position,
    //   "data?.notes": data?.notes,
    //   "raportType?.requested_organization": "raportType?.requested_organization",
    //   "formattedDate": formattedDate,
    //   "executor": executor,
    //   "executor_phone": executor_phone,
    //   "initiator": initiator,
    //   "data?.regNumber": data?.regNumber,
    //   "nationality": nationality,
    //   "residence": residence,
    //   "passport": passport,
    //   "travel": travel,
    //   "additional_information": additional_information
    // });

    // return res.status(200).json({
    //   code: 200,
    //   message: "raport type found",
    //   raportTypes,
    // });

    raportTypes.map((raportType) => {
      documents.push(
        generateAVR(
          raportType?.requested_organization,
          raportType?.organization,
          raportType?.name,
          data?.firstName,
          data?.lastName,
          data?.fatherName,
          formattedBirthDate,
          data?.birthPlace,
          nationality,
          residence,
          data?.workplace
            ? data?.workplace
            : "" + data?.position
              ? data?.position
              : "",
          passport,
          travel,
          data?.notes ? "к/м" : "",
          raportType?.notes,
          formattedDate,
          executor,
          executor_phone,
          initiator,
          data?.regNumber ? data?.regNumber : "",
          signListData,
          additional_information,
          raportType?.signed_fio,
          raportType?.signed_position
        )
      );
    });

    // Ikkala hujjatning bo'limlarini birlashtirish
    const combinedDoc = buildCombinedDocument(documents);
    if (!combinedDoc) {
      return res.status(404).json({
        code: 404,
        message: "No matching raport templates found",
      });
    }
    // Hujjat buferini yaratish
    const buffer = await Packer.toBuffer(combinedDoc);

    // Tasodifiy nom yaratish
    const randomFileName = `${uuidv4()}.docx`;
    const filePath = path.join(__dirname, "../../uploads", randomFileName);

    const raport = await prisma.raport.create({
      data: {
        name: name,
        executorId: req.userId,
        link: SERVER_URL + "/api/v1/download/" + randomFileName,
        notes: "",
      },
    });
    // const code = registration?.regNumber + " " + "ф-" + registration?.form_reg;
    // console.log(code);

    // await prisma.registration.update({
    //   where: { id },
    //   data: {
    //     accessStatus: "ПРОВЕРКА",
    //     completeStatus: "COMPLETED",
    //     expired: null,
    //     conclusionRegNum: code,
    //     expiredDate: null,
    //   },
    // });
    await prisma.raportLink.create({
      data: {
        raportId: raport.id,
        code: name,
        registrations: { connect: [{ id }] },
      },
    });

    fs.writeFileSync(filePath, buffer);
    // Return the file as a response
    // return res.download(filePath, "report.docx", (err) => {
    //   if (err) {
    //     console.error("Error sending file:", err);
    //     return res.status(500).json({
    //       code: 500,
    //       message: "Error sending file",
    //       error: err.message,
    //     });
    //   }
    // });
    return res.status(200).json({
      code: 200,
      message: "Document generated and saved successfully",
      link: SERVER_URL + "/api/v1/download/" + randomFileName,
    });
  } catch (error) {
    console.log(error);
    console.error("Error generating report:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {

  }
};

exports.generateUPK = async (req, res) => {
  try {
    const {
      id,
      code,
      name = "AVR",
      passport,
      residence,
      time_period,
      signListIds,
      raport_data = new Date(),
    } = req.body;

    // if(typeof name !== "string"){
    //   return res.status(400).json({ code: 400, message: "Name must be a string" });
    // }

    // const typeList = name.split(",");

    // Fetch data from database based on IDs
    let data = await prisma.registration.findUnique({
      where: { id },
      include: {
        Initiator: {
          select: {
            first_name: true,
            last_name: true,
            father_name: true,
          },
        },
        executor: {
          select: {
            first_name: true,
            last_name: true,
            father_name: true,
          },
        },
      },
    });

    if (!data) {
      data = await prisma.relatives.findUnique({
        where: { id },
        include: {
          Initiator: {
            select: {
              first_name: true,
              last_name: true,
              father_name: true,
            },
          },
          executor: {
            select: {
              first_name: true,
              last_name: true,
              father_name: true,
            },
          },
        },
      });

      if (!data) {
        return res.status(404).json({ code: 404, message: "data not found" });
      }
    }

    if (!signListIds || signListIds?.length === 0) {
      return res
        .status(404)
        .json({ code: 404, message: "signListIds not found" });
    }

    const signList = await prisma.signList.findMany({
      where: {
        id: { in: signListIds },
      },
    });

    if (!signList) {
      return res.status(404).json({ code: 404, message: "signList not found" });
    }

    const signListData = signList.map((item) => {
      const name =
        (item?.lastName ? item?.lastName + " " : "") +
        "" +
        (item?.firstName ? item?.firstName.slice(0, 1) + "." : "") +
        "" +
        (item?.fatherName ? item?.fatherName.slice(0, 1) + "." : "");
      const position = item?.position ? item?.position : "";
      return {
        name: name,
        position: position,
      };
    });

    let raportDate = raport_data ? new Date(raport_data) : new Date();
    if (isNaN(raportDate.getTime())) {
      return res
        .status(400)
        .json({ code: 400, message: "Invalid raport_data" });
    }
    const formattedDate = raportDate
      .toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
      .replace("г.", "г");

    const executor =
      (data?.executor?.last_name ? data?.executor?.last_name + " " : "") +
      (data?.executor?.first_name
        ? data?.executor?.first_name.slice(0, 1) + "."
        : "") +
      (data?.executor?.father_name
        ? data?.executor?.father_name.slice(0, 1) + "."
        : "");
    const executor_phone = data?.executor?.phone ? data?.executor?.phone : "";
    const initiator =
      (data?.Initiator?.last_name ? data?.Initiator?.last_name + " " : "") +
      (data?.Initiator?.first_name
        ? data?.Initiator?.first_name.slice(0, 1) + "."
        : "") +
      (data?.Initiator?.father_name
        ? data?.Initiator?.father_name.slice(0, 1) + "."
        : "");
    // Create a new document
    const formattedBirthDate = data?.birthDate
      ? safeString(new Date(data?.birthDate).getFullYear())
      : "";

    const documents = [];

    const raportTypes = await selectRaportTypesByCodeOrFallback({ code, name });

    if (!raportTypes?.length) {
      return res
        .status(404)
        .json({ code: 404, message: "raport type not found" });
    }

    raportTypes.map((raportType) => {
      documents.push(
        generateUPK(
          raportType?.name,
          raportType?.organization,
          data?.firstName,
          data?.lastName,
          data?.fatherName,
          formattedBirthDate,
          data?.birthPlace,
          data?.residence,
          data?.workplace
            ? data?.workplace
            : "" + data?.position
              ? data?.position
              : "",
          data?.notes ? "к/м" : "",
          raportType?.requested_organization,
          formattedDate,
          executor,
          executor_phone,
          initiator,
          data?.regNumber ? data?.regNumber : "",
          signListData,
          passport ? passport : "",
          residence ? residence : "",
          time_period ? time_period : ""
        )
      );
    });

    // Ikkala hujjatning bo'limlarini birlashtirish
    const combinedDoc = buildCombinedDocument(documents);
    if (!combinedDoc) {
      return res.status(404).json({
        code: 404,
        message: "No matching raport templates found",
      });
    }
    // Hujjat buferini yaratish
    const buffer = await Packer.toBuffer(combinedDoc);

    // Tasodifiy nom yaratish
    const randomFileName = `${uuidv4()}.docx`;
    const filePath = path.join(__dirname, "../../uploads", randomFileName);

    const raport = await prisma.raport.create({
      data: {
        name: name,
        executorId: req.userId,
        link: SERVER_URL + "/api/v1/download/" + randomFileName,
        notes: "",
      },
    });

    const registration = await prisma.registration.findUnique({
      where: { id },
    });
    // const code = registration?.regNumber + " " + "ф-" + registration?.form_reg;
    // console.log(code);

    // await prisma.registration.update({
    //   where: { id },
    //   data: {
    //     accessStatus: "ПРОВЕРКА",
    //     completeStatus: "COMPLETED",
    //     expired: null,
    //     conclusionRegNum: code,
    //     expiredDate: null,
    //   },
    // });
    await prisma.raportLink.create({
      data: {
        raportId: raport.id,
        code: name,
        registrations: { connect: [{ id }] },
      },
    });

    fs.writeFileSync(filePath, buffer);
    // Return the file as a response
    // return res.download(filePath, "report.docx", (err) => {
    //   if (err) {
    //     console.error("Error sending file:", err);
    //     return res.status(500).json({
    //       code: 500,
    //       message: "Error sending file",
    //       error: err.message,
    //     });
    //   }
    // });
    return res.status(200).json({
      code: 200,
      message: "Document generated and saved successfully",
      link: SERVER_URL + "/api/v1/download/" + randomFileName,
    });
  } catch (error) {
    console.log(error);
    console.error("Error generating report:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {

  }
};

exports.generateMalumotnoma = async (req, res) => {
  try {
    const { id, name, code, raport_data = new Date(), signListIds } = req.body;

    if (!signListIds || signListIds?.length === 0) {
      return res
        .status(404)
        .json({ code: 404, message: "signListIds not found" });
    }

    const signList = (
      await Promise.all(
        signListIds.map((signListId) =>
          prisma.signList.findUnique({ where: { id: signListId } })
        )
      )
    ).filter(Boolean);

    if (!signList.length) {
      return res.status(404).json({ code: 404, message: "signList not found" });
    }

    const signListData = signList.map((item) => {
      const name =
        (item?.lastName ? item?.lastName + " " : "") +
        "" +
        (item?.firstName ? item?.firstName.slice(0, 1) + "." : "") +
        "" +
        (item?.fatherName ? item?.fatherName.slice(0, 1) + "." : "");
      const position = item?.position ? item?.position : "";
      return {
        name: name,
        position: position,
      };
    });

    // if(typeof name !== "string"){
    //   return res.status(400).json({ code: 400, message: "Name must be a string" });
    // }

    // const typeList = name.split(",");

    // Fetch data from database based on IDs
    let data = await prisma.registration.findUnique({
      where: { id },
      include: {
        Initiator: {
          select: {
            first_name: true,
            last_name: true,
            father_name: true,
          },
        },
        executor: {
          select: {
            first_name: true,
            last_name: true,
            father_name: true,
          },
        },
      },
    });

    if (!data) {
      data = await prisma.relatives.findUnique({
        where: { id },
        include: {
          Initiator: {
            select: {
              first_name: true,
              last_name: true,
              father_name: true,
            },
          },
          executor: {
            select: {
              first_name: true,
              last_name: true,
              father_name: true,
            },
          },
        },
      });

      if (!data) {
        return res.status(404).json({ code: 404, message: "data not found" });
      }
    }

    let raportDate = raport_data ? new Date(raport_data) : new Date();
    if (isNaN(raportDate.getTime())) {
      return res
        .status(400)
        .json({ code: 400, message: "Invalid raport_data" });
    }
    const formattedDate = raportDate
      .toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
      .replace("г.", "г");

    const formattedRegEndDate = new Date(data?.regEndDate)
      .toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })

      .replace("г.", "г");

    const executor =
      (data?.executor?.last_name ? data?.executor?.last_name + " " : "") +
      (data?.executor?.first_name
        ? data?.executor?.first_name.slice(0, 1) + "."
        : "") +
      (data?.executor?.father_name
        ? data?.executor?.father_name.slice(0, 1) + "."
        : "");
    const executor_phone = data?.executor?.phone ? data?.executor?.phone : "";
    const initiator =
      (data?.Initiator?.last_name ? data?.Initiator?.last_name + " " : "") +
      (data?.Initiator?.first_name
        ? data?.Initiator?.first_name.slice(0, 1) + "."
        : "") +
      (data?.Initiator?.father_name
        ? data?.Initiator?.father_name.slice(0, 1) + "."
        : "");
    // Create a new document

    const formattedBirthDate = data?.birthDate
      ? safeString(new Date(data.birthDate).getFullYear())
      : "";

    const raportTypes = await selectRaportTypesByCodeOrFallback({ code, name });

    if (!raportTypes?.length) {
      return res
        .status(404)
        .json({ code: 404, message: "raport type not found" });
    }

    const documents = [];

    const type_of_raport =
      name === "type8"
        ? "Рухсатнома рад этилганлиги туғрисида билдиришнома (уведомление об ОТКАЗЕ в допуске)"
        : "Рухсатнома берилгани туғрисида маълумотнома (справка о наличии допуска)";

    console.log(formattedRegEndDate);

    raportTypes.map((raportType) => {
      documents.push(
        generateMalumotnoma(
          data?.form_reg,
          formattedRegEndDate,
          type_of_raport,
          raportType?.name,
          raportType?.organization,
          data?.firstName,
          data?.lastName,
          data?.fatherName,
          formattedBirthDate,
          data?.birthPlace,
          data?.residence,
          data?.workplace
            ? data?.workplace
            : "" + data?.position
              ? data?.position
              : "",
          data?.notes ? "к/м" : "",
          raportType?.requested_organization,
          formattedDate,
          executor,
          executor_phone,
          initiator,
          data?.regNumber ? data?.regNumber : "",
          signListData,
          raportType?.signed_fio,
          raportType?.signed_position
        )
      );
    });

    // Ikkala hujjatning bo'limlarini birlashtirish
    const combinedDoc = buildCombinedDocument(documents);
    if (!combinedDoc) {
      return res.status(404).json({
        code: 404,
        message: "No matching raport templates found",
      });
    }
    // Hujjat buferini yaratish
    const buffer = await Packer.toBuffer(combinedDoc);

    // Tasodifiy nom yaratish
    const randomFileName = `${uuidv4()}.docx`;
    const filePath = path.join(__dirname, "../../uploads", randomFileName);

    const raport = await prisma.raport.create({
      data: {
        name: name,
        executorId: req.userId,
        link: SERVER_URL + "/api/v1/download/" + randomFileName,
        notes: "",
      },
    });

    // const registration = await prisma.registration.findUnique({
    //   where: { id },
    // });
    // const code = registration?.regNumber + " " + "ф-" + registration?.form_reg;
    // console.log(code);

    // await prisma.registration.update({
    //   where: { id },
    //   data: {
    //     accessStatus: "ПРОВЕРКА",
    //     completeStatus: "COMPLETED",
    //     expired: null,
    //     conclusionRegNum: code,
    //     expiredDate: null,
    //   },
    // });
    await prisma.raportLink.create({
      data: {
        code: name,
        raport: { connect: { id: raport.id } },
        registrations: { connect: { id } },
      },
    });

    fs.writeFileSync(filePath, buffer);
    // Return the file as a response
    // return res.download(filePath, "report.docx", (err) => {
    //   if (err) {
    //     console.error("Error sending file:", err);
    //     return res.status(500).json({
    //       code: 500,
    //       message: "Error sending file",
    //       error: err.message,
    //     });
    //   }
    // });
    return res.status(200).json({
      code: 200,
      message: "Document generated and saved successfully",
      link: SERVER_URL + "/api/v1/download/" + randomFileName,
    });
  } catch (error) {
    console.log(error);
    console.error("Error generating report:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {

  }
};

//api for list of relativies OSU SGB MVD tre types of raports
/**
 * @swagger
 * /api/v1/raport/:
 *   post:
 *     summary: "IDlar massivi asosida hujjat yaratish"
 *     tags: [Report]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ids:
 *                 type: array
 *                 example: ["1", "2", "3"]
 *               name:
 *                 type: string
 *                 example: "type 1,type 2"
 *               raport_data:
 *                 type: string
 *                 default: "2019-05-02 05:00:00"
 *     responses:
 *       200:
 *         description: "Hujjat muvaffaqiyatli yaratildi va saqlandi"
 *       400:
 *         description: "Xato: IDlar talab qilinadi"
 *       500:
 *         description: "Ichki server xatosi"
 */
exports.generateRelativeList = async (req, res) => {
  try {
    const {
      name = "type11",
      raport_data = new Date(),
      type = "SESSION",
      signListIds,
    } = req.body;

    let { ids } = req.body;

    if (!Array.isArray(ids)) {
      return res
        .status(400)
        .json({ code: 400, message: "Ids must be an array" });
    }

    // If no ids provided, fall back to sessions by type
    if (ids.length <= 0) {
      const sessions = await prisma.session.findMany({
        where: { type: type, adminId: req.userId },
        select: { registrationId: true },
      });
      ids = sessions.map((s) => s.registrationId).filter(Boolean);

      if (ids.length === 0) {
        return res
          .status(404)
          .json({ code: 404, message: "No sessions found for the given type" });
      }
    }

    // Fetch data from both tables concurrently
    const [relativesData, registrationData] = await Promise.all([
      prisma.relatives.findMany({
        where: { id: { in: ids } },
        include: {
          Initiator: {
            select: {
              first_name: true,
              last_name: true,
              father_name: true,
            },
          },
          executor: {
            select: {
              first_name: true,
              last_name: true,
              father_name: true,
            },
          },
        },
      }),
      prisma.registration.findMany({
        where: { id: { in: ids } },
        include: {
          Initiator: {
            select: {
              first_name: true,
              last_name: true,
              father_name: true,
            },
          },
          executor: {
            select: {
              first_name: true,
              last_name: true,
              father_name: true,
            },
          },
        },
      }),
    ]);

    // Combine the results
    const combinedResults = [...registrationData, ...relativesData];

    // Return a 404 if no data found in either table
    if (!combinedResults.length) {
      return res
        .status(404)
        .json({ code: 404, message: "registration not found" });
    }

    const raportData = [];
    const formattedDate = formatDate(raport_data) + "г.";
    const admin = await prisma.admin.findUnique({
      where: { id: req.userId },
    });
    const admin_fullname = `${admin?.last_name ? admin?.last_name : ""}${admin?.first_name ? " " + admin?.first_name.slice(0, 1) + "." : ""
      }${admin?.father_name ? " " + admin?.father_name.slice(0, 1) + "." : ""}`;
    combinedResults.map((data) => {
      const executor = `${data?.executor?.last_name ? data?.executor?.last_name : ""
        }${data?.executor?.first_name ? " " + data?.executor?.first_name : ""}${data?.executor?.father_name ? " " + data?.executor?.father_name : ""
        }`;
      const executor_phone = data?.executor?.phone ? data?.executor?.phone : "";
      const initiator = `${data?.Initiator?.last_name ? data?.Initiator?.last_name : ""
        }${data?.Initiator?.first_name ? " " + data?.Initiator?.first_name : ""}${data?.Initiator?.father_name ? " " + data?.Initiator?.father_name : ""
        }`;

      raportData.push({
        executor,
        executor_phone,
        initiator,
        birthDate: data?.birthDate
          ? formatDate(data?.birthDate)
          : data?.birthYear,
        raport_date: formattedDate,
        fullName:
          data?.lastName + " " + data?.firstName + " " + data?.fatherName,
        regNumber: data?.regNumber,
        birthPlace: data?.birthPlace,
        residence: data?.residence,
      });
    });

    if (signListIds?.length === 0) {
      return res
        .status(404)
        .json({ code: 404, message: "signListIds not found" });
    }

    const signList = await prisma.signList.findMany({
      where: {
        id: { in: signListIds },
      },
    });

    if (!signList) {
      return res.status(404).json({ code: 404, message: "signList not found" });
    }

    const executorList = signList.map((item) => {
      const name =
        (item?.lastName ? item?.lastName + " " : "") +
        "" +
        (item?.firstName ? item?.firstName.slice(0, 1) + "." : "") +
        "" +
        (item?.fatherName ? item?.fatherName.slice(0, 1) + "." : "");
      const position = item?.position ? item?.position : "";
      return {
        name: name,
        position: position,
      };
    });

    const raportTypes = await getRaportTypesByLinksRaw(["type1", "type2", "type3"]);

    const documents = [];
    for (let i = 0; i < raportTypes?.length; i++) {
      if (raportTypes[i]?.link.includes("type1")) {
        documents.push(
          generateMVD_SGB_USParray(
            admin_fullname,
            admin?.phone ? admin?.phone : "",
            raportTypes[i]?.organization,
            raportTypes[i]?.requested_organization,
            formattedDate,
            raportData,
            "type1",
            executorList
          )
        );
      } else if (raportTypes[i]?.link.includes("type2")) {
        documents.push(
          generateMVD_SGB_USParray(
            admin_fullname,
            admin?.phone ? admin?.phone : "",
            raportTypes[i]?.organization,
            raportTypes[i]?.requested_organization,
            formattedDate,
            raportData,
            "type2",
            executorList
          )
        );
      } else if (raportTypes[i]?.link.includes("type3") && false) {
        documents.push(
          generatePsychoRaport(
            raportTypes[i]?.organization,
            data?.firstName,
            data?.lastName,
            data?.fatherName,
            formattedBirthDate,
            data?.birthPlace,
            data?.residence,
            raportTypes[i]?.requested_organization,
            formattedDate,
            executor,
            executor_phone,
            initiator,
            data?.regNumber ? data?.regNumber : "",
            raportTypes[i]?.notes ? raportTypes[i]?.notes : ""
          )
        );
      }
    }

    // Ikkala hujjatning bo'limlarini birlashtirish
    const combinedDoc = new Document({
      sections: [
        ...(documents[0]?.sections ? documents[0]?.sections : []),
        // {
        //   properties: {},
        //   children: [
        //     new Paragraph({ children: [new TextRun({ break: 2 })] }), // Page break
        //   ],
        // },
        ...(documents[1]?.sections ? documents[1]?.sections : []),
        // {
        //   properties: {},
        //   children: [
        //     new Paragraph({ children: [new TextRun({ break: 2 })] }), // Page break
        //   ],
        // },
        ...(documents[2]?.sections ? documents[2]?.sections : []),
      ],
    });
    // Hujjat buferini yaratish
    const buffer = await Packer.toBuffer(combinedDoc);

    // Tasodifiy nom yaratish
    const randomFileName = `${uuidv4()}.docx`;
    const filePath = path.join(__dirname, "../../uploads", randomFileName);

    // Save the document to the file system
    const raport = await prisma.raport.create({
      data: {
        name: name,
        executorId: req.userId,
        link: SERVER_URL + "/api/v1/download/" + randomFileName,
        notes: "",
      },
    });

    registrationData[0]?.id &&
      (await prisma.raportLink.create({
        data: {
          raportId: raport.id,
          code: name,
          registrations: {
            connect: registrationData[0]?.id
              ? [{ id: registrationData[0]?.id }]
              : [],
          },
        },
      }));

    fs.writeFileSync(filePath, buffer);
    return res.status(200).json({
      code: 200,
      message: "Document generated and saved successfully",
      link: SERVER_URL + "/api/v1/download/" + randomFileName,
    });
  } catch (error) {
    console.log(error);
    console.error("Error generating report:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {

  }
};

function formatDate(date) {
  return new Date(date).getFullYear();
}

//progress
function generateConclusionDocx(outputPath = "ф-4 заключение.docx", data = {}) {
  const {
    leftHeader = "бш-1",
    rightHeader = "Секретно \n Экз.№_",
    rightHeader2 = "У Т В Е Р Ж Д А Ю",
    approverTitle = "Руководитель",
    position = "Должность",
    sign = "подпись",
    fio = "Ф.И.О.",
    monthLabel = "24 - июля", // месяц
    year = 2025,
    heading = "Заключение",
    intro1 = "Текст вводится самостоятельно:",
    person = [
      {
        fullName: "Хамроев Хамро Хамроевич",
        roleLabel: "должность",
        dob: "24.08.1972",
        birthplace: "Самаркандской области",
        noteLabel: "компрометирующая информация",
        workplace: "г. Самара",
      },
    ],
    intro2 = "Текст вводится самостоятельно.",
    // Multiline agreed block (each line separated by \n)
    agreedLabel = [
      "«СОГЛАСОВАНО»\nА.Ахмадов\n«____» июля 2025 года",
      "«СОГЛАСОВАНО»\nА.Ахмадов\n«____» июля 2025 года",
    ],
    operator = {
      data: "Оператор подразделения",
      rank: "Должность",
      data1: "А.Ахмадов",
      time: "«____» июля 2025 года",
    },
    head = {
      data: "Начальник подразделения",
      to_position: "Должность",
      data1: "А.Ахмадов",
      time: "«____» июля 2025 года",
    },
    underline = true,
    highlight = false, // allow disabling highlights
    recordNumbers = "",
  } = data;

  const noBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  };

  // Helper creators enforcing 14pt (28 half-points) font
  const p = (children, opts = {}) =>
    new Paragraph({
      children: Array.isArray(children) ? children : [children],
      ...opts,
    });
  const t = (text, opts = {}) =>
    new TextRun({ text, size: 28, font: "Times New Roman", ...opts });

  // Header (left/right)
  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: noBorders,
            children: [p([t(leftHeader)])],
          }),
          new TableCell({
            borders: noBorders,
            children: rightHeader
              .split(/\r?\n/)
              .map((line) =>
                p([t(line.trim())], { alignment: AlignmentType.RIGHT })
              ),
          }),
        ],
      }),
    ],
  });


  // Approval labels (звание / подпись / Ф.И.О.)
  const approvalLabelsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    alignment: AlignmentType.LEFT,
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          // new TableCell({
          //   borders: noBorders,
          //   children: [
          //     p(
          //       [
          //         t(position, {
          //           // bold: true,
          //           // italics: true,
          //           // underline: underline ? {} : undefined,
          //         }),
          //       ],
          //       { alignment: AlignmentType.LEFT }
          //     ),
          //   ],
          // }),
          new TableCell({
            borders: noBorders,
            children: [
              p(
                [
                  t("    ", {
                    // bold: true,
                    // underline: underline ? {} : undefined,
                  }),
                ],
                { alignment: AlignmentType.LEFT }
              ),
            ],
          }),
          // new TableCell({
          //   borders: noBorders,
          //   children: [
          //     p(
          //       [t(fio, {
          //         bold: true,
          //         underline: underline ? {} : undefined 
          //       })],
          //       { alignment: AlignmentType.RIGHT }
          //     ),
          //   ],
          // }),
        ],
      }),
    ],
  });

  // Table wrapping approval block (left empty, right content) with transparent borders
  const approvalHeaderTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: noBorders,
            children: [p([t("", { bold: true })])], // left column intentionally blank
            width: { size: 40, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            borders: noBorders,
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              p([t(rightHeader2, { bold: true })], {
                alignment: AlignmentType.CENTER,
              }),
              p([t(approverTitle, { bold: true })], {
                alignment: AlignmentType.JUSTIFIED,
              }),
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: noBorders,
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        borders: noBorders,
                        children: [
                          p([t(position.split(",")[0], { bold: true })], {
                            alignment: AlignmentType.LEFT,
                          }),
                        ],
                      }),
                      new TableCell({
                        borders: noBorders,
                        children: [
                          p([t(position.split(",")[1], { bold: true })], {
                            alignment: AlignmentType.RIGHT,
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              // approvalLabelsTable,
              // Labels table before date line
              p(
                [
                  t(monthLabel, {
                    bold: true,
                    // underline: underline ? {} : undefined,
                  }),
                  t(" ", { bold: true }),
                  t(`${year} года`, { bold: true }),
                ],
                { alignment: AlignmentType.LEFT }
              ),
            ],
          }),
        ],
      }),
    ],
  });

  const highlightValue = highlight ? "yellow" : undefined;

  const personParagraphs = person?.flatMap((person) => [
    p(
      [
        t(`${person.fullName}, `, {
          bold: true,
          underline: underline ? {} : undefined,
          highlight: highlightValue,
        }),
        // t("(", {}),
        // t(person.roleLabel, {
        //   underline: underline ? {} : undefined,
        //   highlight: highlightValue,
        // }),
        // t("),  "),
        t(person.dob, {
          underline: underline ? {} : undefined,
          highlight: highlightValue,
        }),
        t(" г.р., уроженец "),
        t(person.birthplace),
        t(", прописан и проживает по адресу: "),
        t(person.residence),
        t(`, (${person.workplace}), `),
      ],
      { alignment: AlignmentType.JUSTIFIED, indent: { left: 2880 } }
    ),
    p([
      t("получена информация: "),
      t(person.noteLabel, {
        italics: false,
      }),
      t(".")
    ], { alignment: AlignmentType.JUSTIFIED, indent: { left: 0 } }
    )
  ])

  // Main paragraphs
  const paragraphs = [
    p([t(rightHeader2, { bold: true })], { alignment: AlignmentType.RIGHT }),
    p([t(approverTitle, { bold: true })], { alignment: AlignmentType.RIGHT }),
    p(
      [
        t("«___»", { bold: true }),
        t(" "),
        t(monthLabel, { bold: true, underline: underline ? {} : undefined }),
        t(" "),
        t(`${year} года`, { bold: true }),
      ],
      { alignment: AlignmentType.RIGHT }
    ),
    p([t(heading, { bold: true })], { alignment: AlignmentType.CENTER }),
    // First line indent only (720 twips ≈ 0.5 inch)
    p([t(intro1)], { indent: { firstLine: 720 } }),
    personParagraphs,
    p([t(intro2)], {
      alignment: AlignmentType.JUSTIFIED,
      // spacing: { before: 100 },
      indent: { firstLine: 720 },
    }),
  ];

  // Operator / Chief table
  const operatorChiefTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: noBorders,
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              ...(operator.data.includes(',')
                ? operator.data.split(',').map(part =>
                  p([t(part.trim(), { bold: true })], {
                    // spacing: { after: 50 },
                  })
                )
                : [p([t(operator.data, { bold: true })], {
                  // spacing: { after: 50 },
                })]
              ),
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: noBorders,
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        borders: noBorders,
                        children: [
                          p([t(operator.rank, { bold: true })], {
                            alignment: AlignmentType.LEFT,
                          }),
                        ],
                      }),
                      new TableCell({
                        borders: noBorders,
                        children: [
                          p([t(operator.data1, { bold: true })], {
                            alignment: AlignmentType.RIGHT,
                            indent: { right: 280 },
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              p([t(operator.time, { bold: false })], {
                // spacing: { after: 50 },
              }),
            ],
          }),
          new TableCell({
            borders: noBorders,
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              ...(head.data.includes(',')
                ? head.data.split(',').map(part =>
                  p([t(part.trim(), { bold: true })], {
                    // spacing: { after: 50 },
                  })
                )
                : [p([t(head.data, { bold: true })], {
                  // spacing: { after: 50 },
                })]
              ),
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: noBorders,
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        borders: noBorders,
                        children: [
                          p([t(head.rank, { bold: true })], {
                            alignment: AlignmentType.LEFT,
                          }),
                        ],
                      }),
                      new TableCell({
                        borders: noBorders,
                        children: [
                          p([t(head.data1, { bold: true })], {
                            alignment: AlignmentType.RIGHT,
                            indent: { right: 280 },
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              p([t(head.time, { bold: false })], {
                // spacing: { after: 50 },
              }),
            ],
          }),
          // new TableCell({
          //   borders: noBorders,
          //   width: { size: 50, type: WidthType.PERCENTAGE },
          //   children: [
          //     p([t(head.data, { bold: true })], { spacing: { after: 100 } }),
          //     p([t(head.rank, { bold: true })], { spacing: { after: 100 } }),
          //     p([t(head.data1, { bold: true })], { spacing: { after: 100 } }),
          //     p([t(head.time, { bold: false })], { spacing: { after: 100 } }),
          //   ],
          // }),
        ],
      }),
    ],
  });

  // Agreed block: accept either a string (multiline) or an array of multiline strings.
  const agreedBlockSource = Array.isArray(agreedLabel)
    ? agreedLabel
    : [agreedLabel];
  const agreedBlock = agreedBlockSource
    .filter((blk) => blk !== undefined && blk !== null)
    .flatMap((blk) =>
      String(blk)
        .replace(/\r/g, "")
        .split("\n")
        .map((line, idx) =>
          p([t(line, !line.includes('года') ? { bold: true } : {})], {
            // 1.5 line spacing (approx). Removed lineRule to avoid undefined error.
            spacing: { line: 280, before: idx === 0 ? 0 : 0, after: 0 },
          })
        )
    );

  // Date + note table
  const agreeNoteTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: noBorders,
            // Note: size must be set on TextRun (half-points). 10pt => size:20
            children: [
              p([t(`(${recordNumbers})`, { size: 20 })], {
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        ],
      }),
    ],
  });

  // Build ordered children for single section
  const children = [
    headerTable,
    p([t("")]),
    approvalHeaderTable,
    p([t("")]),
    paragraphs[3], // heading
    paragraphs[4], // intro1
    ...(paragraphs[5] || []), // person lines (flatten array safely)
    p([t("")]),
    operatorChiefTable,
    p([t("")]),
    paragraphs[6], // intro2
    p([t("")]),
    ...agreedBlock, // each line from agreedLabel (string or array) already split into bold paragraphs
    agreeNoteTable,
    // p([t(poemHint)])
  ];

  return {
    sections: [
      {
        properties: {
          page: {
            // Margins per layout: Top 1.5 cm, Bottom 1.5 cm, Right 1.5 cm, Left 3 cm
            // 1 cm ≈ 566.93 twips -> 1.5 cm ≈ 850; 3 cm ≈ 1701
            margin: { top: 850, bottom: 850, left: 1701, right: 850 },
          },
        },
        children,
      },
    ],
  };
}

//progress
function generateConclusionDocxF4(outputPath = "ф-4 заключение.docx", data = {}) {
  const {
    leftHeader = "бш-1",
    rightHeader = "Секретно \n Экз.№_",
    rightHeader2 = "У Т В Е Р Ж Д А Ю",
    approverTitle = "Руководитель",
    position = "Должность",
    sign = "подпись",
    fio = "Ф.И.О.",
    monthLabel = "24 - июля", // месяц
    year = 2025,
    heading = "Заключение",
    intro1 = "Текст вводится самостоятельно:",
    person = [
      {
        fullName: "Хамроев Хамро Хамроевич",
        roleLabel: "должность",
        dob: "24.08.1972",
        birthplace: "Самаркандской области",
        noteLabel: "компрометирующая информация",
      },
    ],
    intro2 = "Текст вводится самостоятельно.",
    // Multiline agreed block (each line separated by \n)
    agreedLabel = [
      "«СОГЛАСОВАНО»\nРуководитель\nА.Ахмадов\n«____» июля 2025 года",
      "«СОГЛАСОВАНО»\nРуководитель\nА.Ахмадов\n«____» июля 2025 года",
    ],
    operator = {
      data: "Оператор подразделения",
      rank: "Должность",
      data1: "А.Ахмадов",
      time: "«____» июля 2025 года",
    },
    head = {
      data: "Начальник подразделения",
      to_position: "Должность",
      data1: "А.Ахмадов",
      time: "«____» июля 2025 года",
    },
    underline = true,
    highlight = false, // allow disabling highlights
    recordNumber = "",
  } = data;

  const noBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  };

  // Helper creators enforcing 14pt (28 half-points) font
  const p = (children, opts = {}) =>
    new Paragraph({
      children: Array.isArray(children) ? children : [children],
      ...opts,
    });
  const t = (text, opts = {}) =>
    new TextRun({ text, size: 28, font: "Times New Roman", ...opts });

  // Header (left/right)
  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: noBorders,
            children: [p([t(leftHeader)])],
          }),
          new TableCell({
            borders: noBorders,
            children: rightHeader
              .split(/\r?\n/)
              .map((line) =>
                p([t(line.trim())], { alignment: AlignmentType.RIGHT })
              ),
          }),
        ],
      }),
    ],
  });

  // Table wrapping approval block (left empty, right content) with transparent borders
  const approvalHeaderTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: noBorders,
            children: [p([t("", { bold: true })])], // left column intentionally blank
            width: { size: 40, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            borders: noBorders,
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              p([t(rightHeader2, { bold: true })], {
                alignment: AlignmentType.CENTER,
              }),
              p([t(approverTitle, { bold: true })], {
                alignment: AlignmentType.JUSTIFIED,
              }),
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: noBorders,
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        borders: noBorders,
                        children: [
                          p([t(position.split(",")[0], { bold: true })], {
                            alignment: AlignmentType.LEFT,
                          }),
                        ],
                      }),
                      new TableCell({
                        borders: noBorders,
                        children: [
                          p([t(position.split(",")[1], { bold: true })], {
                            alignment: AlignmentType.RIGHT,
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              // approvalLabelsTable,
              // Labels table before date line
              p(
                [
                  t(monthLabel, {
                    bold: true,
                    // underline: underline ? {} : undefined,
                  }),
                  t(" ", { bold: true }),
                  t(`${year} года`, { bold: true }),
                ],
                { alignment: AlignmentType.LEFT }
              ),
            ],
          }),
        ],
      }),
    ],
  });

  const highlightValue = highlight ? "yellow" : undefined;

  // Main paragraphs
  const paragraphs = [
    p([t(rightHeader2, { bold: true })], { alignment: AlignmentType.RIGHT }),
    p([t(approverTitle, { bold: true })], { alignment: AlignmentType.RIGHT }),
    p(
      [
        t("«___»", { bold: true }),
        t(" "),
        t(monthLabel, { bold: true, underline: underline ? {} : undefined }),
        t(" "),
        t(`${year} года`, { bold: true }),
      ],
      { alignment: AlignmentType.RIGHT }
    ),
    p([t(heading, { bold: true })], { alignment: AlignmentType.CENTER }),
  ];

  // Person paragraphs (intro1 + person details for each person)
  const personParagraphs = person?.flatMap((person, idx) => [
    p(
      [
        t(`${idx + 1}.${person.fullName} `, {
          bold: true,
          underline: underline ? {} : undefined,
          highlight: highlightValue,
        }),
        t("(", {}),
        t(person.roleLabel, {
          underline: underline ? {} : undefined,
          highlight: highlightValue,
        }),
        t("),  "),
        t(person.dob, {
          underline: underline ? {} : undefined,
          highlight: highlightValue,
        }),
        t(" г.р., уроженец "),
        t(person.birthplace),
        t(", по полученным данным: "),
        t(person.noteLabel, {
          italics: false,
        }),
        t("."),
      ],
      { alignment: AlignmentType.JUSTIFIED, indent: { firstLine: 720 } }
    ),
    p([t(intro2)], {
      alignment: AlignmentType.JUSTIFIED,
      spacing: { before: 100, after: 100 },
      indent: { firstLine: 720 },
    }),
  ]) || [];

  const intro2Paragraph = p([t(intro2)], {
    alignment: AlignmentType.JUSTIFIED,
    spacing: { before: 100 },
    indent: { firstLine: 720 },
  });

  // Operator / Chief table
  const operatorChiefTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: noBorders,
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              ...(operator.data.includes(',')
                ? operator.data.split(',').map(part =>
                  p([t(part.trim(), { bold: true })], {
                    // spacing: { after: 50 },
                  })
                )
                : [p([t(operator.data, { bold: true })], {
                  // spacing: { after: 50 },
                })]
              ),
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: noBorders,
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        borders: noBorders,
                        children: [
                          p([t(operator.rank, { bold: true })], {
                            alignment: AlignmentType.LEFT,
                          }),
                        ],
                      }),
                      new TableCell({
                        borders: noBorders,
                        children: [
                          p([t(operator.data1, { bold: true })], {
                            alignment: AlignmentType.RIGHT,
                            indent: { right: 280 },
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              p([t(operator.time, { bold: false })], {
                // spacing: { after: 50 },
              }),
            ],
          }),
          new TableCell({
            borders: noBorders,
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              ...(head.data.includes(',')
                ? head.data.split(',').map(part =>
                  p([t(part.trim(), { bold: true })], {
                    // spacing: { after: 50 },
                  })
                )
                : [p([t(head.data, { bold: true })], {
                  // spacing: { after: 50 },
                })]
              ),
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: noBorders,
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        borders: noBorders,
                        children: [
                          p([t(head.rank, { bold: true })], {
                            alignment: AlignmentType.LEFT,
                          }),
                        ],
                      }),
                      new TableCell({
                        borders: noBorders,
                        children: [
                          p([t(head.data1, { bold: true })], {
                            alignment: AlignmentType.RIGHT,
                            indent: { right: 280 },
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              p([t(head.time, { bold: false })], {
                // spacing: { after: 50 },
              }),
            ],
          }),
          // new TableCell({
          //   borders: noBorders,
          //   width: { size: 50, type: WidthType.PERCENTAGE },
          //   children: [
          //     p([t(head.data, { bold: true })], { spacing: { after: 100 } }),
          //     p([t(head.rank, { bold: true })], { spacing: { after: 100 } }),
          //     p([t(head.data1, { bold: true })], { spacing: { after: 100 } }),
          //     p([t(head.time, { bold: false })], { spacing: { after: 100 } }),
          //   ],
          // }),
        ],
      }),
    ],
  });

  // Agreed block: accept either a string (multiline) or an array of multiline strings.
  const agreedBlockSource = Array.isArray(agreedLabel)
    ? agreedLabel
    : [agreedLabel];
  const agreedBlock = agreedBlockSource
    .filter((blk) => blk !== undefined && blk !== null)
    .flatMap((blk) =>
      String(blk)
        .replace(/\r/g, "")
        .split("\n")
        .map((line, idx) =>
          p([t(line, { bold: true })], {
            // 1.5 line spacing (approx). Removed lineRule to avoid undefined error.
            spacing: { line: 280, before: idx === 0 ? 0 : 0, after: 0 },
          })
        )
    );

  // Date + note table
  const agreeNoteTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: noBorders,
            // Note: size must be set on TextRun (half-points). 10pt => size:20
            children: [
              p([t(`(${recordNumber})`, { size: 20 })], {
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        ],
      }),
    ],
  });

  // Build ordered children for single section
  const children = [
    headerTable,
    p([t("")]),
    approvalHeaderTable,
    p([t("")]),
    paragraphs[3], // heading
    p([t(intro1)], {
      indent: { firstLine: 720 }, spacing: {
        before: 60,  // Tepadan bo'shliq
        after: 60    // Pastdan bo'shliq
      }
    }),
    ...personParagraphs, // person lines with intro1 for each person
    // intro2Paragraph, // intro2
    p([t("")]),
    operatorChiefTable,
    p([t("")]),
    ...agreedBlock, // each line from agreedLabel (string or array) already split into bold paragraphs
    agreeNoteTable,
    // p([t(poemHint)])
  ];

  return {
    sections: [
      {
        properties: {
          page: {
            // Margins per layout: Top 1.5 cm, Bottom 1.5 cm, Right 1.5 cm, Left 3 cm
            // 1 cm ≈ 566.93 twips -> 1.5 cm ≈ 850; 3 cm ≈ 1701
            margin: { top: 850, bottom: 850, left: 1701, right: 850 },
          },
        },
        children,
      },
    ],
  };
}

// Separate entry points for the new request templates so they can diverge later
// without changing the controller routing.
function generateQueryDocxSgb(outputPath = "ф-4 заключение.docx", data = {}) {
  return generateConclusionDocx(outputPath, { ...data });
}

function generateQueryDocxGsbp(outputPath = "ф-4 заключение.docx", data = {}) {
  return generateConclusionDocxF4(outputPath, { ...data });
}

function generateQueryDocxSgbDedicated(outputPath = "запрос.docx", data = {}) {
  const {
    leftHeader = "бр-1",
    approverTitle = "",
    position = "",
    fio = "",
    person = [],
    head = {},
    recordNumber = "",
    querySubjectBirthDate = "",
    queryRecipientRank = "звание",
    queryRecipientName = "Ф.И.О.",
    querySourceText = "",
    agreedLabel = [],
    signedListDateText = "«____» __________ 20__ года",
    queryEditableIntroText = "бу ерда узгартириш имкони булган маълумотлар киритилади",
    queryEditableRequirementsText = "Бу ерда узгартириш имкони булган маълумотлар киритилади",
  } = data;

  const noBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  };

  const p = (children, opts = {}) =>
    new Paragraph({
      children: Array.isArray(children) ? children : [children],
      ...opts,
    });

  const t = (text, opts = {}) =>
    new TextRun({
      text,
      font: "Times New Roman",
      size: 28,
      ...opts,
    });

  const primaryPerson = person?.[0] || {};
  const recipientLine1 = approverTitle
    ? `${approverTitle}`
    : "______________";
  const recipientLine2 = position || "__________________________";
  const birthDate = querySubjectBirthDate || primaryPerson?.dob || "_____";
  const birthPlace = primaryPerson?.birthplace || "…";
  const subjectExtras = [
    primaryPerson?.residence,
    primaryPerson?.roleLabel,
    primaryPerson?.workplace,
  ].filter(Boolean);
  const subjectDetails = subjectExtras.length
    ? subjectExtras.join(", ")
    : "узини маълумотлари";
  const subjectLineBase = primaryPerson?.fullName || "__________________________";
  const subjectLine = `${subjectLineBase}, ${birthDate} г.р., уроженец ${birthPlace}, ${subjectDetails}`;
  const sourceText =
    querySourceText || primaryPerson?.noteLabel || "компрматериалдаги маълумотлар";
  const introEditableText =
    String(queryEditableIntroText || "").trim() ||
    "бу ерда узгартириш имкони булган маълумотлар киритилади";
  const requirementsEditableText =
    String(queryEditableRequirementsText || "").trim() ||
    "Бу ерда узгартириш имкони булган маълумотлар киритилади";
  const headLines = String(head?.data || "Начальник подразделения")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const signatureNote = recordNumber ? `${recordNumber}` : "";

  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: noBorders,
            width: { size: 18, type: WidthType.PERCENTAGE },
            children: [p([t(leftHeader, { size: 20 })], { spacing: { after: 0 } })],
          }),
          new TableCell({
            borders: noBorders,
            width: { size: 52, type: WidthType.PERCENTAGE },
            children: [
              p(
                [
                  t("Подлежит возврату", {
                    bold: true,
                    underline: { type: UnderlineType.SINGLE, color: "000000" },
                  }),
                ],
                { alignment: AlignmentType.CENTER, spacing: { after: 0 } }
              ),
            ],
          }),
          new TableCell({
            borders: noBorders,
            width: { size: 30, type: WidthType.PERCENTAGE },
            children: [
              p([t("Секретно", { size: 20 })], {
                alignment: AlignmentType.RIGHT,
                spacing: { after: 0 },
              }),
              p([t("Экз.№_", { size: 20 })], {
                alignment: AlignmentType.RIGHT,
                spacing: { after: 120 },
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const recipientBlockLayout = {
    alignment: AlignmentType.LEFT,
    spacing: { after: 0 },
    indent: { left: 5613 },
  };

  const recipientBlock = [
    p([t(recipientLine1, { bold: true })], {
      ...recipientBlockLayout,
    }),
    p([t(recipientLine2, { bold: true })], {
      ...recipientBlockLayout,
    }),
    p([t(queryRecipientName || fio || "Ф.И.О.", { bold: true })], {
      ...recipientBlockLayout,
    }),
  ];

  const signatureTable = new Table({
    width: { size: 55, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      ...(headLines.length ? headLines : ["Начальник подразделения"]).map(
        (line) =>
          new TableRow({
            children: [
              new TableCell({
                borders: noBorders,
                children: [
                  p([t(line, { bold: true })], {
                    spacing: { after: 0 },
                  }),
                ],
              }),
            ],
          })
      ),
      new TableRow({
        children: [
          new TableCell({
            borders: noBorders,
            children: [
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: noBorders,
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        borders: noBorders,
                        width: { size: 40, type: WidthType.PERCENTAGE },
                        children: [
                          p([t(head?.rank || "звание", { bold: true })], {
                            spacing: { after: 0 },
                          }),
                        ],
                      }),
                      new TableCell({
                        borders: noBorders,
                        width: { size: 60, type: WidthType.PERCENTAGE },
                        children: [
                          p([t(head?.data1 || "Ф.И.О.", { bold: true })], {
                            alignment: AlignmentType.RIGHT,
                            spacing: { after: 0 },
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            borders: noBorders,
            children: [
              p([t(head?.time || "«____» __________ 20__ года")], {
                spacing: { after: 0 },
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const children = [
    headerTable,

    p([t("")], { spacing: { after: 220 } }),
    ...recipientBlock,
    p([t("")], { spacing: { after: 240 } }),
    p(
      [
        t("В связи с "),
        t(`(${introEditableText})`),
        t(" проверяется:"),
      ],
      {
        alignment: AlignmentType.JUSTIFIED,
        spacing: { line: 324, after: 120 },
        indent: { firstLine: 567 },
      }
    ),
    p([t(subjectLine)], {
      alignment: AlignmentType.JUSTIFIED,
      indent: { left: 2832 },
      spacing: { after: 160 },
    }),
    p([t(`По данным (${sourceText}).`)], {
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 120 },
      indent: { firstLine: 567 },
    }),
    p([t(`(${requirementsEditableText}).`)], {
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 360 },
      indent: { firstLine: 567 },
    }),
    ...(() => {
      const agreedBlock = (Array.isArray(agreedLabel) ? agreedLabel : [agreedLabel])
        .filter((block) => block !== undefined && block !== null && String(block).trim())
        .flatMap((block) =>
          String(block)
            .replace(/\r/g, "")
            .split("\n")
            .filter((line) => line !== "")
            .map((line) =>
              p([t(line, { bold: !line.includes("года") })], {
                spacing: { line: 280, after: 0 },
              })
            )
        );

      return agreedBlock.length
        ? [p([t("")], { spacing: { before: 120, after: 120 } }), ...agreedBlock]
        : [];
    })(),
    p([t(signatureNote)], {
      alignment: AlignmentType.RIGHT,
      spacing: { before: 240, after: 0 },
    }),
  ];

  return {
    sections: [
      {
        properties: {
          page: {
            margin: { top: 850, bottom: 850, left: 1701, right: 850 },
          },
        },
        children,
      },
    ],
  };
}

function generateQueryDocxGsbpDedicated(outputPath = "query-gsbp.docx", data = {}) {
  const {
    leftHeader = "бр-1",
    approverTitle = "",
    position = "",
    fio = "",
    person = [],
    head = {},
    recordNumber = "",
    querySubjectBirthDate = "",
    queryRecipientRank = "звание",
    queryRecipientName = "Ф.И.О.",
    querySourceText = "",
    agreedLabel = [],
    signedListDateText = "«____» __________ 20__ года",
    queryEditableRequirementsText = "Бу ерда узгартириш имкони булган маълумотлар киритиб куйилади",
    queryExecutorName = "Ф.И.О.",
    queryInitiatorName = "Ф.И.О.",
  } = data;

  const noBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  };

  const p = (children, opts = {}) =>
    new Paragraph({
      children: Array.isArray(children) ? children : [children],
      ...opts,
    });

  const textRun = (text, opts = {}) =>
    new TextRun({
      text,
      font: "Times New Roman",
      size: 28,
      ...opts,
    });

  const t = textRun;

  const highlighted = (text, _color, opts = {}) =>
    textRun(text, {
      ...opts,
    });

  const blankParagraph = () =>
    p([textRun("")], {
      spacing: { after: 0 },
    });

  const primaryPerson = person?.[0] || {};
  const birthDate = querySubjectBirthDate || primaryPerson?.dob || "_____";
  const birthPlace = primaryPerson?.birthplace || "…";
  const workplace =
    primaryPerson?.workplace ||
    primaryPerson?.roleLabel ||
    "базада кўрсатилган иш жойи";
  const subjectName = primaryPerson?.fullName || "__________________________";
  const sourceText =
    String(
      querySourceText ||
      primaryPerson?.noteLabel ||
      "компрматериалдаги маълумотлар"
    ).trim();
  const requirementsEditableText =
    String(queryEditableRequirementsText || "").trim() ||
    "Бу ерда узгартириш имкони булган маълумотлар киритиб куйилади";
  const recipientLine1 = approverTitle
    ? `${approverTitle}`
    : "______________";
  const recipientLine2 = position || "__________________________";
  const headLines = String(head?.data || "Начальник подразделения")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const signatureNote = recordNumber ? `${recordNumber}` : "";
  const footerRecordText = recordNumber ? `№${recordNumber}-анкета` : "№-анкета";
  const footerExecutorName = queryExecutorName || data?.operator?.data1 || "Ф.И.О.";
  const footerInitiatorName = queryInitiatorName || "Ф.И.О.";
  const footerDateText = head?.time || "«____» __________ 20__ года";

  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: noBorders,
            width: { size: 18, type: WidthType.PERCENTAGE },
            children: [p([t(leftHeader, { size: 20 })], { spacing: { after: 0 } })],
          }),
          new TableCell({
            borders: noBorders,
            width: { size: 52, type: WidthType.PERCENTAGE },
            children: [
              p(
                [
                  t("Подлежит возврату", {
                    bold: true,
                    underline: { type: UnderlineType.SINGLE, color: "000000" },
                  }),
                ],
                { alignment: AlignmentType.CENTER, spacing: { after: 0 } }
              ),
            ],
          }),
          new TableCell({
            borders: noBorders,
            width: { size: 30, type: WidthType.PERCENTAGE },
            children: [
              p([t("Секретно", { size: 20 })], {
                alignment: AlignmentType.RIGHT,
                spacing: { after: 0 },
              }),
              p([t("Экз.№_", { size: 20 })], {
                alignment: AlignmentType.RIGHT,
                spacing: { after: 120 },
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const recipientBlockLayout = {
    alignment: AlignmentType.LEFT,
    spacing: { after: 0 },
    indent: { left: 5613 },
  };

  const recipientBlock = [
    p([highlighted(recipientLine1, "yellow", { bold: true })], {
      ...recipientBlockLayout,
    }),
    p([highlighted(recipientLine2, "yellow", { bold: true })], {
      ...recipientBlockLayout,
    }),
    p([highlighted(queryRecipientName || fio || "Ф.И.О.", "yellow", { bold: true })], {
      ...recipientBlockLayout,
    }),
  ];

  const signatureTable = new Table({
    width: { size: 55, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      ...(headLines.length ? headLines : ["Начальник подразделения"]).map(
        (line) =>
          new TableRow({
            children: [
              new TableCell({
                borders: noBorders,
                children: [
                  p([highlighted(line, "yellow", { bold: true })], {
                    spacing: { after: 0 },
                  }),
                ],
              }),
            ],
          })
      ),
      new TableRow({
        children: [
          new TableCell({
            borders: noBorders,
            children: [
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: noBorders,
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        borders: noBorders,
                        width: { size: 40, type: WidthType.PERCENTAGE },
                        children: [
                          p([highlighted(head?.rank || "звание", "yellow", { bold: true })], {
                            spacing: { after: 0 },
                          }),
                        ],
                      }),
                      new TableCell({
                        borders: noBorders,
                        width: { size: 60, type: WidthType.PERCENTAGE },
                        children: [
                          p([highlighted(head?.data1 || "Ф.И.О.", "yellow", { bold: true })], {
                            alignment: AlignmentType.RIGHT,
                            spacing: { after: 0 },
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            borders: noBorders,
            children: [
              p([t(head?.time || "«____» __________ 20__ года")], {
                spacing: { after: 0 },
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const footerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: noBorders,
            width: { size: 55, type: WidthType.PERCENTAGE },
            children: [
              p([highlighted(footerDateText, "yellow")], {
                spacing: { after: 0 },
              }),
            ],
          }),
          new TableCell({
            borders: noBorders,
            width: { size: 45, type: WidthType.PERCENTAGE },
            children: [
              p(
                [
                  highlighted("Исполнитель: ", "green"),
                  highlighted(footerExecutorName, "yellow"),
                ],
                {
                  alignment: AlignmentType.RIGHT,
                  spacing: { after: 0 },
                }
              ),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            borders: noBorders,
            width: { size: 55, type: WidthType.PERCENTAGE },
            children: [
              p([highlighted(footerRecordText, "yellow")], {
                spacing: { after: 0 },
              }),
            ],
          }),
          new TableCell({
            borders: noBorders,
            width: { size: 45, type: WidthType.PERCENTAGE },
            children: [
              p(
                [
                  highlighted("Инициатор: ", "green"),
                  highlighted(footerInitiatorName, "yellow"),
                ],
                {
                  alignment: AlignmentType.RIGHT,
                  spacing: { after: 0 },
                }
              ),
            ],
          }),
        ],
      }),
    ],
  });

  const agreedBlockSource = Array.isArray(agreedLabel)
    ? agreedLabel
    : [agreedLabel];
  const agreedBlock = agreedBlockSource
    .filter((block) => block !== undefined && block !== null && String(block).trim())
    .flatMap((block) =>
      String(block)
        .replace(/\r/g, "")
        .split("\n")
        .filter((line) => line !== "")
        .map((line) =>
          p([highlighted(line, "yellow", { bold: !line.includes("года") })], {
            spacing: { line: 280, after: 0 },
          })
        )
    );

  const children = [
    headerTable,
    blankParagraph(),
    ...recipientBlock,
    p([textRun("")], { spacing: { after: 240 } }),
    p(
      [
        highlighted("По результатам ", "green"),
        highlighted("____________", "green"),
        highlighted(" спецпроверки ", "green"),
        highlighted(subjectName, "yellow", { bold: true }),
        highlighted(", ", "yellow"),
        highlighted(birthDate, "yellow"),
        highlighted(" г.р., уроженец ", "yellow"),
        highlighted(birthPlace, "yellow"),
        highlighted(", который с ____ года работает в должности ", "green"),
        highlighted(`${workplace}`, "yellow"),
        highlighted(", получена следующая информация.", "green"),
      ],
      {
        alignment: AlignmentType.JUSTIFIED,
        spacing: { line: 324, after: 120 },
        indent: { firstLine: 567 },
      }
    ),
    p(
      [
        highlighted("По данным, ", "green"),
        highlighted(`(${sourceText})`, "yellow"),
        textRun("."),
      ],
      {
        alignment: AlignmentType.JUSTIFIED,
        spacing: { line: 324, after: 120 },
        indent: { firstLine: 567 },
      }
    ),
    p([highlighted(requirementsEditableText.endsWith(".") ? requirementsEditableText : `${requirementsEditableText}.`, "red")], {
      alignment: AlignmentType.JUSTIFIED,
      spacing: { line: 324, after: 360 },
      indent: { firstLine: 567 },
    }),
    ...(agreedBlock.length ? [blankParagraph(), ...agreedBlock] : []),
    p([textRun(signatureNote)], {
      alignment: AlignmentType.RIGHT,
      spacing: { before: 240, after: 0 },
    }),
    // footerTable,
    ...Array.from({ length: 20 }, () => blankParagraph()),
  ];

  return {
    sections: [
      {
        properties: {
          page: {
            margin: { top: 850, bottom: 850, left: 1701, right: 850 },
          },
        },
        children,
      },
    ],
  };
}

//done
function generateMVD_SGB_USParray(
  admin_fullname,
  admin_phone,
  organization,
  requested_organization,
  formattedDate,
  data,
  type,
  signList
) {
  const tableRows =
    signList && signList.length > 0
      ? signList.map((item) => {
        return new TableRow({
          children: [
            // First Cell: Position with label
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${item?.position ? item?.position : ""}`,
                      bold: false,
                      underline: {
                        type: UnderlineType.SINGLE,
                        color: "000000",
                      },
                      size: 28,
                    }),
                    new TextRun({
                      text: "Лавозими (Должность)",
                      size: 28,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            // Second Cell: Signature
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 28,
                    }),
                    new TextRun({
                      text: "Имзо (подпись)",
                      size: 28,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            // Third Cell: Name with label
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${item?.name ? item?.name : ""}`,
                      bold: false,
                      underline: {
                        type: UnderlineType.SINGLE,
                        color: "000000",
                      },
                      size: 28,
                    }),
                    new TextRun({
                      text: "Насаби (Фамилия)",
                      size: 28,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 30 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
          spacing: { after: 276 },
        });
      })
      : [
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 28,
                    }),
                    new TextRun({
                      text: "Лавозими (Должность)",
                      size: 28,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 28,
                    }),
                    new TextRun({
                      text: "Имзо (подпись)",
                      size: 28,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 28,
                    }),
                    new TextRun({
                      text: "Насаби (Фамилия)",
                      size: 28,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 30 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
          spacing: { after: 276 },
        }),
      ];
  const dateRow = new TableRow({
    children: [
      // First Cell: Title "live place label"
      new TableCell({
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: `${formattedDate}`,
                bold: false,
                break: 1,
                size: 28, // Large font size for title
              }),
            ],
            color: "0f0f0f",
            alignment: AlignmentType.CENTER, // Align to the left
            spacing: { after: 0, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_______________________________", // Chiziqni ifodalash uchun
                size: 12, // Chiziqning o'lchami
                bold: true,
              }),
            ],
            border: {
              bottom: {
                color: "000000", // Chiziq rangi
                space: 1,
                value: "dash", // Chiziq turi
                size: 40, // Chiziq qalinligi
              },
            },
            spacing: { after: 0, before: 0 },
            alignment: AlignmentType.CENTER,
          }),
        ],
        verticalAlign: VerticalAlign.CENTER,
        width: {
          size: 35 * 50, // 70% width for the title
          type: WidthType.PERCENTAGE,
        },
      }),
      // Second Cell: Table "live place"
      new TableCell({
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: ``,
                bold: false,
                size: 24, // Large font size for title
              }),
            ],
            color: "0f0f0f",
            alignment: AlignmentType.CENTER, // Align to the left
          }),
        ],
        columnSpan: 2,
        verticalAlign: VerticalAlign.CENTER,
        width: {
          size: 65 * 50, // 70% width for the title
          type: WidthType.PERCENTAGE,
        },
      }),
    ],
    verticalAlign: VerticalAlign.CENTER,
    spacing: { after: 276 },
  });
  if (type === "type1") {
    data.sort((a, b) =>
      a.fullName.localeCompare(b.fullName, "uz", { sensitivity: "base" })
    );
  } else if (type === "type2") {
    data.sort((a, b) =>
      a.regNumber.localeCompare(b.regNumber, "uz", { sensitivity: "base" })
    );
  }
  return {
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: (1440 * 2) / 2.54, // 2cm
              right: (1440 * 1.5) / 2.54, // 1.5cm
              bottom: (1440 * 2) / 2.54, // 2cm
              left: (1440 * 2.5) / 2.54, // 2.5cm
            },
          },
        },
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: "Экз. №_",
                size: 20,
                bold: true,
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.RIGHT,
            spacing: { after: 0, before: 276 },
          }),
          //orginization name
          new Paragraph({
            children: [
              new TextRun({
                text: organization,
                size: 28,
                bold: true,
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________",
                size: 1,
                bold: true,
                color: "ffffff",
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 276 },
          }),

          //User details on table
          new Table({
            rows: [
              // Header row
              new TableRow({
                children: [
                  // First Cell: Title "No"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `№`,
                            bold: false,
                            size: 28, // Large font size for title
                          }),
                        ],
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    margins: {
                      top: 100, // 100 twips = 0.1 inch
                      bottom: 100,
                      left: 100,
                      right: 100,
                    },
                    width: {
                      size: 7, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // First Cell: Title "Reg.№"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Рег.№`,
                            bold: false,
                            size: 28, // Large font size for title
                          }),
                        ],
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    margins: {
                      top: 100, // 100 twips = 0.1 inch
                      bottom: 100,
                      left: 100,
                      right: 100,
                    },
                    width: {
                      size: 7, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // First Cell: Title "FIO"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Фамилия, имя, отчество`,
                            bold: false,
                            size: 28, // Large font size for title
                          }),
                        ],
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    margins: {
                      top: 100, // 100 twips = 0.1 inch
                      bottom: 100,
                      left: 100,
                      right: 100,
                    },
                    width: {
                      size: 36, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // First Cell: Title "BirthDate"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Год рожден.`,
                            bold: false,
                            size: 28, // Large font size for title
                          }),
                        ],
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    margins: {
                      top: 100, // 100 twips = 0.1 inch
                      bottom: 100,
                      left: 100,
                      right: 100,
                    },
                    width: {
                      size: 7, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // First Cell: Title "BirthPlace"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Место рождения`,
                            bold: false,
                            size: 28, // Large font size for title
                          }),
                        ],
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    margins: {
                      top: 100, // 100 twips = 0.1 inch
                      bottom: 100,
                      left: 100,
                      right: 100,
                    },
                    width: {
                      size: 10, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // First Cell: Title "LivePlace"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Место жительства`,
                            bold: false,
                            size: 28, // Large font size for title
                          }),
                        ],
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    margins: {
                      top: 100, // 100 twips = 0.1 inch
                      bottom: 100,
                      left: 100,
                      right: 100,
                    },
                    width: {
                      size: 33, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
              }),
              // Data rows - properly spread the mapped array
              ...(data?.map((item, index) => {
                return new TableRow({
                  children: [
                    // First Cell: Title "No"
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: `${index + 1}`,
                              bold: false,
                              size: 28, // Large font size for title
                            }),
                          ],
                          alignment: AlignmentType.CENTER, // Align to the left
                        }),
                      ],
                      verticalAlign: VerticalAlign.CENTER,
                      margins: {
                        top: 20, // 100 twips = 0.1 inch
                        bottom: 20,
                        left: 20,
                        right: 20,
                      },
                      width: {
                        size: 7, // 70% width for the title
                        type: WidthType.PERCENTAGE,
                      },
                    }),
                    // First Cell: Title "Reg.№"
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: `${item?.regNumber || ""}`,
                              bold: false,
                              size: 28, // Large font size for title
                            }),
                          ],
                          alignment: AlignmentType.CENTER, // Align to the left
                        }),
                      ],
                      verticalAlign: VerticalAlign.CENTER,
                      margins: {
                        top: 20, // 100 twips = 0.1 inch
                        bottom: 20,
                        left: 20,
                        right: 20,
                      },
                      width: {
                        size: 7, // 70% width for the title
                        type: WidthType.PERCENTAGE,
                      },
                    }),
                    // First Cell: Title "FIO"
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: `${item?.fullName || ""}`,
                              bold: false,
                              size: 28, // Large font size for title
                            }),
                          ],
                          alignment: AlignmentType.CENTER, // Align to the left
                        }),
                      ],
                      verticalAlign: VerticalAlign.CENTER,
                      margins: {
                        top: 20, // 100 twips = 0.1 inch
                        bottom: 20,
                        left: 20,
                        right: 20,
                      },
                      width: {
                        size: 36, // 70% width for the title
                        type: WidthType.PERCENTAGE,
                      },
                    }),
                    // First Cell: Title "BirthDate"
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: `${item?.birthDate || ""} г.`,
                              bold: false,
                              size: 28, // Large font size for title
                            }),
                          ],
                          alignment: AlignmentType.CENTER, // Align to the left
                        }),
                      ],
                      verticalAlign: VerticalAlign.CENTER,
                      margins: {
                        top: 20, // 100 twips = 0.1 inch
                        bottom: 20,
                        left: 20,
                        right: 20,
                      },
                      width: {
                        size: 7, // 70% width for the title
                        type: WidthType.PERCENTAGE,
                      },
                    }),
                    // First Cell: Title "BirthPlace"
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: `${item?.birthPlace || ""}`,
                              bold: false,
                              size: 28, // Large font size for title
                            }),
                          ],
                          alignment: AlignmentType.CENTER, // Align to the left
                        }),
                      ],
                      verticalAlign: VerticalAlign.CENTER,
                      margins: {
                        top: 20, // 100 twips = 0.1 inch
                        bottom: 20,
                        left: 20,
                        right: 20,
                      },
                      width: {
                        size: 10, // 70% width for the title
                        type: WidthType.PERCENTAGE,
                      },
                    }),
                    // First Cell: Title "LivePlace"
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: `${item?.residence || ""}`,
                              bold: false,
                              size: 28, // Large font size for title
                            }),
                          ],
                          alignment: AlignmentType.CENTER, // Align to the left
                        }),
                      ],
                      verticalAlign: VerticalAlign.CENTER,
                      margins: {
                        top: 20, // 100 twips = 0.1 inch
                        bottom: 20,
                        left: 20,
                        right: 20,
                      },
                      width: {
                        size: 33, // 70% width for the title
                        type: WidthType.PERCENTAGE,
                      },
                    }),
                  ],
                  shading: {
                    type: ShadingType.GRAY10,
                    color: "0f0f0f",
                  },
                });
              }) || []), // Add fallback empty array if data is null/undefined
            ],
            width: {
              size: 100, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            spacing: { line: 276, after: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //masul tashkilot
          new Paragraph({
            children: [
              new TextRun({
                text: requested_organization,
                size: 28,
                bold: true,
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "________________________________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 12, // Chiziqning o'lchami
                bold: true,
              }),
            ],
            border: {
              bottom: {
                color: "000000", // Chiziq rangi
                space: 1,
                value: "dash", // Chiziq turi
                size: 40, // Chiziq qalinligi
              },
            },
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Идора ва бўлинма номи  (Наименование органа и подразделения)",
                size: 28,
                color: "0f0f0f",
                bold: false,
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.CENTER,
            spacing: { after: 0 },
          }),

          // podpis and date
          new Paragraph({
            children: [
              new TextRun({
                text: "", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                break: 2,
                color: "ffffff",
              }),
            ],
          }),
          new Table({
            rows: [...tableRows, dateRow],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //executive and phone number############################
          new Paragraph({
            children: [
              new TextRun({
                text: "", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                break: 2,
                color: "ffffff",
              }),
            ],
          }),
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "birthDate label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Бажарувчи`,
                            bold: false,
                            size: 28, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Исполнитель)",
                            size: 28, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthDate"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: admin_fullname,
                            size: 28,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "_____________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  //BirthPlace label
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Телефон`,
                            bold: false,
                            size: 28, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthPlace"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: admin_phone,
                            size: 28,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        verticalAlign: VerticalAlign.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "____________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //executive and phone number
          // new Table({
          //   rows: [
          //     new TableRow({
          //       children: [
          //         // First Cell: Title "birthDate label"
          //         new TableCell({
          //           children: [
          //             new Paragraph({
          //               children: [
          //                 new TextRun({
          //                   text: `Ответственный`,
          //                   bold: false,
          //                   size: 24, // Large font size for title
          //                 }),
          //               ],
          //               color: "0f0f0f",
          //               alignment: AlignmentType.LEFT, // Align to the left
          //             }),
          //           ],
          //           verticalAlign: VerticalAlign.CENTER,
          //           width: {
          //             size: 25 * 50, // 70% width for the title
          //             type: WidthType.PERCENTAGE,
          //           },
          //         }),
          //         // Second Cell: Table "birthDate"
          //         new TableCell({
          //           children: [
          //             new Paragraph({
          //               children: [
          //                 new TextRun({
          //                   text: initiator_name,
          //                   size: 24,
          //                   bold: true,
          //                   // underline: {
          //                   //   type: UnderlineType.SINGLE,
          //                   //   color: "000000",
          //                   // },
          //                 }),
          //               ],
          //               // indent:{ firstLine:900},
          //               alignment: AlignmentType.CENTER,
          //               spacing: { after: 0, before: 276 },
          //             }),
          //             new Paragraph({
          //               children: [
          //                 new TextRun({
          //                   text: "____________________________________________", // Chiziqni ifodalash uchun
          //                   size: 12, // Chiziqning o'lchami
          //                   bold: true,
          //                 }),
          //               ],
          //               border: {
          //                 bottom: {
          //                   color: "000000", // Chiziq rangi
          //                   space: 1,
          //                   value: "dash", // Chiziq turi
          //                   size: 40, // Chiziq qalinligi
          //                 },
          //               },
          //               alignment: AlignmentType.CENTER,
          //               spacing: { after: 0, before: 0 },
          //             }),
          //             // new Paragraph({
          //             //   children: [
          //             //     new TextRun({
          //             //       text: "______________________________________", // Chiziqni ifodalash uchun
          //             //       size: 12, // Chiziqning o'lchami
          //             //       bold: true,
          //             //     }),
          //             //   ],
          //             //   border: {
          //             //     bottom: {
          //             //       color: "000000", // Chiziq rangi
          //             //       space: 1,
          //             //       value: "dash", // Chiziq turi
          //             //       size: 40, // Chiziq qalinligi
          //             //     },
          //             //   },
          //             //   alignment: AlignmentType.CENTER,
          //             //   spacing: { after: 0, before: 0 },
          //             // }),
          //           ],
          //           width: {
          //             size: 25 * 50, // 30% width for the table
          //             type: WidthType.PERCENTAGE,
          //           },
          //         }),
          //         //BirthPlace label
          //         new TableCell({
          //           children: [
          //             new Paragraph({
          //               children: [
          //                 new TextRun({
          //                   text: `К делу №`,
          //                   bold: false,
          //                   size: 24, // Large font size for title
          //                 }),
          //               ],
          //               color: "0f0f0f",
          //               alignment: AlignmentType.CENTER, // Align to the left
          //             }),
          //           ],
          //           verticalAlign: VerticalAlign.CENTER,
          //           width: {
          //             size: 25 * 50, // 70% width for the title
          //             type: WidthType.PERCENTAGE,
          //           },
          //         }),
          //         // Second Cell: Table "birthPlace"
          //         new TableCell({
          //           children: [
          //             new Paragraph({
          //               children: [
          //                 new TextRun({
          //                   text: record_number,
          //                   size: 24,
          //                   bold: true,
          //                 }),
          //               ],
          //               // indent:{ firstLine:900},
          //               alignment: AlignmentType.CENTER,
          //               verticalAlign: VerticalAlign.CENTER,
          //               spacing: { after: 0, before: 276 },
          //             }),
          //             new Paragraph({
          //               children: [
          //                 new TextRun({
          //                   text: "____________________________________________", // Chiziqni ifodalash uchun
          //                   size: 12, // Chiziqning o'lchami
          //                   bold: true,
          //                 }),
          //               ],
          //               border: {
          //                 bottom: {
          //                   color: "000000", // Chiziq rangi
          //                   space: 1,
          //                   value: "dash", // Chiziq turi
          //                   size: 40, // Chiziq qalinligi
          //                 },
          //               },
          //               alignment: AlignmentType.CENTER,
          //               spacing: { after: 0, before: 0 },
          //             }),
          //             // new Paragraph({
          //             //   children: [
          //             //     new TextRun({
          //             //       text: "______________________________________", // Chiziqni ifodalash uchun
          //             //       size: 12, // Chiziqning o'lchami
          //             //       bold: true,
          //             //     }),
          //             //   ],
          //             //   border: {
          //             //     bottom: {
          //             //       color: "000000", // Chiziq rangi
          //             //       space: 1,
          //             //       value: "dash", // Chiziq turi
          //             //       size: 40, // Chiziq qalinligi
          //             //     },
          //             //   },
          //             //   alignment: AlignmentType.CENTER,
          //             //   spacing: { after: 0, before: 0 },
          //             // }),
          //           ],
          //           width: {
          //             size: 25 * 50, // 30% width for the table
          //             type: WidthType.PERCENTAGE,
          //           },
          //         }),
          //       ],
          //       verticalAlign: VerticalAlign.CENTER,
          //       spacing: { after: 276 },
          //     }),
          //   ],
          //   width: {
          //     size: 100 * 50, // Ensure the table spans the full width of the page
          //     type: WidthType.PERCENTAGE,
          //   },
          //   alignment: AlignmentType.CENTER, // Center-align the entire table
          //   verticalAlign: VerticalAlign.CENTER,
          //   borders: {
          //     top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          //     bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          //     left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          //     right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          //     insideHorizontal: {
          //       style: BorderStyle.NONE,
          //       size: 0,
          //       color: "FFFFFF",
          //     },
          //     insideVertical: {
          //       style: BorderStyle.NONE,
          //       size: 0,
          //       color: "FFFFFF",
          //     },
          //   },
          //   spacing: { line: 276, after: 276, before: 0 },
          // }),
          // new Paragraph({
          //   children: [
          //     new TextRun({
          //       text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
          //       size: 1, // Chiziqning o'lchami
          //       bold: true,
          //       color: "ffffff",
          //     }),
          //   ],
          //   spacing: { after: 0, before: 0 },
          // }),
        ],
      },
    ],
  };
}

// #done
function generateTalabnoma(
  name = "Т  А  Л  А  Б  Н  О  М  А",
  organization = "Министерство юстиции Республики Узбекистан",
  firstName = "АБДУКАХХОРОВ",
  lastName = "ЗАЙНИДДИН",
  fatherName = "РАХМОНОВИЧ",
  birthDate = "1990",
  birthPlace = "Самаркандская область",
  livePlace = "Самаркандская область, Иштиханский район, мсг. Шехляркент",
  workplace = "Министерство юстиции Республики Узбекистан, Юридический департамент",
  request_data = "к/м в полном объеме к/м в полном объеме к/м в полном объеме",
  executive_organization = " ГСБП Республики Узбекистан",
  date = "21 января 2025 г.",
  executive_name = "Иванова А.К",
  executive_phone = "87777777777",
  signList = [],
  initiator_name = "Кузнецов М.И.",
  record_number = "182-18нг"
) {
  const tableRows =
    signList && signList.length > 0
      ? signList.map((item) => {
        return new TableRow({
          children: [
            // First Cell: Position with label
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${item?.position ? item?.position : ""}`,
                      bold: false,
                      underline: {
                        type: UnderlineType.SINGLE,
                        color: "000000",
                      },
                      size: 24,
                    }),
                    new TextRun({
                      text: "Лавозими (Должность)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            // Second Cell: Signature
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 24,
                    }),
                    new TextRun({
                      text: "Имзо (подпись)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            // Third Cell: Name with label
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${item?.name ? item?.name : ""}`,
                      bold: false,
                      underline: {
                        type: UnderlineType.SINGLE,
                        color: "000000",
                      },
                      size: 24,
                    }),
                    new TextRun({
                      text: "Насаби (Фамилия)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 30 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
          spacing: { after: 276 },
        });
      })
      : [
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 24,
                    }),
                    new TextRun({
                      text: "Лавозими (Должность)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 24,
                    }),
                    new TextRun({
                      text: "Имзо (подпись)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 24,
                    }),
                    new TextRun({
                      text: "Насаби (Фамилия)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 30 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
          spacing: { after: 276 },
        }),
      ];
  const dateRow = new TableRow({
    children: [
      // First Cell: Title "live place label"
      new TableCell({
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: `${date}`,
                bold: false,
                break: 1,
                size: 24, // Large font size for title
              }),
            ],
            color: "0f0f0f",
            alignment: AlignmentType.CENTER, // Align to the left
            spacing: { after: 0, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_______________________________", // Chiziqni ifodalash uchun
                size: 12, // Chiziqning o'lchami
                bold: true,
              }),
            ],
            border: {
              bottom: {
                color: "000000", // Chiziq rangi
                space: 1,
                value: "dash", // Chiziq turi
                size: 40, // Chiziq qalinligi
              },
            },
            spacing: { after: 0, before: 0 },
            alignment: AlignmentType.CENTER,
          }),
        ],
        verticalAlign: VerticalAlign.CENTER,
        width: {
          size: 35 * 50, // 70% width for the title
          type: WidthType.PERCENTAGE,
        },
      }),
      // Second Cell: Table "live place"
      new TableCell({
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: ``,
                bold: false,
                size: 24, // Large font size for title
              }),
            ],
            color: "0f0f0f",
            alignment: AlignmentType.CENTER, // Align to the left
          }),
        ],
        columnSpan: 2,
        verticalAlign: VerticalAlign.CENTER,
        width: {
          size: 65 * 50, // 70% width for the title
          type: WidthType.PERCENTAGE,
        },
      }),
    ],
    verticalAlign: VerticalAlign.CENTER,
    spacing: { after: 276 },
  });
  return {
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: (1440 * 2) / 2.54, // 2cm
              right: (1440 * 1.5) / 2.54, // 1.5cm
              bottom: (1440 * 2) / 2.54, // 2cm
              left: (1440 * 2.5) / 2.54, // 2.5cm
            },
          },
        },
        children: [
          //bu joyda talabnoma nomi bilan o'ng tomondagi korobka joylashgan
          name != "" &&
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "Т А Л А Б Н О М А"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: name,
                            bold: true,
                            size: 48, // Large font size for title
                          }),
                          new TextRun({
                            text: "(ТРЕБОВАНИЕ)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 70 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "(ТРЕБОВАНИЕ)"
                  new TableCell({
                    children: [
                      new Table({
                        rows: [
                          new TableRow({
                            children: [
                              new TableCell({
                                children: [
                                  new Paragraph({
                                    children: [
                                      new TextRun({
                                        text: "1",
                                        size: 32, // Adjust font size
                                      }),
                                      new TextRun({
                                        text: "Булим индекси",
                                        size: 16, // Adjust font size
                                        break: 1,
                                      }),
                                      new TextRun({
                                        text: "(Индекс отдела)",
                                        size: 16, // Adjust font size
                                        break: 1,
                                      }),
                                    ],
                                    alignment: AlignmentType.CENTER,
                                  }),
                                ],
                                margins: {
                                  top: 200,
                                  bottom: 200,
                                  left: 400,
                                  right: 400,
                                },
                              }),
                            ],
                          }),
                        ],
                        alignment: AlignmentType.CENTER,
                      }),
                    ],
                    width: {
                      size: 30 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: organization,
                size: 32,
                bold: true,
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "________________________________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 12, // Chiziqning o'lchami
                bold: true,
              }),
            ],
            border: {
              bottom: {
                color: "ffffff", // Chiziq rangi
                space: 1,
                value: "dash", // Chiziq turi
                size: 40, // Chiziq qalinligi
              },
            },
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 0 },
          }),
          name != ""
            ? new Paragraph({
              children: [
                new TextRun({
                  text: "Талабнома юборилаётган идора ва бўлинма номи",
                  size: 24,
                  color: "0f0f0f",
                  bold: false,
                }),
                new TextRun({
                  text: "(Наименование органа и подразделения, куда направляется требование)",
                  size: 24,
                  break: 1,
                  color: "0f0f0f",
                  bold: false,
                }),
              ],
              // indent:{ firstLine:900},
              alignment: AlignmentType.CENTER,
              spacing: { after: 0 },
            })
            : new Paragraph({
              children: [
                new TextRun({
                  text: "_________________________________________________________________________________________________________________________________________",
                  size: 1,
                  bold: true,
                  color: "ffffff",
                }),
              ],
            }),

          //firstName
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "firstName"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `1. Насаби`,
                            bold: false,
                            break: 1,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Фамилия)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 15 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "(ТРЕБОВАНИЕ)"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: lastName?.toUpperCase() || "",
                            size: 28,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                    ],
                    width: {
                      size: 85 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),
          //LastName and fatherName
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "firstName"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `2. Исм-шарифи`,
                            bold: false,
                            break: 1,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Имя и отчество)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "(ТРЕБОВАНИЕ)"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `${firstName?.toUpperCase() || ""} ${fatherName?.toUpperCase() || ""
                              }`,
                            size: 28,
                            bold: true,
                            // underline: {
                            //   type: UnderlineType.SINGLE,
                            //   color: "000000",
                            // },
                          }),
                        ],
                        verticalAlign: VerticalAlign.CENTER,
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "____________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                    ],
                    width: {
                      size: 75 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),
          //BirthDate and BirthPlace
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "birthDate label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `3. Туғилган йили`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Год рождения)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthDate"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `${birthDate} г.`,
                            size: 24,
                            bold: true,
                            // underline: {
                            //   type: UnderlineType.SINGLE,
                            //   color: "000000",
                            // },
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "_____________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  //BirthPlace label
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `4. Туғилган жойи`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Место рождения)",
                            size: 24, // Adjust font size
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthPlace"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text:
                              birthPlace?.length > 20
                                ? birthPlace.split(" ").slice(0, 2).join(" ")
                                : birthPlace,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.LEFT,
                        verticalAlign: VerticalAlign.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
              birthPlace?.length > 20 && birthPlace?.split(" ").length >= 2
                ? new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: birthPlace?.split(" ").slice(2).join(" "),
                              bold: false,
                              size: 24, // Large font size for title
                              underline: {
                                type: UnderlineType.SINGLE,
                                color: "000000",
                              },
                            }),
                          ],
                          color: "0f0f0f",
                          alignment: AlignmentType.LEFT, // Align to the left
                        }),
                      ],
                      verticalAlign: VerticalAlign.CENTER,
                      width: {
                        size: 100 * 50, // 70% width for the title
                        type: WidthType.PERCENTAGE,
                      },
                      columnSpan: 4,
                    }),
                  ],
                  verticalAlign: VerticalAlign.LEFT,
                  spacing: { after: 276, before: 276 },
                })
                : new TableRow({
                  children: [
                    new TableCell({
                      children: [],
                    }),
                  ],
                }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //live place
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "live place label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `5. Яшаш манзили`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Место проживания)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "live place"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text:
                              livePlace?.length > 30 &&
                                livePlace?.split(" ").length >= 5
                                ? livePlace.split(" ").slice(0, 5).join(" ")
                                : livePlace,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                    ],
                    width: {
                      size: 75 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
              livePlace?.length > 30 && livePlace?.split(" ").length >= 5
                ? new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: livePlace?.split(" ").slice(5).join(" "),
                              bold: true,
                              size: 24, // Large font size for title
                            }),
                          ],
                          color: "0f0f0f",
                          alignment: AlignmentType.LEFT, // Align to the left
                        }),
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: "________________________________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                              size: 12, // Chiziqning o'lchami
                              bold: true,
                            }),
                          ],
                          border: {
                            bottom: {
                              color: "000000", // Chiziq rangi
                              space: 1,
                              value: "dash", // Chiziq turi
                              size: 40, // Chiziq qalinligi
                            },
                          },
                          alignment: AlignmentType.CENTER,
                          spacing: { after: 0, before: 0 },
                        }),
                      ],
                      verticalAlign: VerticalAlign.CENTER,
                      width: {
                        size: 100 * 50, // 70% width for the title
                        type: WidthType.PERCENTAGE,
                      },
                      columnSpan: 2,
                    }),
                  ],
                  verticalAlign: VerticalAlign.LEFT,
                  spacing: { after: 276, before: 276 },
                })
                : new TableRow({
                  children: [
                    new TableCell({
                      children: [],
                    }),
                  ],
                }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //workplace and position
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "live place label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `6. Иш жойи ва лавозими `,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Место работы и должность)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 35 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "live place"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text:
                              workplace.split(" ")?.length > 4 &&
                                workplace?.length > 30
                                ? workplace.split(" ").slice(0, 4).join(" ")
                                : workplace,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        alignment: AlignmentType.LEFT,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                    ],
                    width: {
                      size: 65 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
              workplace.split(" ")?.length > 4 && workplace?.length > 30
                ? new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: workplace?.split(" ").slice(4).join(" "),
                              bold: true,
                              size: 24, // Large font size for title
                            }),
                          ],
                          color: "0f0f0f",
                          alignment: AlignmentType.LEFT, // Align to the left
                        }),
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: "________________________________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                              size: 12, // Chiziqning o'lchami
                              bold: true,
                            }),
                          ],
                          border: {
                            bottom: {
                              color: "000000", // Chiziq rangi
                              space: 1,
                              value: "dash", // Chiziq turi
                              size: 40, // Chiziq qalinligi
                            },
                          },
                          alignment: AlignmentType.CENTER,
                          spacing: { after: 0, before: 0 },
                        }),
                      ],
                      verticalAlign: VerticalAlign.CENTER,
                      width: {
                        size: 100 * 50, // 70% width for the title
                        type: WidthType.PERCENTAGE,
                      },
                      columnSpan: 2,
                    }),
                  ],
                  verticalAlign: VerticalAlign.LEFT,
                  spacing: { after: 276, before: 276 },
                })
                : new TableRow({
                  children: [
                    new TableCell({
                      children: [],
                    }),
                  ],
                }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //request
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "live place label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `7. Қандай маълумот керак`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Какая нужна справка)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 35 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "live place"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text:
                              request_data.split(" ")?.length > 2 &&
                                request_data?.length > 30
                                ? request_data.split(" ").slice(0, 2).join(" ")
                                : request_data,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        alignment: AlignmentType.LEFT,
                        verticalAlign: VerticalAlign.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                    ],
                    width: {
                      size: 65 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                    verticalAlign: VerticalAlign.CENTER,
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
              request_data.split(" ")?.length > 2 && request_data?.length > 30
                ? new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: request_data
                                ?.split(" ")
                                .slice(3)
                                .join(" "),
                              bold: false,
                              size: 24, // Large font size for title
                            }),
                          ],
                          color: "0f0f0f",
                          alignment: AlignmentType.LEFT, // Align to the left
                        }),
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: "________________________________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                              size: 12, // Chiziqning o'lchami
                              bold: true,
                            }),
                          ],
                          border: {
                            bottom: {
                              color: "000000", // Chiziq rangi
                              space: 1,
                              value: "dash", // Chiziq turi
                              size: 40, // Chiziq qalinligi
                            },
                          },
                          alignment: AlignmentType.CENTER,
                          spacing: { after: 0, before: 0 },
                        }),
                      ],
                      verticalAlign: VerticalAlign.CENTER,
                      width: {
                        size: 100 * 50, // 70% width for the title
                        type: WidthType.PERCENTAGE,
                      },
                      columnSpan: 2,
                    }),
                  ],
                  verticalAlign: VerticalAlign.LEFT,
                  spacing: { after: 276, before: 276 },
                })
                : new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [new TextRun({ text: "" })],
                        }),
                      ],
                    }),
                  ],
                }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //masul tashkilot
          new Paragraph({
            children: [
              new TextRun({
                text: executive_organization,
                size: 24,
                bold: true,
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "________________________________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 12, // Chiziqning o'lchami
                bold: true,
              }),
            ],
            border: {
              bottom: {
                color: "000000", // Chiziq rangi
                space: 1,
                value: "dash", // Chiziq turi
                size: 40, // Chiziq qalinligi
              },
            },
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Идора ва бўлинма номи  (Наименование органа и подразделения)",
                size: 24,
                color: "0f0f0f",
                bold: false,
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.CENTER,
            spacing: { after: 0 },
          }),

          // podpis and date
          new Paragraph({
            children: [
              new TextRun({
                text: "", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                break: 2,
                color: "ffffff",
              }),
            ],
          }),
          new Table({
            rows: [...tableRows, dateRow],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //executive and phone number
          new Paragraph({
            children: [
              new TextRun({
                text: "", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                break: 2,
                color: "ffffff",
              }),
            ],
          }),
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "birthDate label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Бажарувчи`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Исполнитель)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthDate"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: executive_name,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "_____________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  //BirthPlace label
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Телефон`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthPlace"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: executive_phone,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        verticalAlign: VerticalAlign.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "____________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //executive and phone number
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "birthDate label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Ответственный`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthDate"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: initiator_name,
                            size: 24,
                            bold: true,
                            // underline: {
                            //   type: UnderlineType.SINGLE,
                            //   color: "000000",
                            // },
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "____________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  //BirthPlace label
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `К делу №`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthPlace"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: record_number,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        verticalAlign: VerticalAlign.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "____________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),
        ],
      },
    ],
  };
}

// #DONE
function generateUPK(
  name = "Т  А  Л  А  Б  Н  О  М  А",
  organization = "Министерство юстиции Республики Узбекистан",
  firstName = "АБДУКАХХОРОВ",
  lastName = "ЗАЙНИДДИН",
  fatherName = "РАХМОНОВИЧ",
  birthDate = "1990",
  birthPlace = "Самаркандская область",
  livePlace = "Самаркандская область, Иштиханский район, мсг. Шехляркент",
  workplace = "Министерство юстиции Республики Узбекистан, Юридический департамент",
  request_data = "к/м в полном объеме к/м в полном объеме к/м в полном объеме",
  executive_organization = " ГСБП Республики Узбекистан",
  date = "21 января 2025 г.",
  executive_name = "Иванова А.К",
  executive_phone = "87777777777",
  initiator_name = "Кузнецов М.И.",
  record_number = "182-18нг",
  signList = [],
  passport = "1234567890",
  residence = "123456eade7890",
  time_period = "1234567890-few"
) {
  const tableRows =
    signList && signList.length > 0
      ? signList.map((item) => {
        return new TableRow({
          children: [
            // First Cell: Position with label
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${item?.position ? item?.position : ""}`,
                      bold: false,
                      underline: {
                        type: UnderlineType.SINGLE,
                        color: "000000",
                      },
                      size: 24,
                    }),
                    new TextRun({
                      text: "Лавозими (Должность)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            // Second Cell: Signature
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 24,
                    }),
                    new TextRun({
                      text: "Имзо (подпись)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            // Third Cell: Name with label
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${item?.name ? item?.name : ""}`,
                      bold: false,
                      underline: {
                        type: UnderlineType.SINGLE,
                        color: "000000",
                      },
                      size: 24,
                    }),
                    new TextRun({
                      text: "Насаби (Фамилия)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 30 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
          spacing: { after: 276 },
        });
      })
      : [
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 24,
                    }),
                    new TextRun({
                      text: "Лавозими (Должность)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 24,
                    }),
                    new TextRun({
                      text: "Имзо (подпись)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 24,
                    }),
                    new TextRun({
                      text: "Насаби (Фамилия)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 30 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
          spacing: { after: 276 },
        }),
      ];
  const dateRow = new TableRow({
    children: [
      // First Cell: Title "live place label"
      new TableCell({
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: `${date}`,
                bold: false,
                break: 1,
                size: 24, // Large font size for title
              }),
            ],
            color: "0f0f0f",
            alignment: AlignmentType.CENTER, // Align to the left
            spacing: { after: 0, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_______________________________", // Chiziqni ifodalash uchun
                size: 12, // Chiziqning o'lchami
                bold: true,
              }),
            ],
            border: {
              bottom: {
                color: "000000", // Chiziq rangi
                space: 1,
                value: "dash", // Chiziq turi
                size: 40, // Chiziq qalinligi
              },
            },
            spacing: { after: 0, before: 0 },
            alignment: AlignmentType.CENTER,
          }),
        ],
        verticalAlign: VerticalAlign.CENTER,
        width: {
          size: 35 * 50, // 70% width for the title
          type: WidthType.PERCENTAGE,
        },
      }),
      // Second Cell: Table "live place"
      new TableCell({
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: ``,
                bold: false,
                size: 24, // Large font size for title
              }),
            ],
            color: "0f0f0f",
            alignment: AlignmentType.CENTER, // Align to the left
          }),
        ],
        columnSpan: 2,
        verticalAlign: VerticalAlign.CENTER,
        width: {
          size: 65 * 50, // 70% width for the title
          type: WidthType.PERCENTAGE,
        },
      }),
    ],
    verticalAlign: VerticalAlign.CENTER,
    spacing: { after: 276 },
  });
  return {
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: (1440 * 2) / 2.54, // 2cm
              right: (1440 * 1.5) / 2.54, // 1.5cm
              bottom: (1440 * 2) / 2.54, // 2cm
              left: (1440 * 2.5) / 2.54, // 2.5cm
            },
          },
        },
        children: [
          //bu joyda talabnoma nomi bilan o'ng tomondagi korobka joylashgan
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "Т А Л А Б Н О М А"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: name,
                            bold: true,
                            size: 48, // Large font size for title
                          }),
                          new TextRun({
                            text: "(ТРЕБОВАНИЕ)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 70 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "(ТРЕБОВАНИЕ)"
                  new TableCell({
                    children: [
                      new Table({
                        rows: [
                          new TableRow({
                            children: [
                              new TableCell({
                                children: [
                                  new Paragraph({
                                    children: [
                                      new TextRun({
                                        text: "1",
                                        size: 32, // Adjust font size
                                      }),
                                      new TextRun({
                                        text: "Булим индекси",
                                        size: 16, // Adjust font size
                                        break: 1,
                                      }),
                                      new TextRun({
                                        text: "(Индекс отдела)",
                                        size: 16, // Adjust font size
                                        break: 1,
                                      }),
                                    ],
                                    alignment: AlignmentType.CENTER,
                                  }),
                                ],
                                margins: {
                                  top: 200,
                                  bottom: 200,
                                  left: 400,
                                  right: 400,
                                },
                              }),
                            ],
                          }),
                        ],
                        alignment: AlignmentType.CENTER,
                      }),
                    ],
                    width: {
                      size: 30 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: organization,
                size: 32,
                bold: true,
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "________________________________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 12, // Chiziqning o'lchami
                bold: true,
              }),
            ],
            border: {
              bottom: {
                color: "ffffff", // Chiziq rangi
                space: 1,
                value: "dash", // Chiziq turi
                size: 40, // Chiziq qalinligi
              },
            },
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 0 },
          }),
          name != ""
            ? new Paragraph({
              children: [
                new TextRun({
                  text: "Талабнома юборилаётган идора ва бўлинма номи",
                  size: 24,
                  color: "0f0f0f",
                  bold: false,
                }),
                new TextRun({
                  text: "(Наименование органа и подразделения, куда направляется требование)",
                  size: 24,
                  break: 1,
                  color: "0f0f0f",
                  bold: false,
                }),
              ],
              // indent:{ firstLine:900},
              alignment: AlignmentType.CENTER,
              spacing: { after: 0 },
            })
            : new Paragraph({
              children: [
                new TextRun({
                  text: "_________________________________________________________________________________________________________________________________________",
                  size: 1,
                  bold: true,
                  color: "ffffff",
                }),
              ],
            }),

          //firstName
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "firstName"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `1. Насаби`,
                            bold: false,
                            break: 1,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Фамилия)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 15 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "(ТРЕБОВАНИЕ)"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: lastName?.toUpperCase() || "",
                            size: 24,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                    ],
                    width: {
                      size: 85 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),
          //LastName and fatherName
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "firstName"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `2. Исм-шарифи`,
                            bold: false,
                            break: 1,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Имя и отчество)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "(ТРЕБОВАНИЕ)"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `${firstName?.toUpperCase() || ""} ${fatherName?.toUpperCase() || ""
                              }`,
                            size: 24,
                            bold: true,
                            // underline: {
                            //   type: UnderlineType.SINGLE,
                            //   color: "000000",
                            // },
                          }),
                        ],
                        verticalAlign: VerticalAlign.CENTER,
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "____________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                    ],
                    width: {
                      size: 75 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),
          //BirthDate and BirthPlace
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "birthDate label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `3. Туғилган йили`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Год рождения)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthDate"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `${birthDate} г.`,
                            size: 24,
                            bold: true,
                            // underline: {
                            //   type: UnderlineType.SINGLE,
                            //   color: "000000",
                            // },
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "_____________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  //BirthPlace label
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `4. Яшаш манзили`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Место жительства)",
                            size: 28, // Adjust font size
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthPlace"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text:
                              birthPlace?.length > 20
                                ? birthPlace.split(" ").slice(0, 2).join(" ")
                                : birthPlace,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.LEFT,
                        verticalAlign: VerticalAlign.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
              birthPlace?.length > 20 && birthPlace?.split(" ").length >= 2
                ? new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: birthPlace?.split(" ").slice(2).join(" "),
                              bold: false,
                              size: 24, // Large font size for title
                              underline: {
                                type: UnderlineType.SINGLE,
                                color: "000000",
                              },
                            }),
                          ],
                          color: "0f0f0f",
                          alignment: AlignmentType.LEFT, // Align to the left
                        }),
                      ],
                      verticalAlign: VerticalAlign.CENTER,
                      width: {
                        size: 100 * 50, // 70% width for the title
                        type: WidthType.PERCENTAGE,
                      },
                      columnSpan: 4,
                    }),
                  ],
                  verticalAlign: VerticalAlign.LEFT,
                  spacing: { after: 276, before: 276 },
                })
                : new TableRow({
                  children: [
                    new TableCell({
                      children: [],
                    }),
                  ],
                }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //passport
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "live place label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `5. Паспорт серияси ва рақами:`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "Серия и номер паспорта",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "live place"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: passport,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                    ],
                    width: {
                      size: 75 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),
          //residence
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "live place label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `6. Фуқаролиги:`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "Гражданство",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "live place"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: residence,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                    ],
                    width: {
                      size: 75 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //live place
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "live place label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `7. Яшаш манзили`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Место проживания)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "live place"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text:
                              livePlace?.length > 30 &&
                                livePlace?.split(" ").length >= 5
                                ? livePlace.split(" ").slice(0, 5).join(" ")
                                : livePlace,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                    ],
                    width: {
                      size: 75 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
              livePlace?.length > 30 && livePlace?.split(" ").length >= 5
                ? new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: livePlace?.split(" ").slice(5).join(" "),
                              bold: true,
                              size: 24, // Large font size for title
                            }),
                          ],
                          color: "0f0f0f",
                          alignment: AlignmentType.LEFT, // Align to the left
                        }),
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: "________________________________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                              size: 12, // Chiziqning o'lchami
                              bold: true,
                            }),
                          ],
                          border: {
                            bottom: {
                              color: "000000", // Chiziq rangi
                              space: 1,
                              value: "dash", // Chiziq turi
                              size: 40, // Chiziq qalinligi
                            },
                          },
                          alignment: AlignmentType.CENTER,
                          spacing: { after: 0, before: 0 },
                        }),
                      ],
                      verticalAlign: VerticalAlign.CENTER,
                      width: {
                        size: 100 * 50, // 70% width for the title
                        type: WidthType.PERCENTAGE,
                      },
                      columnSpan: 2,
                    }),
                  ],
                  verticalAlign: VerticalAlign.LEFT,
                  spacing: { after: 276, before: 276 },
                })
                : new TableRow({
                  children: [
                    new TableCell({
                      children: [],
                    }),
                  ],
                }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //time period
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "live place label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `8. Қайси оралиқдаги маълумот керак `,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Қайси оралиқдаги маълумот керак)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 45, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "live place"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: time_period,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        alignment: AlignmentType.LEFT,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "____________________________________________________________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                    ],
                    width: {
                      size: 55, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
              workplace.split(" ")?.length > 4 && workplace?.length > 30
                ? new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: workplace?.split(" ").slice(4).join(" "),
                              bold: true,
                              size: 24, // Large font size for title
                            }),
                          ],
                          color: "0f0f0f",
                          alignment: AlignmentType.LEFT, // Align to the left
                        }),
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: "________________________________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                              size: 12, // Chiziqning o'lchami
                              bold: true,
                            }),
                          ],
                          border: {
                            bottom: {
                              color: "000000", // Chiziq rangi
                              space: 1,
                              value: "dash", // Chiziq turi
                              size: 40, // Chiziq qalinligi
                            },
                          },
                          alignment: AlignmentType.CENTER,
                          spacing: { after: 0, before: 0 },
                        }),
                      ],
                      verticalAlign: VerticalAlign.CENTER,
                      width: {
                        size: 100 * 50, // 70% width for the title
                        type: WidthType.PERCENTAGE,
                      },
                      columnSpan: 2,
                    }),
                  ],
                  verticalAlign: VerticalAlign.LEFT,
                  spacing: { after: 276, before: 276 },
                })
                : new TableRow({
                  children: [
                    new TableCell({
                      children: [],
                    }),
                  ],
                }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //masul tashkilot
          new Paragraph({
            children: [
              new TextRun({
                text: executive_organization,
                size: 24,
                bold: true,
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "________________________________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 12, // Chiziqning o'lchami
                bold: true,
              }),
            ],
            border: {
              bottom: {
                color: "000000", // Chiziq rangi
                space: 1,
                value: "dash", // Chiziq turi
                size: 40, // Chiziq qalinligi
              },
            },
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Идора ва бўлинма номи  (Наименование органа и подразделения)",
                size: 24,
                color: "0f0f0f",
                bold: false,
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.CENTER,
            spacing: { after: 0 },
          }),

          // podpis and date
          new Paragraph({
            children: [
              new TextRun({
                text: "", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                break: 2,
                color: "ffffff",
              }),
            ],
          }),
          new Table({
            rows: [...tableRows, dateRow],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //executive and phone number
          new Paragraph({
            children: [
              new TextRun({
                text: "", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                break: 2,
                color: "ffffff",
              }),
            ],
          }),
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "birthDate label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Бажарувчи`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Исполнитель)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthDate"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: executive_name,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "_____________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  //BirthPlace label
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Телефон`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthPlace"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: executive_phone,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        verticalAlign: VerticalAlign.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "____________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //executive and phone number
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "birthDate label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Ответственный`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthDate"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: initiator_name,
                            size: 24,
                            bold: true,
                            // underline: {
                            //   type: UnderlineType.SINGLE,
                            //   color: "000000",
                            // },
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "____________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  //BirthPlace label
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `К делу №`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthPlace"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: record_number,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        verticalAlign: VerticalAlign.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "____________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),
        ],
      },
    ],
  };
}
//Done
function generatePsychoRaport(
  organization = "ГЛАВНОМУ ВРАЧУ ГОРОДСКОГО ПСИХОНЕВРОЛОГИЧЕСКОГО\nДИСПАНСЕРА №2 (ул. Лисунова, 25)",
  firstName = "АБДУКАХХОРОВ",
  lastName = "ЗАЙНИДДИН",
  fatherName = "РАХМОНОВИЧ",
  birthDate = "1990",
  birthPlace = "Самаркандская область",
  livePlace = "Самаркандская область, Иштиханский район, мсг. Шехляркент",
  executive_organization = "ГОСУДАРСТВЕННАЯ СЛУЖБА\nБЕЗОПАСНОСТИ ПРИ ПРЕЗИДЕНТА\nРЕСПУБЛИКИ УЗБЕКИСТАН",
  date = "21 января 2025 г.",
  executive_name = "Иванова А.К",
  executive_phone = "87777777777",
  initiator_name = "Кузнецов М.И.",
  record_number = "182-18нг",
  signList = [],
  notes = "1. Насаби;должн подразделения"
) {
  const tableRows =
    signList && signList.length > 0
      ? signList.map((item) => {
        return new TableRow({
          children: [
            // First Cell: Position with label
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${item?.position ? item?.position : ""}`,
                      bold: false,
                      underline: {
                        type: UnderlineType.SINGLE,
                        color: "000000",
                      },
                      size: 24,
                    }),
                    new TextRun({
                      text: "Лавозими (Должность)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            // Second Cell: Signature
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 24,
                    }),
                    new TextRun({
                      text: "Имзо (подпись)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            // Third Cell: Name with label
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${item?.name ? item?.name : ""}`,
                      bold: false,
                      underline: {
                        type: UnderlineType.SINGLE,
                        color: "000000",
                      },
                      size: 24,
                    }),
                    new TextRun({
                      text: "Насаби (Фамилия)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 30 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
          spacing: { after: 276 },
        });
      })
      : [
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 24,
                    }),
                    new TextRun({
                      text: "Лавозими (Должность)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 24,
                    }),
                    new TextRun({
                      text: "Имзо (подпись)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 24,
                    }),
                    new TextRun({
                      text: "Насаби (Фамилия)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 30 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
          spacing: { after: 276 },
        }),
      ];
  const dateRow = new TableRow({
    children: [
      // First Cell: Title "live place label"
      new TableCell({
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: `${date}`,
                bold: false,
                break: 1,
                size: 24, // Large font size for title
              }),
            ],
            color: "0f0f0f",
            alignment: AlignmentType.CENTER, // Align to the left
            spacing: { after: 0, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_______________________________", // Chiziqni ifodalash uchun
                size: 12, // Chiziqning o'lchami
                bold: true,
              }),
            ],
            border: {
              bottom: {
                color: "000000", // Chiziq rangi
                space: 1,
                value: "dash", // Chiziq turi
                size: 40, // Chiziq qalinligi
              },
            },
            spacing: { after: 0, before: 0 },
            alignment: AlignmentType.CENTER,
          }),
        ],
        verticalAlign: VerticalAlign.CENTER,
        width: {
          size: 35 * 50, // 70% width for the title
          type: WidthType.PERCENTAGE,
        },
      }),
      // Second Cell: Table "live place"
      new TableCell({
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: ``,
                bold: false,
                size: 24, // Large font size for title
              }),
            ],
            color: "0f0f0f",
            alignment: AlignmentType.CENTER, // Align to the left
          }),
        ],
        columnSpan: 2,
        verticalAlign: VerticalAlign.CENTER,
        width: {
          size: 65 * 50, // 70% width for the title
          type: WidthType.PERCENTAGE,
        },
      }),
    ],
    verticalAlign: VerticalAlign.CENTER,
    spacing: { after: 276 },
  });
  return {
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: (1440 * 2) / 2.54, // 2cm
              right: (1440 * 1.5) / 2.54, // 1.5cm
              bottom: (1440 * 2) / 2.54, // 2cm
              left: (1440 * 2.5) / 2.54, // 2.5cm
            },
          },
        },
        children: [
          //bu joyda talabnoma nomi bilan o'ng tomondagi korobka joylashgan
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "Т А Л А Б Н О М А"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: executive_organization,
                            bold: true,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: record_number,
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                          new TextRun({
                            text: date,
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 50 * 50, // 50% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "(ТРЕБОВАНИЕ)"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: organization,
                            bold: true,
                            size: 24, // Large font size for title
                          }),
                        ],
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 50 * 50, // 50% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276 },
          }),

          //orginization name
          new Paragraph({
            children: [
              new TextRun({
                text: notes.split(";")[0],
                size: 20,
                bold: true,
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________",
                size: 1,
                bold: true,
                color: "ffffff",
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 276 },
          }),
          //User details on table
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "FIO"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Ф.И.О.`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    margins: {
                      top: 100, // 100 twips = 0.1 inch
                      bottom: 100,
                      left: 100,
                      right: 100,
                    },
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // First Cell: Title "BIRTHDATE"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Дата рождения`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    margins: {
                      top: 100, // 100 twips = 0.1 inch
                      bottom: 100,
                      left: 100,
                      right: 100,
                    },
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // First Cell: Title "BIRTHPLACE"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Место рождения`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    margins: {
                      top: 100, // 100 twips = 0.1 inch
                      bottom: 100,
                      left: 100,
                      right: 100,
                    },
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // First Cell: Title "LIVEPLACE"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Место прописки`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    margins: {
                      top: 100, // 100 twips = 0.1 inch
                      bottom: 100,
                      left: 100,
                      right: 100,
                    },
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
              }),
              new TableRow({
                children: [
                  // First Cell: Title "FIO"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `${firstName} ${lastName} ${fatherName}`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    margins: {
                      top: 100, // 100 twips = 0.1 inch
                      bottom: 100,
                      left: 100,
                      right: 100,
                    },
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // First Cell: Title "BIRTHDATE"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `${birthDate} г.`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    margins: {
                      top: 100, // 100 twips = 0.1 inch
                      bottom: 100,
                      left: 100,
                      right: 100,
                    },
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // First Cell: Title "BIRTHPLACE"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `${birthPlace}`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    margins: {
                      top: 100, // 100 twips = 0.1 inch
                      bottom: 100,
                      left: 100,
                      right: 100,
                    },
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // First Cell: Title "LIVEPLACE"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `${livePlace}`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    margins: {
                      top: 100, // 100 twips = 0.1 inch
                      bottom: 100,
                      left: 100,
                      right: 100,
                    },
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            spacing: { line: 276, after: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //notes in table
          new Paragraph({
            children: [
              new TextRun({
                text: notes.split(";")[1],
                size: 20,
                break: 2,
                bold: true,
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.LEFT,
            spacing: { after: 0, before: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________",
                size: 1,
                bold: true,
                color: "ffffff",
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.LEFT,
            spacing: { after: 0, before: 276 },
          }),

          // podpis and date
          new Paragraph({
            children: [
              new TextRun({
                text: "", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                break: 2,
                color: "ffffff",
              }),
            ],
          }),
          new Table({
            rows: [...tableRows, dateRow],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //executive and phone number############################
          new Paragraph({
            children: [
              new TextRun({
                text: "", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                break: 2,
                color: "ffffff",
              }),
            ],
          }),
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "birthDate label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Бажарувчи`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Исполнитель)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthDate"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: executive_name,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "_____________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  //BirthPlace label
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Телефон`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthPlace"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: executive_phone,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        verticalAlign: VerticalAlign.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "____________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //executive and phone number
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "birthDate label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Ответственный`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthDate"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: initiator_name,
                            size: 24,
                            bold: true,
                            // underline: {
                            //   type: UnderlineType.SINGLE,
                            //   color: "000000",
                            // },
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "____________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  //BirthPlace label
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `К делу №`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthPlace"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: record_number,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        verticalAlign: VerticalAlign.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "____________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),
        ],
      },
    ],
  };
}

//Done
function generateMalumotnomaListFunc(
  organization = "ГЛАВНОМУ ВРАЧУ ГОРОДСКОГО ПСИХОНЕВРОЛОГИЧЕСКОГО\nДИСПАНСЕРА №2 (ул. Лисунова, 25)",
  status = "Психоневрологический",
  data = [],
  executive_organization = "ГОСУДАРСТВЕННАЯ СЛУЖБА\nБЕЗОПАСНОСТИ ПРИ ПРЕЗИДЕНТА\nРЕСПУБЛИКИ УЗБЕКИСТАН",
  date = "21 января 2025 г.",
  executive_name = "Иванова А.К",
  executive_phone = "87777777777",
  initiator_name = "Кузнецов М.И.",
  record_number = "182-18нг",
  signList = [],
  notes = "1. Насаби;должн подразделения"
) {
  // normalize notes to a string to avoid errors when it's not a string
  const notesStr =
    typeof notes === "string" ? notes : notes ? String(notes) : "";

  const tableRows =
    signList && signList.length > 0
      ? signList.map((item) => {
        return new TableRow({
          children: [
            // First Cell: Position with label
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${item?.position ? item?.position : ""}`,
                      bold: false,
                      underline: {
                        type: UnderlineType.SINGLE,
                        color: "000000",
                      },
                      size: 24,
                    }),
                    new TextRun({
                      text: "Лавозими (Должность)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            // Second Cell: Signature
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 24,
                    }),
                    new TextRun({
                      text: "Имзо (подпись)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            // Third Cell: Name with label
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${item?.name ? item?.name : ""}`,
                      bold: false,
                      underline: {
                        type: UnderlineType.SINGLE,
                        color: "000000",
                      },
                      size: 24,
                    }),
                    new TextRun({
                      text: "Насаби (Фамилия)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 30 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
          spacing: { after: 276 },
        });
      })
      : [
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 24,
                    }),
                    new TextRun({
                      text: "Лавозими (Должность)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 24,
                    }),
                    new TextRun({
                      text: "Имзо (подпись)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 24,
                    }),
                    new TextRun({
                      text: "Насаби (Фамилия)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 30 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
          spacing: { after: 276 },
        }),
      ];
  const dateRow = new TableRow({
    children: [
      // First Cell: Title "live place label"
      new TableCell({
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: `${date}`,
                bold: false,
                break: 1,
                size: 24, // Large font size for title
              }),
            ],
            color: "0f0f0f",
            alignment: AlignmentType.CENTER, // Align to the left
            spacing: { after: 0, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_______________________________", // Chiziqni ifodalash uchun
                size: 12, // Chiziqning o'lchami
                bold: true,
              }),
            ],
            border: {
              bottom: {
                color: "000000", // Chiziq rangi
                space: 1,
                value: "dash", // Chiziq turi
                size: 40, // Chiziq qalinligi
              },
            },
            spacing: { after: 0, before: 0 },
            alignment: AlignmentType.CENTER,
          }),
        ],
        verticalAlign: VerticalAlign.CENTER,
        width: {
          size: 35 * 50, // 70% width for the title
          type: WidthType.PERCENTAGE,
        },
      }),
      // Second Cell: Table "live place"
      new TableCell({
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: ``,
                bold: false,
                size: 24, // Large font size for title
              }),
            ],
            color: "0f0f0f",
            alignment: AlignmentType.CENTER, // Align to the left
          }),
        ],
        columnSpan: 2,
        verticalAlign: VerticalAlign.CENTER,
        width: {
          size: 65 * 50, // 70% width for the title
          type: WidthType.PERCENTAGE,
        },
      }),
    ],
    verticalAlign: VerticalAlign.CENTER,
    spacing: { after: 276 },
  });
  return {
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: (1440 * 2) / 2.54, // 2cm
              right: (1440 * 1.5) / 2.54, // 1.5cm
              bottom: (1440 * 2) / 2.54, // 2cm
              left: (1440 * 2.5) / 2.54, // 2.5cm
            },
          },
        },
        children: [
          //DSP ma'lumotlari
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "Т А Л А Б Н О М А"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `${organization}`,
                            // bold: true,
                            italic: true,
                            size: 24, // Large font size for title
                          }),
                        ],
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 92, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "(ТРЕБОВАНИЕ)"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "ДСП",
                            size: 24, // Adjust font size
                            italic: true,
                          }),
                          new TextRun({
                            text: " Экз. №_",
                            size: 24, // Adjust font size
                            italic: true,
                            break: 1,
                          }),
                        ],
                        alignment: AlignmentType.RIGHT,
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 8, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 0, after: 0 },
          }),
          //bu joyda talabnoma nomi bilan o'ng tomondagi korobka joylashgan
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "Т А Л А Б Н О М А"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: status,
                            bold: true,
                            size: 24, // Large font size for title
                          }),
                        ],
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    shading:
                      status !==
                        "Рухсатнома рад этилганлиги туғрисида билдиришнома (уведомление об ОТКАЗЕ в допуске)"
                        ? undefined
                        : {
                          fill: "FFD700", // Use shading.fill for background color
                        },

                    width: {
                      size: 70 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "(ТРЕБОВАНИЕ)"
                  new TableCell({
                    children: [
                      new Table({
                        rows: [
                          new TableRow({
                            children: [
                              new TableCell({
                                children: [
                                  new Paragraph({
                                    children: [
                                      new TextRun({
                                        text: "ПДХХ ... (кимга):",
                                        size: 24, // Adjust font size
                                      }),
                                      new TextRun({
                                        text: initiator_name,
                                        size: 24, // Adjust font size
                                      }),
                                    ],
                                    alignment: AlignmentType.CENTER,
                                  }),
                                ],
                                margins: {
                                  top: 200,
                                  bottom: 200,
                                  left: 400,
                                  right: 400,
                                },
                              }),
                            ],
                          }),
                        ],
                        alignment: AlignmentType.CENTER,
                      }),
                    ],
                    width: {
                      size: 30 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //User details on table
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "FIO"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Ф.И.О.`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    margins: {
                      top: 100, // 100 twips = 0.1 inch
                      bottom: 100,
                      left: 100,
                      right: 100,
                    },
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // First Cell: Title "BIRTHDATE"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Дата рождения`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    margins: {
                      top: 100, // 100 twips = 0.1 inch
                      bottom: 100,
                      left: 100,
                      right: 100,
                    },
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // First Cell: Title "BIRTHPLACE"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Место рождения`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    margins: {
                      top: 100, // 100 twips = 0.1 inch
                      bottom: 100,
                      left: 100,
                      right: 100,
                    },
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // First Cell: Title "LIVEPLACE"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Место прописки`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    margins: {
                      top: 100, // 100 twips = 0.1 inch
                      bottom: 100,
                      left: 100,
                      right: 100,
                    },
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
              }),
              ...data.map(
                (item) =>
                  new TableRow({
                    children: [
                      // First Cell: Title "FIO"
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [
                              new TextRun({
                                text: `${item.firstName || ""} ${item.lastName || ""
                                  } ${item.fatherName || ""}`,
                                bold: false,
                                size: 24, // Large font size for title
                              }),
                            ],
                            alignment: AlignmentType.CENTER, // Align to the left
                          }),
                        ],
                        verticalAlign: VerticalAlign.CENTER,
                        margins: {
                          top: 100, // 100 twips = 0.1 inch
                          bottom: 100,
                          left: 100,
                          right: 100,
                        },
                        width: {
                          size: 25 * 50, // 70% width for the title
                          type: WidthType.PERCENTAGE,
                        },
                      }),
                      // First Cell: Title "BIRTHDATE"
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [
                              new TextRun({
                                text: `${(item.birthDate
                                  ? item.birthDate.getFullYear()
                                  : item.birthYear) || "-"
                                  } г.`,
                                bold: false,
                                size: 24, // Large font size for title
                              }),
                            ],
                            alignment: AlignmentType.CENTER, // Align to the left
                          }),
                        ],
                        verticalAlign: VerticalAlign.CENTER,
                        margins: {
                          top: 100, // 100 twips = 0.1 inch
                          bottom: 100,
                          left: 100,
                          right: 100,
                        },
                        width: {
                          size: 25 * 50, // 70% width for the title
                          type: WidthType.PERCENTAGE,
                        },
                      }),
                      // First Cell: Title "BIRTHPLACE"
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [
                              new TextRun({
                                text: `${item.birthPlace || "-"}`,
                                bold: false,
                                size: 24, // Large font size for title
                              }),
                            ],
                            color: "0f0f0f",
                            alignment: AlignmentType.CENTER, // Align to the left
                          }),
                        ],
                        verticalAlign: VerticalAlign.CENTER,
                        margins: {
                          top: 100, // 100 twips = 0.1 inch
                          bottom: 100,
                          left: 100,
                          right: 100,
                        },
                        width: {
                          size: 25 * 50, // 70% width for the title
                          type: WidthType.PERCENTAGE,
                        },
                      }),
                      // First Cell: Title "LIVEPLACE"
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [
                              new TextRun({
                                text: `${item.residence || "-"}`,
                                bold: false,
                                size: 24, // Large font size for title
                              }),
                            ],
                            alignment: AlignmentType.CENTER, // Align to the left
                          }),
                        ],
                        verticalAlign: VerticalAlign.CENTER,
                        margins: {
                          top: 100, // 100 twips = 0.1 inch
                          bottom: 100,
                          left: 100,
                          right: 100,
                        },
                        width: {
                          size: 25 * 50, // 70% width for the title
                          type: WidthType.PERCENTAGE,
                        },
                      }),
                    ],
                  })
              ),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            spacing: { line: 276, after: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //notes in table
          new Paragraph({
            children: [
              new TextRun({
                text: notesStr.split(";")[1] || "",
                size: 20,
                break: 2,
                bold: true,
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.LEFT,
            spacing: { after: 0, before: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________",
                size: 1,
                bold: true,
                color: "ffffff",
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.LEFT,
            spacing: { after: 0, before: 276 },
          }),

          // podpis and date
          new Paragraph({
            children: [
              new TextRun({
                text: "", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                break: 2,
                color: "ffffff",
              }),
            ],
          }),
          new Table({
            rows: [...tableRows, dateRow],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //executive and phone number############################
          new Paragraph({
            children: [
              new TextRun({
                text: "", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                break: 2,
                color: "ffffff",
              }),
            ],
          }),
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "birthDate label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Бажарувчи`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Исполнитель)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthDate"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: executive_name,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "_____________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  //BirthPlace label
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Телефон`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthPlace"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: executive_phone,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        verticalAlign: VerticalAlign.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "____________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //executive and phone number
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "birthDate label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Ответственный`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthDate"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: initiator_name,
                            size: 24,
                            bold: true,
                            // underline: {
                            //   type: UnderlineType.SINGLE,
                            //   color: "000000",
                            // },
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "____________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  //BirthPlace label
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `К делу №`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthPlace"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: record_number,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        verticalAlign: VerticalAlign.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "____________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),
        ],
      },
    ],
  };
}

//Done
function generatePsychoRaportList(
  organization = "ГЛАВНОМУ ВРАЧУ ГОРОДСКОГО ПСИХОНЕВРОЛОГИЧЕСКОГО\nДИСПАНСЕРА №2 (ул. Лисунова, 25)",
  data = [],
  executive_organization = "ГОСУДАРСТВЕННАЯ СЛУЖБА\nБЕЗОПАСНОСТИ ПРИ ПРЕЗИДЕНТА\nРЕСПУБЛИКИ УЗБЕКИСТАН",
  date = "21 января 2025 г.",
  executive_name = "Иванова А.К",
  executive_phone = "87777777777",
  initiator_name = "Кузнецов М.И.",
  record_number = "182-18нг",
  signList = [],
  notes = "1. Насаби;должн подразделения"
) {
  // normalize notes to a string to avoid errors when it's not a string
  const notesStr =
    typeof notes === "string" ? notes : notes ? String(notes) : "";

  const tableRows =
    signList && signList.length > 0
      ? signList.map((item) => {
        return new TableRow({
          children: [
            // First Cell: Position with label
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${item?.position ? item?.position : ""}`,
                      bold: false,
                      underline: {
                        type: UnderlineType.SINGLE,
                        color: "000000",
                      },
                      size: 28,
                    }),
                    new TextRun({
                      text: "Лавозими (Должность)",
                      size: 28,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            // Second Cell: Signature
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 28,
                    }),
                    new TextRun({
                      text: "Имзо (подпись)",
                      size: 28,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            // Third Cell: Name with label
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${item?.name ? item?.name : ""}`,
                      bold: false,
                      underline: {
                        type: UnderlineType.SINGLE,
                        color: "000000",
                      },
                      size: 28,
                    }),
                    new TextRun({
                      text: "Насаби (Фамилия)",
                      size: 28,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 30 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
          spacing: { after: 276 },
        });
      })
      : [
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 28,
                    }),
                    new TextRun({
                      text: "Лавозими (Должность)",
                      size: 28,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 28,
                    }),
                    new TextRun({
                      text: "Имзо (подпись)",
                      size: 28,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 28,
                    }),
                    new TextRun({
                      text: "Насаби (Фамилия)",
                      size: 28,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 30 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
          spacing: { after: 276 },
        }),
      ];
  const dateRow = new TableRow({
    children: [
      // First Cell: Title "live place label"
      new TableCell({
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: `${date}`,
                bold: false,
                break: 1,
                size: 28, // Large font size for title
              }),
            ],
            color: "0f0f0f",
            alignment: AlignmentType.CENTER, // Align to the left
            spacing: { after: 0, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_______________________________", // Chiziqni ifodalash uchun
                size: 12, // Chiziqning o'lchami
                bold: true,
              }),
            ],
            border: {
              bottom: {
                color: "000000", // Chiziq rangi
                space: 1,
                value: "dash", // Chiziq turi
                size: 40, // Chiziq qalinligi
              },
            },
            spacing: { after: 0, before: 0 },
            alignment: AlignmentType.CENTER,
          }),
        ],
        verticalAlign: VerticalAlign.CENTER,
        width: {
          size: 35 * 50, // 70% width for the title
          type: WidthType.PERCENTAGE,
        },
      }),
      // Second Cell: Table "live place"
      new TableCell({
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: ``,
                bold: false,
                size: 28, // Large font size for title
              }),
            ],
            color: "0f0f0f",
            alignment: AlignmentType.CENTER, // Align to the left
          }),
        ],
        columnSpan: 2,
        verticalAlign: VerticalAlign.CENTER,
        width: {
          size: 65 * 50, // 70% width for the title
          type: WidthType.PERCENTAGE,
        },
      }),
    ],
    verticalAlign: VerticalAlign.CENTER,
    spacing: { after: 276 },
  });
  return {
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: (1440 * 2) / 2.54, // 2cm
              right: (1440 * 1.5) / 2.54, // 1.5cm
              bottom: (1440 * 2) / 2.54, // 2cm
              left: (1440 * 2.5) / 2.54, // 2.5cm
            },
          },
        },
        children: [
          //bu joyda talabnoma nomi bilan o'ng tomondagi korobka joylashgan
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "Т А Л А Б Н О М А"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: executive_organization,
                            bold: true,
                            size: 28, // Large font size for title
                          }),
                          new TextRun({
                            text: record_number,
                            size: 28, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                          new TextRun({
                            text: date,
                            size: 28, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 50 * 50, // 50% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "(ТРЕБОВАНИЕ)"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: organization,
                            bold: true,
                            size: 28, // Large font size for title
                          }),
                        ],
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 50 * 50, // 50% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276 },
          }),

          //orginization name
          new Paragraph({
            children: [
              new TextRun({
                text: notesStr.split(";")[0] || "",
                size: 20,
                bold: true,
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________",
                size: 12,
                bold: true,
                color: "ffffff",
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 276 },
          }),

          //User details on table
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "FIO"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Ф.И.О.`,
                            bold: false,
                            size: 28, // Large font size for title
                          }),
                        ],
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    margins: {
                      top: 100, // 100 twips = 0.1 inch
                      bottom: 100,
                      left: 100,
                      right: 100,
                    },
                    width: {
                      size: 20 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // First Cell: Title "BIRTHDATE"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Дата рождения`,
                            bold: false,
                            size: 28, // Large font size for title
                          }),
                        ],
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    margins: {
                      top: 100, // 100 twips = 0.1 inch
                      bottom: 100,
                      left: 100,
                      right: 100,
                    },
                    width: {
                      size: 20 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // First Cell: Title "BIRTHPLACE"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Место рождения`,
                            bold: false,
                            size: 28, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    margins: {
                      top: 100, // 100 twips = 0.1 inch
                      bottom: 100,
                      left: 100,
                      right: 100,
                    },
                    width: {
                      size: 20 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // First Cell: Title "LIVEPLACE"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Место прописки`,
                            bold: false,
                            size: 28, // Large font size for title
                          }),
                        ],
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    margins: {
                      top: 100, // 100 twips = 0.1 inch
                      bottom: 100,
                      left: 100,
                      right: 100,
                    },
                    width: {
                      size: 40 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
              }),
              ...data.map(
                (item) =>
                  new TableRow({
                    children: [
                      // First Cell: Title "FIO"
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [
                              new TextRun({
                                text: `${item.lastName || ""} ${item.firstName || ""
                                  } ${item.fatherName || ""}`,
                                bold: false,
                                size: 28, // Large font size for title
                              }),
                            ],
                            alignment: AlignmentType.CENTER, // Align to the left
                          }),
                        ],
                        verticalAlign: VerticalAlign.CENTER,
                        margins: {
                          top: 100, // 100 twips = 0.1 inch
                          bottom: 100,
                          left: 100,
                          right: 100,
                        },
                        width: {
                          size: 20 * 50, // 70% width for the title
                          type: WidthType.PERCENTAGE,
                        },
                      }),
                      // First Cell: Title "BIRTHDATE"
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [
                              new TextRun({
                                text: `${(item.birthDate
                                  ? item.birthDate.getFullYear()
                                  : item.birthYear) || "-"
                                  } г.`,
                                bold: false,
                                size: 28, // Large font size for title
                              }),
                            ],
                            alignment: AlignmentType.CENTER, // Align to the left
                          }),
                        ],
                        verticalAlign: VerticalAlign.CENTER,
                        margins: {
                          top: 100, // 100 twips = 0.1 inch
                          bottom: 100,
                          left: 100,
                          right: 100,
                        },
                        width: {
                          size: 20 * 50, // 70% width for the title
                          type: WidthType.PERCENTAGE,
                        },
                      }),
                      // First Cell: Title "BIRTHPLACE"
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [
                              new TextRun({
                                text: `${item.birthPlace || "-"}`,
                                bold: false,
                                size: 28, // Large font size for title
                              }),
                            ],
                            color: "0f0f0f",
                            alignment: AlignmentType.CENTER, // Align to the left
                          }),
                        ],
                        verticalAlign: VerticalAlign.CENTER,
                        margins: {
                          top: 100, // 100 twips = 0.1 inch
                          bottom: 100,
                          left: 100,
                          right: 100,
                        },
                        width: {
                          size: 20 * 50, // 70% width for the title
                          type: WidthType.PERCENTAGE,
                        },
                      }),
                      // First Cell: Title "LIVEPLACE"
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [
                              new TextRun({
                                text: `${item.residence || "-"}`,
                                bold: false,
                                size: 28, // Large font size for title
                              }),
                            ],
                            alignment: AlignmentType.CENTER, // Align to the left
                          }),
                        ],
                        verticalAlign: VerticalAlign.CENTER,
                        margins: {
                          top: 100, // 100 twips = 0.1 inch
                          bottom: 100,
                          left: 100,
                          right: 100,
                        },
                        width: {
                          size: 40 * 50, // 70% width for the title
                          type: WidthType.PERCENTAGE,
                        },
                      }),
                    ],
                  })
              ),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            spacing: { line: 276, after: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //notes in table
          new Paragraph({
            children: [
              new TextRun({
                text: notesStr.split(";")[1] || "",
                size: 28,
                break: 1,
                bold: true,
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.LEFT,
            spacing: { after: 0, before: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________",
                size: 1,
                bold: true,
                color: "ffffff",
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.LEFT,
            spacing: { after: 0, before: 276 },
          }),

          // podpis and date
          new Paragraph({
            children: [
              new TextRun({
                text: "", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                break: 2,
                color: "ffffff",
              }),
            ],
          }),
          new Table({
            rows: [...tableRows, dateRow],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //executive and phone number############################
          new Paragraph({
            children: [
              new TextRun({
                text: "", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                break: 2,
                color: "ffffff",
              }),
            ],
          }),
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "birthDate label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Бажарувчи`,
                            bold: false,
                            size: 28, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Исполнитель)",
                            size: 28, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthDate"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: executive_name,
                            size: 28,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "_____________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  //BirthPlace label
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Телефон`,
                            bold: false,
                            size: 28, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthPlace"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: executive_phone,
                            size: 28,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        verticalAlign: VerticalAlign.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "____________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 28, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 12, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //executive and phone number
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "birthDate label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Ответственный`,
                            bold: false,
                            size: 28, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthDate"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: initiator_name,
                            size: 28,
                            bold: true,
                            // underline: {
                            //   type: UnderlineType.SINGLE,
                            //   color: "000000",
                            // },
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "____________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 28, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  //BirthPlace label
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `К делу №`,
                            bold: false,
                            size: 28, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthPlace"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: record_number,
                            size: 28,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        verticalAlign: VerticalAlign.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "____________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 12, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),
        ],
      },
    ],
  };
}

// #done
function generateRelative_MVD_SGB_OSU(data) {
  return {
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: (1440 * 2) / 2.54, // 2cm
              right: (1440 * 1.5) / 2.54, // 1.5cm
              bottom: (1440 * 2) / 2.54, // 2cm
              left: (1440 * 2.5) / 2.54, // 2.5cm
            },
          },
        },
        children: [
          //bu joyda talabnoma nomi bilan o'ng tomondagi korobka joylashgan
          name != "" &&
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "Т А Л А Б Н О М А"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: name,
                            bold: true,
                            size: 48, // Large font size for title
                          }),
                          new TextRun({
                            text: "(ТРЕБОВАНИЕ)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 70 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "(ТРЕБОВАНИЕ)"
                  new TableCell({
                    children: [
                      new Table({
                        rows: [
                          new TableRow({
                            children: [
                              new TableCell({
                                children: [
                                  new Paragraph({
                                    children: [
                                      new TextRun({
                                        text: "1",
                                        size: 32, // Adjust font size
                                      }),
                                      new TextRun({
                                        text: "Булим индекси",
                                        size: 16, // Adjust font size
                                        break: 1,
                                      }),
                                      new TextRun({
                                        text: "(Индекс отдела)",
                                        size: 16, // Adjust font size
                                        break: 1,
                                      }),
                                    ],
                                    alignment: AlignmentType.CENTER,
                                  }),
                                ],
                                margins: {
                                  top: 200,
                                  bottom: 200,
                                  left: 400,
                                  right: 400,
                                },
                              }),
                            ],
                          }),
                        ],
                        alignment: AlignmentType.CENTER,
                      }),
                    ],
                    width: {
                      size: 30 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276 },
          }),
          //orginization name
          new Paragraph({
            children: [
              new TextRun({
                text: organization,
                size: 32,
                bold: true,
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "________________________________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 12, // Chiziqning o'lchami
                bold: true,
              }),
            ],
            border: {
              bottom: {
                color: "ffffff", // Chiziq rangi
                space: 1,
                value: "dash", // Chiziq turi
                size: 40, // Chiziq qalinligi
              },
            },
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 0 },
          }),
          name != ""
            ? new Paragraph({
              children: [
                new TextRun({
                  text: "Талабнома юборилаётган идора ва бўлинма номи",
                  size: 24,
                  color: "0f0f0f",
                  bold: false,
                }),
                new TextRun({
                  text: "(Наименование органа и подразделения, куда направляется требование)",
                  size: 24,
                  break: 1,
                  color: "0f0f0f",
                  bold: false,
                }),
              ],
              // indent:{ firstLine:900},
              alignment: AlignmentType.CENTER,
              spacing: { after: 0 },
            })
            : new Paragraph({
              children: [
                new TextRun({
                  text: "_________________________________________________________________________________________________________________________________________",
                  size: 1,
                  bold: true,
                  color: "ffffff",
                }),
              ],
            }),

          //firstName
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "firstName"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `1. Насаби`,
                            bold: false,
                            break: 1,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Фамилия)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 15 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "(ТРЕБОВАНИЕ)"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: firstName,
                            size: 28,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                    ],
                    width: {
                      size: 85 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),
          //LastName and fatherName
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "firstName"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `2. Исм-шарифи`,
                            bold: false,
                            break: 1,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Имя и отчество)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "(ТРЕБОВАНИЕ)"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `${lastName} ${fatherName}`,
                            size: 32,
                            bold: true,
                            // underline: {
                            //   type: UnderlineType.SINGLE,
                            //   color: "000000",
                            // },
                          }),
                        ],
                        verticalAlign: VerticalAlign.CENTER,
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "____________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                    ],
                    width: {
                      size: 75 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),
          //BirthDate and BirthPlace
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "birthDate label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `3. Туғилган йили`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Год рождения)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthDate"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `${birthDate} г.`,
                            size: 24,
                            bold: true,
                            // underline: {
                            //   type: UnderlineType.SINGLE,
                            //   color: "000000",
                            // },
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "_____________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  //BirthPlace label
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `4. Туғилган жойи`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Место рождения)",
                            size: 24, // Adjust font size
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthPlace"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text:
                              birthPlace?.length > 20
                                ? birthPlace.split(" ").slice(0, 2).join(" ")
                                : birthPlace,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.LEFT,
                        verticalAlign: VerticalAlign.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
              birthPlace?.length > 20 && birthPlace?.split(" ").length >= 2
                ? new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: birthPlace?.split(" ").slice(2).join(" "),
                              bold: false,
                              size: 24, // Large font size for title
                              underline: {
                                type: UnderlineType.SINGLE,
                                color: "000000",
                              },
                            }),
                          ],
                          color: "0f0f0f",
                          alignment: AlignmentType.LEFT, // Align to the left
                        }),
                      ],
                      verticalAlign: VerticalAlign.CENTER,
                      width: {
                        size: 100 * 50, // 70% width for the title
                        type: WidthType.PERCENTAGE,
                      },
                      columnSpan: 4,
                    }),
                  ],
                  verticalAlign: VerticalAlign.LEFT,
                  spacing: { after: 276, before: 276 },
                })
                : new TableRow({
                  children: [
                    new TableCell({
                      children: [],
                    }),
                  ],
                }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //live place
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "live place label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `5. Туғилган`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "манзили (Адрес)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "live place"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text:
                              livePlace?.length > 30 &&
                                livePlace?.split(" ").length >= 5
                                ? livePlace.split(" ").slice(0, 5).join(" ")
                                : livePlace,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                    ],
                    width: {
                      size: 75 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
              livePlace?.length > 30 && livePlace?.split(" ").length >= 5
                ? new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: livePlace?.split(" ").slice(5).join(" "),
                              bold: true,
                              size: 24, // Large font size for title
                            }),
                          ],
                          color: "0f0f0f",
                          alignment: AlignmentType.LEFT, // Align to the left
                        }),
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: "________________________________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                              size: 12, // Chiziqning o'lchami
                              bold: true,
                            }),
                          ],
                          border: {
                            bottom: {
                              color: "000000", // Chiziq rangi
                              space: 1,
                              value: "dash", // Chiziq turi
                              size: 40, // Chiziq qalinligi
                            },
                          },
                          alignment: AlignmentType.CENTER,
                          spacing: { after: 0, before: 0 },
                        }),
                      ],
                      verticalAlign: VerticalAlign.CENTER,
                      width: {
                        size: 100 * 50, // 70% width for the title
                        type: WidthType.PERCENTAGE,
                      },
                      columnSpan: 2,
                    }),
                  ],
                  verticalAlign: VerticalAlign.LEFT,
                  spacing: { after: 276, before: 276 },
                })
                : new TableRow({
                  children: [
                    new TableCell({
                      children: [],
                    }),
                  ],
                }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //workplace and position
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "live place label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `6. Иш жойи ва лавозими `,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Место работы и должность)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 35 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "live place"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text:
                              workplace.split(" ")?.length > 4 &&
                                workplace?.length > 30
                                ? workplace.split(" ").slice(0, 4).join(" ")
                                : workplace,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        alignment: AlignmentType.LEFT,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                    ],
                    width: {
                      size: 65 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
              workplace.split(" ")?.length > 4 && workplace?.length > 30
                ? new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: workplace?.split(" ").slice(4).join(" "),
                              bold: true,
                              size: 24, // Large font size for title
                            }),
                          ],
                          color: "0f0f0f",
                          alignment: AlignmentType.LEFT, // Align to the left
                        }),
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: "________________________________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                              size: 12, // Chiziqning o'lchami
                              bold: true,
                            }),
                          ],
                          border: {
                            bottom: {
                              color: "000000", // Chiziq rangi
                              space: 1,
                              value: "dash", // Chiziq turi
                              size: 40, // Chiziq qalinligi
                            },
                          },
                          alignment: AlignmentType.CENTER,
                          spacing: { after: 0, before: 0 },
                        }),
                      ],
                      verticalAlign: VerticalAlign.CENTER,
                      width: {
                        size: 100 * 50, // 70% width for the title
                        type: WidthType.PERCENTAGE,
                      },
                      columnSpan: 2,
                    }),
                  ],
                  verticalAlign: VerticalAlign.LEFT,
                  spacing: { after: 276, before: 276 },
                })
                : new TableRow({
                  children: [
                    new TableCell({
                      children: [],
                    }),
                  ],
                }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //request
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "live place label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `7. Қандай маълумот керак`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Какая нужна справка)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 35 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "live place"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text:
                              request_data.split(" ")?.length > 2 &&
                                request_data?.length > 30
                                ? request_data.split(" ").slice(0, 2).join(" ")
                                : request_data,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        alignment: AlignmentType.LEFT,
                        verticalAlign: VerticalAlign.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                    ],
                    width: {
                      size: 65 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                    verticalAlign: VerticalAlign.CENTER,
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
              request_data.split(" ")?.length > 2 && request_data?.length > 30
                ? new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: request_data
                                ?.split(" ")
                                .slice(3)
                                .join(" "),
                              bold: false,
                              size: 24, // Large font size for title
                            }),
                          ],
                          color: "0f0f0f",
                          alignment: AlignmentType.LEFT, // Align to the left
                        }),
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: "________________________________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                              size: 12, // Chiziqning o'lchami
                              bold: true,
                            }),
                          ],
                          border: {
                            bottom: {
                              color: "000000", // Chiziq rangi
                              space: 1,
                              value: "dash", // Chiziq turi
                              size: 40, // Chiziq qalinligi
                            },
                          },
                          alignment: AlignmentType.CENTER,
                          spacing: { after: 0, before: 0 },
                        }),
                      ],
                      verticalAlign: VerticalAlign.CENTER,
                      width: {
                        size: 100 * 50, // 70% width for the title
                        type: WidthType.PERCENTAGE,
                      },
                      columnSpan: 2,
                    }),
                  ],
                  verticalAlign: VerticalAlign.LEFT,
                  spacing: { after: 276, before: 276 },
                })
                : new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [new TextRun({ text: "" })],
                        }),
                      ],
                    }),
                  ],
                }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //masul tashkilot
          new Paragraph({
            children: [
              new TextRun({
                text: executive_organization,
                size: 24,
                bold: true,
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "________________________________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 12, // Chiziqning o'lchami
                bold: true,
              }),
            ],
            border: {
              bottom: {
                color: "000000", // Chiziq rangi
                space: 1,
                value: "dash", // Chiziq turi
                size: 40, // Chiziq qalinligi
              },
            },
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Идора ва бўлинма номи  (Наименование органа и подразделения)",
                size: 24,
                color: "0f0f0f",
                bold: false,
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.CENTER,
            spacing: { after: 0 },
          }),

          // podpis and date
          new Paragraph({
            children: [
              new TextRun({
                text: "", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                break: 2,
                color: "ffffff",
              }),
            ],
          }),
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "live place label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `____________________`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "Лавозими (Должность)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 35 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "live place"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `____________________`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "Имзо (подпись)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 35 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `____________________`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "Насаби (Фамилия)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 30 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
              new TableRow({
                children: [
                  // First Cell: Title "live place label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `${date}`,
                            bold: false,
                            break: 1,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                        spacing: { after: 0, before: 0 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "_______________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        spacing: { after: 0, before: 0 },
                        alignment: AlignmentType.CENTER,
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 35 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "live place"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: ``,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    columnSpan: 2,
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 65 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //executive and phone number
          new Paragraph({
            children: [
              new TextRun({
                text: "", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                break: 2,
                color: "ffffff",
              }),
            ],
          }),
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "birthDate label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Бажарувчи`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Исполнитель)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthDate"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: executive_name,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "_____________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  //BirthPlace label
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Телефон`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthPlace"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: executive_phone,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        verticalAlign: VerticalAlign.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "____________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //executive and phone number
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "birthDate label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Ответственный`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthDate"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: initiator_name,
                            size: 24,
                            bold: true,
                            // underline: {
                            //   type: UnderlineType.SINGLE,
                            //   color: "000000",
                            // },
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "____________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  //BirthPlace label
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `К делу №`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthPlace"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: record_number,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        verticalAlign: VerticalAlign.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "____________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),
        ],
      },
    ],
  };
}

// #DONE
function generateAVR(
  name = "ГСБП Республики Узбекистан",
  organization = "СГБ Республики Узбекистан",
  raportName = "СЛУЖЕБНАЯ  ЗАПИСКА",
  firstName = "АБДУКАХХОРОВ",
  lastName = "ЗАЙНИДДИН",
  fatherName = "РАХМОНОВИЧ",
  birthDate = "1990",
  birthPlace = "Самаркандская область",
  nationality = "Узбек",
  residence = "Самаркандская область, Иштиханский район, мсг. Шехляркент",
  workplace = "Министерство юстиции Республики Узбекистан, Юридический департамент",
  passport = "Uzbekistan",
  travel = " 20023 Uzbekistan",
  request_data = "к/м",
  notes = "проверка по учетам",
  date = "21 января 2025 г.",
  executive_name = "Иванова А.К",
  executive_phone = "87777777777",
  initiator_name = "Кузнецов М.И.",
  record_number = "182-18нг",
  signList = [],
  additional_information = "дополнительная информация",
  signed_fio = "Иванов А.К.",
  signed_position = "Генеральный директор"
) {
  const tableRows =
    signList && signList.length > 0
      ? signList.map((item) => {
        return new TableRow({
          children: [
            // First Cell: Position with label
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${item?.position ? item?.position : ""}`,
                      bold: false,
                      underline: {
                        type: UnderlineType.SINGLE,
                        color: "000000",
                      },
                      size: 24,
                    }),
                    new TextRun({
                      text: "Лавозими (Должность)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            // Second Cell: Signature
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 24,
                    }),
                    new TextRun({
                      text: "Имзо (подпись)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            // Third Cell: Name with label
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${item?.name ? item?.name : ""}`,
                      bold: false,
                      underline: {
                        type: UnderlineType.SINGLE,
                        color: "000000",
                      },
                      size: 24,
                    }),
                    new TextRun({
                      text: "Насаби (Фамилия)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 30 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
          spacing: { after: 276 },
        });
      })
      : [
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 24,
                    }),
                    new TextRun({
                      text: "Лавозими (Должность)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 24,
                    }),
                    new TextRun({
                      text: "Имзо (подпись)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 24,
                    }),
                    new TextRun({
                      text: "Насаби (Фамилия)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 30 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
          spacing: { after: 276 },
        }),
      ];
  const dateRow = new TableRow({
    children: [
      // First Cell: Title "live place label"
      new TableCell({
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: `${date}`,
                bold: false,
                break: 1,
                size: 24, // Large font size for title
              }),
            ],
            color: "0f0f0f",
            alignment: AlignmentType.CENTER, // Align to the left
            spacing: { after: 0, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_______________________________", // Chiziqni ifodalash uchun
                size: 12, // Chiziqning o'lchami
                bold: true,
              }),
            ],
            border: {
              bottom: {
                color: "000000", // Chiziq rangi
                space: 1,
                value: "dash", // Chiziq turi
                size: 40, // Chiziq qalinligi
              },
            },
            spacing: { after: 0, before: 0 },
            alignment: AlignmentType.CENTER,
          }),
        ],
        verticalAlign: VerticalAlign.CENTER,
        width: {
          size: 35 * 50, // 70% width for the title
          type: WidthType.PERCENTAGE,
        },
      }),
      // Second Cell: Table "live place"
      new TableCell({
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: ``,
                bold: false,
                size: 24, // Large font size for title
              }),
            ],
            color: "0f0f0f",
            alignment: AlignmentType.CENTER, // Align to the left
          }),
        ],
        columnSpan: 2,
        verticalAlign: VerticalAlign.CENTER,
        width: {
          size: 65 * 50, // 70% width for the title
          type: WidthType.PERCENTAGE,
        },
      }),
    ],
    verticalAlign: VerticalAlign.CENTER,
    spacing: { after: 276 },
  });
  return {
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: (1440 * 2) / 2.54, // 2cm
              right: (1440 * 1.5) / 2.54, // 1.5cm
              bottom: (1440 * 2) / 2.54, // 2cm
              left: (1440 * 2.5) / 2.54, // 2.5cm
            },
          },
        },
        children: [
          //orginization name
          new Paragraph({
            children: [
              new TextRun({
                text: name,
                size: 32,
                bold: true,
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "________________________________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 12, // Chiziqning o'lchami
                bold: true,
              }),
            ],
            border: {
              bottom: {
                color: "ffffff", // Chiziq rangi
                space: 1,
                value: "dash", // Chiziq turi
                size: 40, // Chiziq qalinligi
              },
            },
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 0 },
          }),
          //Executor organization
          new Paragraph({
            children: [
              new TextRun({
                text: raportName,
                size: 32,
                bold: true,
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: organization,
                size: 32,
                bold: true,
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "________________________________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 12, // Chiziqning o'lchami
                bold: true,
              }),
              new TextRun({
                text: "В связи с оформлением...:", // Chiziqni ifodalash uchun
                size: 12, // Chiziqning o'lchami
                bold: true,
              }),
            ],
            border: {
              bottom: {
                color: "ffffff", // Chiziq rangi
                space: 1,
                value: "dash", // Chiziq turi
                size: 40, // Chiziq qalinligi
              },
            },
            alignment: AlignmentType.LEFT,
            spacing: { after: 0, before: 0 },
          }),
          //lastName
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "firstName"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `1. Насаби`,
                            bold: false,
                            break: 1,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Фамилия)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 15 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "(ТРЕБОВАНИЕ)"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: lastName?.toUpperCase() || "",
                            size: 28,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                    ],
                    width: {
                      size: 85 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),
          //LastName and fatherName
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "firstName"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `2. Исм-шарифи`,
                            bold: false,
                            break: 1,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Имя и отчество)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "(ТРЕБОВАНИЕ)"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `${firstName?.toUpperCase() || ""} ${fatherName?.toUpperCase() || ""
                              }`,
                            size: 28,
                            bold: true,
                            // underline: {
                            //   type: UnderlineType.SINGLE,
                            //   color: "000000",
                            // },
                          }),
                        ],
                        verticalAlign: VerticalAlign.CENTER,
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "____________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                    ],
                    width: {
                      size: 75 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),
          //BirthDate and BirthPlace
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "birthDate label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `3. Туғилган йили`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Год рождения)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthDate"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `${birthDate} г.`,
                            size: 24,
                            bold: true,
                            // underline: {
                            //   type: UnderlineType.SINGLE,
                            //   color: "000000",
                            // },
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "_____________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  //BirthPlace label
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `4. Туғилган жойи`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Место рождения)",
                            size: 24, // Adjust font size
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthPlace"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text:
                              birthPlace?.length > 20
                                ? birthPlace.split(" ").slice(0, 2).join(" ")
                                : birthPlace,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.LEFT,
                        verticalAlign: VerticalAlign.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
              birthPlace?.length > 20 && birthPlace?.split(" ").length >= 2
                ? new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: birthPlace?.split(" ").slice(2).join(" "),
                              bold: false,
                              size: 24, // Large font size for title
                              underline: {
                                type: UnderlineType.SINGLE,
                                color: "000000",
                              },
                            }),
                          ],
                          color: "0f0f0f",
                          alignment: AlignmentType.LEFT, // Align to the left
                        }),
                      ],
                      verticalAlign: VerticalAlign.CENTER,
                      width: {
                        size: 100 * 50, // 70% width for the title
                        type: WidthType.PERCENTAGE,
                      },
                      columnSpan: 4,
                    }),
                  ],
                  verticalAlign: VerticalAlign.LEFT,
                  spacing: { after: 276, before: 276 },
                })
                : new TableRow({
                  children: [
                    new TableCell({
                      children: [],
                    }),
                  ],
                }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //nationality
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "live place label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `5. Национальность:`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 35 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "live place"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: nationality,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        alignment: AlignmentType.LEFT,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                    ],
                    width: {
                      size: 65 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //Гражданство
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "live place label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `6. Гражданство`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 35 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "live place"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: residence,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        alignment: AlignmentType.LEFT,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                    ],
                    width: {
                      size: 65 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          // //live place
          // new Table({
          //   rows: [
          //     new TableRow({
          //       children: [
          //         // First Cell: Title "live place label"
          //         new TableCell({
          //           children: [
          //             new Paragraph({
          //               children: [
          //                 new TextRun({
          //                   text: `5. Туғилган`,
          //                   bold: false,
          //                   size: 24, // Large font size for title
          //                 }),
          //                 new TextRun({
          //                   text: "манзили (Адрес)",
          //                   size: 24, // Adjust font size
          //                   font: "Times New Roman",
          //                   break: 1,
          //                 }),
          //               ],
          //               color: "0f0f0f",
          //               alignment: AlignmentType.LEFT, // Align to the left
          //             }),
          //           ],
          //           verticalAlign: VerticalAlign.CENTER,
          //           width: {
          //             size: 25 * 50, // 70% width for the title
          //             type: WidthType.PERCENTAGE,
          //           },
          //         }),
          //         // Second Cell: Table "live place"
          //         new TableCell({
          //           children: [
          //             new Paragraph({
          //               children: [
          //                 new TextRun({
          //                   text:
          //                     livePlace?.length > 30 &&
          //                     livePlace?.split(" ").length >= 5
          //                       ? livePlace.split(" ").slice(0, 5).join(" ")
          //                       : livePlace,
          //                   size: 24,
          //                   bold: true,
          //                 }),
          //               ],
          //               alignment: AlignmentType.CENTER,
          //               spacing: { after: 0, before: 276 },
          //             }),
          //             new Paragraph({
          //               children: [
          //                 new TextRun({
          //                   text: "________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
          //                   size: 12, // Chiziqning o'lchami
          //                   bold: true,
          //                 }),
          //               ],
          //               border: {
          //                 bottom: {
          //                   color: "000000", // Chiziq rangi
          //                   space: 1,
          //                   value: "dash", // Chiziq turi
          //                   size: 40, // Chiziq qalinligi
          //                 },
          //               },
          //               alignment: AlignmentType.CENTER,
          //               spacing: { after: 0, before: 0 },
          //             }),
          //           ],
          //           width: {
          //             size: 75 * 50, // 30% width for the table
          //             type: WidthType.PERCENTAGE,
          //           },
          //         }),
          //       ],
          //       verticalAlign: VerticalAlign.CENTER,
          //       spacing: { after: 276 },
          //     }),
          //     livePlace?.length > 30 && livePlace?.split(" ").length >= 5
          //       ? new TableRow({
          //           children: [
          //             new TableCell({
          //               children: [
          //                 new Paragraph({
          //                   children: [
          //                     new TextRun({
          //                       text: livePlace?.split(" ").slice(5).join(" "),
          //                       bold: true,
          //                       size: 24, // Large font size for title
          //                     }),
          //                   ],
          //                   color: "0f0f0f",
          //                   alignment: AlignmentType.LEFT, // Align to the left
          //                 }),
          //                 new Paragraph({
          //                   children: [
          //                     new TextRun({
          //                       text: "________________________________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
          //                       size: 12, // Chiziqning o'lchami
          //                       bold: true,
          //                     }),
          //                   ],
          //                   border: {
          //                     bottom: {
          //                       color: "000000", // Chiziq rangi
          //                       space: 1,
          //                       value: "dash", // Chiziq turi
          //                       size: 40, // Chiziq qalinligi
          //                     },
          //                   },
          //                   alignment: AlignmentType.CENTER,
          //                   spacing: { after: 0, before: 0 },
          //                 }),
          //               ],
          //               verticalAlign: VerticalAlign.CENTER,
          //               width: {
          //                 size: 100 * 50, // 70% width for the title
          //                 type: WidthType.PERCENTAGE,
          //               },
          //               columnSpan: 2,
          //             }),
          //           ],
          //           verticalAlign: VerticalAlign.LEFT,
          //           spacing: { after: 276, before: 276 },
          //         })
          //       : new TableRow({
          //           children: [
          //             new TableCell({
          //               children: [],
          //             }),
          //           ],
          //         }),
          //   ],
          //   width: {
          //     size: 100 * 50, // Ensure the table spans the full width of the page
          //     type: WidthType.PERCENTAGE,
          //   },
          //   alignment: AlignmentType.CENTER, // Center-align the entire table
          //   verticalAlign: VerticalAlign.CENTER,
          //   borders: {
          //     top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          //     bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          //     left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          //     right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          //     insideHorizontal: {
          //       style: BorderStyle.NONE,
          //       size: 0,
          //       color: "FFFFFF",
          //     },
          //     insideVertical: {
          //       style: BorderStyle.NONE,
          //       size: 0,
          //       color: "FFFFFF",
          //     },
          //   },
          //   spacing: { line: 276, after: 276, before: 0 },
          // }),
          // new Paragraph({
          //   children: [
          //     new TextRun({
          //       text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
          //       size: 1, // Chiziqning o'lchami
          //       bold: true,
          //       color: "ffffff",
          //     }),
          //   ],
          //   spacing: { after: 0, before: 0 },
          // }),

          //workplace and position
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "live place label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `7. Иш жойи ва лавозими `,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Место работы и должность)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 35 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "live place"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text:
                              workplace.split(" ")?.length > 4 &&
                                workplace?.length > 30
                                ? workplace.split(" ").slice(0, 4).join(" ")
                                : workplace,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        alignment: AlignmentType.LEFT,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                    ],
                    width: {
                      size: 65 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
              workplace.split(" ")?.length > 4 && workplace?.length > 30
                ? new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: workplace?.split(" ").slice(4).join(" "),
                              bold: true,
                              size: 24, // Large font size for title
                            }),
                          ],
                          color: "0f0f0f",
                          alignment: AlignmentType.LEFT, // Align to the left
                        }),
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: "________________________________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                              size: 12, // Chiziqning o'lchami
                              bold: true,
                            }),
                          ],
                          border: {
                            bottom: {
                              color: "000000", // Chiziq rangi
                              space: 1,
                              value: "dash", // Chiziq turi
                              size: 40, // Chiziq qalinligi
                            },
                          },
                          alignment: AlignmentType.CENTER,
                          spacing: { after: 0, before: 0 },
                        }),
                      ],
                      verticalAlign: VerticalAlign.CENTER,
                      width: {
                        size: 100 * 50, // 70% width for the title
                        type: WidthType.PERCENTAGE,
                      },
                      columnSpan: 2,
                    }),
                  ],
                  verticalAlign: VerticalAlign.LEFT,
                  spacing: { after: 276, before: 276 },
                })
                : new TableRow({
                  children: [
                    new TableCell({
                      children: [],
                    }),
                  ],
                }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //passport
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "live place label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `8. Паспорт: `,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 35 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "live place"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: passport,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        alignment: AlignmentType.LEFT,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                    ],
                    width: {
                      size: 65 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //when traveel
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "live place label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `9. Когда и где был за границей: `,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 35 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "live place"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: travel,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        alignment: AlignmentType.LEFT,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                    ],
                    width: {
                      size: 65 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          // //Другие дополнительные данные
          // new Table({
          //   rows: [
          //     new TableRow({
          //       children: [
          //         // First Cell: Title "live place label"
          //         new TableCell({
          //           children: [
          //             new Paragraph({
          //               children: [
          //                 new TextRun({
          //                   text: `10. Қандай маълумот керак`,
          //                   bold: false,
          //                   size: 24, // Large font size for title
          //                 }),
          //                 new TextRun({
          //                   text: "(Какая нужна справка)",
          //                   size: 24, // Adjust font size
          //                   font: "Times New Roman",
          //                   break: 1,
          //                 }),
          //               ],
          //               color: "0f0f0f",
          //               alignment: AlignmentType.LEFT, // Align to the left
          //             }),
          //           ],
          //           verticalAlign: VerticalAlign.CENTER,
          //           width: {
          //             size: 35 * 50, // 70% width for the title
          //             type: WidthType.PERCENTAGE,
          //           },
          //         }),
          //         // Second Cell: Table "live place"
          //         new TableCell({
          //           children: [
          //             new Paragraph({
          //               children: [
          //                 new TextRun({
          //                   text: additional_information,
          //                   size: 24,
          //                   bold: true,
          //                 }),
          //               ],
          //               alignment: AlignmentType.LEFT,
          //               verticalAlign: VerticalAlign.CENTER,
          //               spacing: { after: 0, before: 276 },
          //             }),
          //             new Paragraph({
          //               children: [
          //                 new TextRun({
          //                   text: "________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
          //                   size: 12, // Chiziqning o'lchami
          //                   bold: true,
          //                 }),
          //               ],
          //               border: {
          //                 bottom: {
          //                   color: "000000", // Chiziq rangi
          //                   space: 1,
          //                   value: "dash", // Chiziq turi
          //                   size: 40, // Chiziq qalinligi
          //                 },
          //               },
          //               alignment: AlignmentType.CENTER,
          //               spacing: { after: 0, before: 0 },
          //             }),
          //           ],
          //           width: {
          //             size: 65 * 50, // 30% width for the table
          //             type: WidthType.PERCENTAGE,
          //           },
          //           verticalAlign: VerticalAlign.CENTER,
          //         }),
          //       ],
          //       verticalAlign: VerticalAlign.CENTER,
          //       spacing: { after: 276 },
          //     }),
          //   ],
          //   width: {
          //     size: 100 * 50, // Ensure the table spans the full width of the page
          //     type: WidthType.PERCENTAGE,
          //   },
          //   alignment: AlignmentType.CENTER, // Center-align the entire table
          //   verticalAlign: VerticalAlign.CENTER,
          //   borders: {
          //     top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          //     bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          //     left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          //     right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          //     insideHorizontal: {
          //       style: BorderStyle.NONE,
          //       size: 0,
          //       color: "FFFFFF",
          //     },
          //     insideVertical: {
          //       style: BorderStyle.NONE,
          //       size: 0,
          //       color: "FFFFFF",
          //     },
          //   },
          //   spacing: { line: 276, after: 276, before: 0 },
          // }),
          // new Paragraph({
          //   children: [
          //     new TextRun({
          //       text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
          //       size: 1, // Chiziqning o'lchami
          //       bold: true,
          //       color: "ffffff",
          //     }),
          //   ],
          //   spacing: { after: 0, before: 0 },
          // }),

          //Какая нужна справка
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "live place label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `10. Какая нужна справка`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Какая нужна справка)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 35 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "live place"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "проверка по учетам",
                            size: 24,
                            bold: true,
                          }),
                        ],
                        alignment: AlignmentType.LEFT,
                        verticalAlign: VerticalAlign.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                    ],
                    width: {
                      size: 65 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                    verticalAlign: VerticalAlign.CENTER,
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //masul tashkilot
          new Paragraph({
            children: [
              new TextRun({
                text: name,
                size: 24,
                bold: true,
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "________________________________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 12, // Chiziqning o'lchami
                bold: true,
              }),
            ],
            border: {
              bottom: {
                color: "000000", // Chiziq rangi
                space: 1,
                value: "dash", // Chiziq turi
                size: 40, // Chiziq qalinligi
              },
            },
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Идора ва бўлинма номи  (Наименование органа и подразделения)",
                size: 24,
                color: "0f0f0f",
                bold: false,
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.CENTER,
            spacing: { after: 0 },
          }),

          // podpis and date
          new Paragraph({
            children: [
              new TextRun({
                text: "", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                break: 2,
                color: "ffffff",
              }),
            ],
          }),
          new Table({
            rows: [...tableRows, dateRow],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //executive and phone number
          new Paragraph({
            children: [
              new TextRun({
                text: "", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                break: 2,
                color: "ffffff",
              }),
            ],
          }),
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "birthDate label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Бажарувчи`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Исполнитель)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthDate"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: executive_name,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "_____________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  //BirthPlace label
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Телефон`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthPlace"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: executive_phone,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        verticalAlign: VerticalAlign.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "____________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //executive and phone number
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "birthDate label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Ответственный`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthDate"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: initiator_name,
                            size: 24,
                            bold: true,
                            // underline: {
                            //   type: UnderlineType.SINGLE,
                            //   color: "000000",
                            // },
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "____________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  //BirthPlace label
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `К делу №`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthPlace"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: record_number,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        verticalAlign: VerticalAlign.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "____________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),
        ],
      },
    ],
  };
}

// #progress
function generateMalumotnoma(
  form = "f",
  reg_end_date = "21 января 2025 г.",
  status = "Рухсатнома рад этилганлиги туғрисида билдиришнома (уведомление об ОТКАЗЕ в допуске)",
  name = "Т  А  Л  А  Б  Н  О  М  А",
  organization = "Министерство юстиции Республики Узбекистан",
  firstName = "АБДУКАХХОРОВ",
  lastName = "ЗАЙНИДДИН",
  fatherName = "РАХМОНОВИЧ",
  birthDate = "1990",
  birthPlace = "Самаркандская область",
  livePlace = "Самаркандская область, Иштиханский район, мсг. Шехляркент",
  workplace = "Министерство юстиции Республики Узбекистан, Юридический департамент",
  request_data = "к/м в полном объеме к/м в полном объеме к/м в полном объеме",
  executive_organization = " ГСБП Республики Узбекистан",
  date = "21 января 2025 г.",
  executive_name = "Иванова А.К",
  executive_phone = "87777777777",
  initiator_name = "Кузнецов М.И.",
  record_number = "182-18нг",
  signList = [],
  signed_fio = "Иванов Иван Иванович",
  signed_position = "Генеральный директор"
) {
  const tableRows =
    signList && signList.length > 0
      ? signList.map((item) => {
        return new TableRow({
          children: [
            // First Cell: Position with label
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${item?.position ? item?.position : ""}`,
                      bold: false,
                      underline: {
                        type: UnderlineType.SINGLE,
                        color: "000000",
                      },
                      size: 24,
                    }),
                    new TextRun({
                      text: "Лавозими (Должность)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            // Second Cell: Signature
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 24,
                    }),
                    new TextRun({
                      text: "Имзо (подпись)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            // Third Cell: Name with label
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${item?.name ? item?.name : ""}`,
                      bold: false,
                      underline: {
                        type: UnderlineType.SINGLE,
                        color: "000000",
                      },
                      size: 24,
                    }),
                    new TextRun({
                      text: "Насаби (Фамилия)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 30 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
          spacing: { after: 276 },
        });
      })
      : [
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 24,
                    }),
                    new TextRun({
                      text: "Лавозими (Должность)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 24,
                    }),
                    new TextRun({
                      text: "Имзо (подпись)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 35 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `____________________`,
                      bold: false,
                      size: 24,
                    }),
                    new TextRun({
                      text: "Насаби (Фамилия)",
                      size: 24,
                      font: "Times New Roman",
                      break: 1,
                    }),
                  ],
                  color: "0f0f0f",
                  alignment: AlignmentType.CENTER,
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
              width: {
                size: 30 * 50,
                type: WidthType.PERCENTAGE,
              },
            }),
          ],
          verticalAlign: VerticalAlign.CENTER,
          spacing: { after: 276 },
        }),
      ];
  const dateRow = new TableRow({
    children: [
      // First Cell: Title "live place label"
      new TableCell({
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: `${date}`,
                bold: false,
                break: 1,
                size: 24, // Large font size for title
              }),
            ],
            color: "0f0f0f",
            alignment: AlignmentType.CENTER, // Align to the left
            spacing: { after: 0, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_______________________________", // Chiziqni ifodalash uchun
                size: 12, // Chiziqning o'lchami
                bold: true,
              }),
            ],
            border: {
              bottom: {
                color: "000000", // Chiziq rangi
                space: 1,
                value: "dash", // Chiziq turi
                size: 40, // Chiziq qalinligi
              },
            },
            spacing: { after: 0, before: 0 },
            alignment: AlignmentType.CENTER,
          }),
        ],
        verticalAlign: VerticalAlign.CENTER,
        width: {
          size: 35 * 50, // 70% width for the title
          type: WidthType.PERCENTAGE,
        },
      }),
      // Second Cell: Table "live place"
      new TableCell({
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: ``,
                bold: false,
                size: 24, // Large font size for title
              }),
            ],
            color: "0f0f0f",
            alignment: AlignmentType.CENTER, // Align to the left
          }),
        ],
        columnSpan: 2,
        verticalAlign: VerticalAlign.CENTER,
        width: {
          size: 65 * 50, // 70% width for the title
          type: WidthType.PERCENTAGE,
        },
      }),
    ],
    verticalAlign: VerticalAlign.CENTER,
    spacing: { after: 276 },
  });
  return {
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: (1440 * 2) / 2.54, // 2cm
              right: (1440 * 1.5) / 2.54, // 1.5cm
              bottom: (1440 * 2) / 2.54, // 2cm
              left: (1440 * 2.5) / 2.54, // 2.5cm
            },
          },
        },
        children: [
          //DSP ma'lumotlari
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "Т А Л А Б Н О М А"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `${organization}`,
                            // bold: true,
                            italic: true,
                            size: 24, // Large font size for title
                          }),
                        ],
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 92, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "(ТРЕБОВАНИЕ)"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "ДСП",
                            size: 24, // Adjust font size
                            italic: true,
                          }),
                          new TextRun({
                            text: " Экз.№_",
                            size: 24, // Adjust font size
                            italic: true,
                            break: 1,
                          }),
                        ],
                        alignment: AlignmentType.RIGHT,
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 8, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 0, after: 0 },
          }),
          //bu joyda talabnoma nomi bilan o'ng tomondagi korobka joylashgan
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "Т А Л А Б Н О М А"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: status,
                            bold: true,
                            size: 24, // Large font size for title
                          }),
                        ],
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    shading:
                      status !==
                        "Рухсатнома рад этилганлиги туғрисида билдиришнома (уведомление об ОТКАЗЕ в допуске)"
                        ? undefined
                        : {
                          fill: "FFD700", // Use shading.fill for background color
                        },

                    width: {
                      size: 70 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "(ТРЕБОВАНИЕ)"
                  new TableCell({
                    children: [
                      new Table({
                        rows: [
                          new TableRow({
                            children: [
                              new TableCell({
                                children: [
                                  new Paragraph({
                                    children: [
                                      new TextRun({
                                        text: "ПДХХ ... (кимга):",
                                        size: 24, // Adjust font size
                                      }),
                                      new TextRun({
                                        text: initiator_name,
                                        size: 24, // Adjust font size
                                      }),
                                    ],
                                    alignment: AlignmentType.CENTER,
                                  }),
                                ],
                                margins: {
                                  top: 200,
                                  bottom: 200,
                                  left: 400,
                                  right: 400,
                                },
                              }),
                            ],
                          }),
                        ],
                        alignment: AlignmentType.CENTER,
                      }),
                    ],
                    width: {
                      size: 30 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //form
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "firstName"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Махсус текширув шакли (форма спецпроверки):`,
                            bold: false,
                            break: 1,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,

                    width: {
                      size: 70, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "(ТРЕБОВАНИЕ)"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: form,
                            size: 28,
                            bold: true,
                            underline: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.LEFT,
                        spacing: { after: 0, before: 276 },
                      }),
                    ],
                    width: {
                      size: 30, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 0, after: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //reg End Date
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "firstName"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Рухсатномадаги рад этилган сана (дата отказа в допуске):`,
                            bold: false,
                            break: 1,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 70, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "(ТРЕБОВАНИЕ)"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: reg_end_date,
                            size: 28,
                            bold: true,
                            underline: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.LEFT,
                        spacing: { after: 0, before: 276 },
                      }),
                    ],
                    width: {
                      size: 30, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 0, after: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //firstName
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "firstName"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `1. Насаби`,
                            bold: false,
                            break: 1,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Фамилия)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 15 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "(ТРЕБОВАНИЕ)"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: lastName,
                            size: 28,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                    ],
                    width: {
                      size: 85 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),
          //LastName and fatherName
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "firstName"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `2. Исм-шарифи`,
                            bold: false,
                            break: 1,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Имя и отчество)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "(ТРЕБОВАНИЕ)"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `${firstName} ${fatherName}`,
                            size: 32,
                            bold: true,
                            // underline: {
                            //   type: UnderlineType.SINGLE,
                            //   color: "000000",
                            // },
                          }),
                        ],
                        verticalAlign: VerticalAlign.CENTER,
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "____________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                    ],
                    width: {
                      size: 75 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),
          //BirthDate and BirthPlace
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "birthDate label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `3. Туғилган йили`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Год рождения)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthDate"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `${birthDate} г.`,
                            size: 24,
                            bold: true,
                            // underline: {
                            //   type: UnderlineType.SINGLE,
                            //   color: "000000",
                            // },
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "_____________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  //BirthPlace label
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `4. Туғилган жойи`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Место рождения)",
                            size: 24, // Adjust font size
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthPlace"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text:
                              birthPlace?.length > 20
                                ? birthPlace.split(" ").slice(0, 2).join(" ")
                                : birthPlace,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.LEFT,
                        verticalAlign: VerticalAlign.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
              birthPlace?.length > 20 && birthPlace?.split(" ").length >= 2
                ? new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: birthPlace?.split(" ").slice(2).join(" "),
                              bold: false,
                              size: 24, // Large font size for title
                              underline: {
                                type: UnderlineType.SINGLE,
                                color: "000000",
                              },
                            }),
                          ],
                          color: "0f0f0f",
                          alignment: AlignmentType.LEFT, // Align to the left
                        }),
                      ],
                      verticalAlign: VerticalAlign.CENTER,
                      width: {
                        size: 100 * 50, // 70% width for the title
                        type: WidthType.PERCENTAGE,
                      },
                      columnSpan: 4,
                    }),
                  ],
                  verticalAlign: VerticalAlign.LEFT,
                  spacing: { after: 276, before: 276 },
                })
                : new TableRow({
                  children: [
                    new TableCell({
                      children: [],
                    }),
                  ],
                }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          // //passport
          // new Table({
          //   rows: [
          //     new TableRow({
          //       children: [
          //         // First Cell: Title "live place label"
          //         new TableCell({
          //           children: [
          //             new Paragraph({
          //               children: [
          //                 new TextRun({
          //                   text: `5. Паспорт серияси ва рақами:`,
          //                   bold: false,
          //                   size: 24, // Large font size for title
          //                 }),
          //                 new TextRun({
          //                   text: "Серия и номер паспорта",
          //                   size: 24, // Adjust font size
          //                   font: "Times New Roman",
          //                   break: 1,
          //                 }),
          //               ],
          //               color: "0f0f0f",
          //               alignment: AlignmentType.LEFT, // Align to the left
          //             }),
          //           ],
          //           verticalAlign: VerticalAlign.CENTER,
          //           width: {
          //             size: 25 * 50, // 70% width for the title
          //             type: WidthType.PERCENTAGE,
          //           },
          //         }),
          //         // Second Cell: Table "live place"
          //         new TableCell({
          //           children: [
          //             new Paragraph({
          //               children: [
          //                 new TextRun({
          //                   text:passport,
          //                   size: 24,
          //                   bold: true,
          //                 }),
          //               ],
          //               alignment: AlignmentType.CENTER,
          //               spacing: { after: 0, before: 276 },
          //             }),
          //             new Paragraph({
          //               children: [
          //                 new TextRun({
          //                   text: "________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
          //                   size: 12, // Chiziqning o'lchami
          //                   bold: true,
          //                 }),
          //               ],
          //               border: {
          //                 bottom: {
          //                   color: "000000", // Chiziq rangi
          //                   space: 1,
          //                   value: "dash", // Chiziq turi
          //                   size: 40, // Chiziq qalinligi
          //                 },
          //               },
          //               alignment: AlignmentType.CENTER,
          //               spacing: { after: 0, before: 0 },
          //             }),
          //           ],
          //           width: {
          //             size: 75 * 50, // 30% width for the table
          //             type: WidthType.PERCENTAGE,
          //           },
          //         }),
          //       ],
          //       verticalAlign: VerticalAlign.CENTER,
          //       spacing: { after: 276 },
          //     }),
          //   ],
          //   width: {
          //     size: 100 * 50, // Ensure the table spans the full width of the page
          //     type: WidthType.PERCENTAGE,
          //   },
          //   alignment: AlignmentType.CENTER, // Center-align the entire table
          //   verticalAlign: VerticalAlign.CENTER,
          //   borders: {
          //     top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          //     bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          //     left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          //     right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          //     insideHorizontal: {
          //       style: BorderStyle.NONE,
          //       size: 0,
          //       color: "FFFFFF",
          //     },
          //     insideVertical: {
          //       style: BorderStyle.NONE,
          //       size: 0,
          //       color: "FFFFFF",
          //     },
          //   },
          //   spacing: { line: 276, after: 276, before: 0 },
          // }),
          // new Paragraph({
          //   children: [
          //     new TextRun({
          //       text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
          //       size: 1, // Chiziqning o'lchami
          //       bold: true,
          //       color: "ffffff",
          //     }),
          //   ],
          //   spacing: { after: 0, before: 0 },
          // }),

          //live place
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "live place label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `7. Яшаш манзили`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Место проживания)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "live place"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text:
                              livePlace?.length > 30 &&
                                livePlace?.split(" ").length >= 5
                                ? livePlace.split(" ").slice(0, 5).join(" ")
                                : livePlace,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                    ],
                    width: {
                      size: 75 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
              livePlace?.length > 30 && livePlace?.split(" ").length >= 5
                ? new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: livePlace?.split(" ").slice(5).join(" "),
                              bold: true,
                              size: 24, // Large font size for title
                            }),
                          ],
                          color: "0f0f0f",
                          alignment: AlignmentType.LEFT, // Align to the left
                        }),
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: "________________________________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                              size: 12, // Chiziqning o'lchami
                              bold: true,
                            }),
                          ],
                          border: {
                            bottom: {
                              color: "000000", // Chiziq rangi
                              space: 1,
                              value: "dash", // Chiziq turi
                              size: 40, // Chiziq qalinligi
                            },
                          },
                          alignment: AlignmentType.CENTER,
                          spacing: { after: 0, before: 0 },
                        }),
                      ],
                      verticalAlign: VerticalAlign.CENTER,
                      width: {
                        size: 100 * 50, // 70% width for the title
                        type: WidthType.PERCENTAGE,
                      },
                      columnSpan: 2,
                    }),
                  ],
                  verticalAlign: VerticalAlign.LEFT,
                  spacing: { after: 276, before: 276 },
                })
                : new TableRow({
                  children: [
                    new TableCell({
                      children: [],
                    }),
                  ],
                }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //masul tashkilot
          new Paragraph({
            children: [
              new TextRun({
                text: executive_organization,
                size: 24,
                bold: true,
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 276 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "________________________________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 12, // Chiziqning o'lchami
                bold: true,
              }),
            ],
            border: {
              bottom: {
                color: "000000", // Chiziq rangi
                space: 1,
                value: "dash", // Chiziq turi
                size: 40, // Chiziq qalinligi
              },
            },
            alignment: AlignmentType.CENTER,
            spacing: { after: 0, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Идора ва бўлинма номи  (Наименование органа и подразделения)",
                size: 24,
                color: "0f0f0f",
                bold: false,
              }),
            ],
            // indent:{ firstLine:900},
            alignment: AlignmentType.CENTER,
            spacing: { after: 0 },
          }),

          // podpis and date
          new Paragraph({
            children: [
              new TextRun({
                text: "", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                break: 2,
                color: "ffffff",
              }),
            ],
          }),
          new Table({
            rows: [...tableRows, dateRow],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //executive and phone number
          new Paragraph({
            children: [
              new TextRun({
                text: "", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                break: 2,
                color: "ffffff",
              }),
            ],
          }),
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "birthDate label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Бажарувчи`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                          new TextRun({
                            text: "(Исполнитель)",
                            size: 24, // Adjust font size
                            font: "Times New Roman",
                            break: 1,
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthDate"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: executive_name,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "_____________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  //BirthPlace label
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Телефон`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthPlace"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: executive_phone,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        verticalAlign: VerticalAlign.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "____________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),

          //executive and phone number
          new Table({
            rows: [
              new TableRow({
                children: [
                  // First Cell: Title "birthDate label"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `Ответственный`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.LEFT, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthDate"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: initiator_name,
                            size: 24,
                            bold: true,
                            // underline: {
                            //   type: UnderlineType.SINGLE,
                            //   color: "000000",
                            // },
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "____________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  //BirthPlace label
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: `К делу №`,
                            bold: false,
                            size: 24, // Large font size for title
                          }),
                        ],
                        color: "0f0f0f",
                        alignment: AlignmentType.CENTER, // Align to the left
                      }),
                    ],
                    verticalAlign: VerticalAlign.CENTER,
                    width: {
                      size: 25 * 50, // 70% width for the title
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                  // Second Cell: Table "birthPlace"
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: record_number,
                            size: 24,
                            bold: true,
                          }),
                        ],
                        // indent:{ firstLine:900},
                        alignment: AlignmentType.CENTER,
                        verticalAlign: VerticalAlign.CENTER,
                        spacing: { after: 0, before: 276 },
                      }),
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "____________________________________________", // Chiziqni ifodalash uchun
                            size: 12, // Chiziqning o'lchami
                            bold: true,
                          }),
                        ],
                        border: {
                          bottom: {
                            color: "000000", // Chiziq rangi
                            space: 1,
                            value: "dash", // Chiziq turi
                            size: 40, // Chiziq qalinligi
                          },
                        },
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 0, before: 0 },
                      }),
                      // new Paragraph({
                      //   children: [
                      //     new TextRun({
                      //       text: "______________________________________", // Chiziqni ifodalash uchun
                      //       size: 12, // Chiziqning o'lchami
                      //       bold: true,
                      //     }),
                      //   ],
                      //   border: {
                      //     bottom: {
                      //       color: "000000", // Chiziq rangi
                      //       space: 1,
                      //       value: "dash", // Chiziq turi
                      //       size: 40, // Chiziq qalinligi
                      //     },
                      //   },
                      //   alignment: AlignmentType.CENTER,
                      //   spacing: { after: 0, before: 0 },
                      // }),
                    ],
                    width: {
                      size: 25 * 50, // 30% width for the table
                      type: WidthType.PERCENTAGE,
                    },
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                spacing: { after: 276 },
              }),
            ],
            width: {
              size: 100 * 50, // Ensure the table spans the full width of the page
              type: WidthType.PERCENTAGE,
            },
            alignment: AlignmentType.CENTER, // Center-align the entire table
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              insideHorizontal: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
              insideVertical: {
                style: BorderStyle.NONE,
                size: 0,
                color: "FFFFFF",
              },
            },
            spacing: { line: 276, after: 276, before: 0 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "_________________________________________________________________________________________________________________________________________", // Chiziqni ifodalash uchun
                size: 1, // Chiziqning o'lchami
                bold: true,
                color: "ffffff",
              }),
            ],
            spacing: { after: 0, before: 0 },
          }),
        ],
      },
    ],
  };
}

/**
 * @swagger
 * /api/v1/raport/type/get/{id}:
 *   get:
 *     summary: Get raport type by ID
 *     tags: [RaportType]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Raport type ID
 *     responses:
 *       200:
 *         description: Raport type found
 *       404:
 *         description: Raport type not found
 *       500:
 *         description: Internal server error
 */
exports.getRaportTypeById = async (req, res) => {
  try {
    const { id } = req.params;
    const raportType = await getRaportTypeByIdRaw(id);

    if (!raportType) {
      return res
        .status(404)
        .json({ code: 404, message: "Raport type not found" });
    }

    return res.status(200).json({
      code: 200,
      message: "Raport type found",
      data: raportType,
    });
  } catch (error) {
    console.error("Error fetching raport type by ID:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {

  }
};

exports.generateQuerySgb = async (req, res) =>
  generateDedicatedQueryRaportSGB(req, res, "type9");

exports.generateQueryGsbp = async (req, res) =>
  generateDedicatedQueryRaportGSBP(req, res, "type8");

/**
 * @swagger
 * /api/v1/raport/type/update/{id}:
 *   post:
 *     summary: Update raport type
 *     tags: [RaportType]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Raport type ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               code:
 *                 type: string
 *               code_ru:
 *                 type: string
 *               code_uz:
 *                 type: string
 *               organization:
 *                 type: string
 *               requested_organization:
 *                 type: string
 *               link:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Raport type updated successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: Raport type not found
 *       500:
 *         description: Internal server error
 */
exports.updateRaportType = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      code,
      code_ru,
      code_uz,
      organization,
      requested_organization,
      rank,
      signed_fio,
      signed_position,
      link,
      notes,
      data: payloadData = {},
    } = req.body;

    const raportType = await getRaportTypeByIdRaw(id);

    if (!raportType) {
      return res
        .status(404)
        .json({ code: 404, message: "Raport type not found" });
    }

    const updatedRaportTypeRef = await prisma.raportTypes.update({
      where: { id },
      select: { id: true },
      data: {
        name,
        code,
        code_ru,
        code_uz,
        organization,
        requested_organization,
        link,
        notes,
        signed_fio,
        signed_position,
        data: {
          ...(raportType?.data && typeof raportType.data === "object" ? raportType.data : {}),
          rank:
            rank !== undefined
              ? rank || ""
              : raportType?.data?.rank || "",
          editableWord:
            payloadData?.editableWord !== undefined
              ? payloadData?.editableWord || ""
              : raportType?.data?.editableWord || "",
        },
      },
    });

    const updatedRaportType = await getRaportTypeByIdRaw(updatedRaportTypeRef.id);

    return res.status(200).json({
      code: 200,
      message: "Raport type updated successfully",
      data: updatedRaportType,
    });
  } catch (error) {
    console.error("Error updating raport type:", error);
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
 * /api/v1/raport/list:
 *   post:
 *     summary: Get paginated list of raport types
 *     tags: [RaportType]
 *     parameters:
 *       - in: query
 *         name: pageNumber
 *         schema:
 *           type: integer
 *           default: 1
 *         required: false
 *         description: Page number for pagination
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 10
 *         required: false
 *         description: Number of items per page
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               searchQuery:
 *                 type: string
 *                 description: Search query for filtering
 *     responses:
 *       200:
 *         description: Successfully retrieved list of raport types
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
exports.getRaportTypeList = async (req, res) => {
  try {
    let { pageNumber = 1, pageSize = 10 } = req.query;
    const { searchQuery } = req.body;

    pageNumber = parseInt(pageNumber, 10);
    pageSize = parseInt(pageSize, 10);

    if (
      isNaN(pageNumber) ||
      isNaN(pageSize) ||
      pageNumber < 1 ||
      pageSize < 1
    ) {
      return res.status(400).json({ message: "Invalid pagination parameters" });
    }

    const filters = searchQuery
      ? Prisma.sql`(
        rt."name" ILIKE ${`%${searchQuery}%`}
        OR rt."code" ILIKE ${`%${searchQuery}%`}
      )`
      : Prisma.sql`TRUE`;

    const raportTypes = await queryRaportTypesRaw({
      where: filters,
      includeExecutor: true,
      limit: pageSize,
      offset: (pageNumber - 1) * pageSize,
      orderByCreatedAtDesc: true,
    });

    const totalRaportTypes = await countRaportTypesRaw(filters);

    const totalPages = Math.ceil(totalRaportTypes / pageSize);

    return res.status(200).json({
      code: 200,
      message: "List of raport types",
      total_pages: totalPages,
      total_raportTypes: totalRaportTypes,
      raportTypes,
    });
  } catch (error) {
    console.error("Error fetching raport type list:", error);
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
 * /api/v1/raport/type/create:
 *   post:
 *     summary: Create a new raport type
 *     tags: [RaportType]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               code:
 *                 type: string
 *               code_ru:
 *                 type: string
 *               code_uz:
 *                 type: string
 *               organization:
 *                 type: string
 *               requested_organization:
 *                 type: string
 *               link:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Raport type created successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */
exports.createRaportType = async (req, res) => {
  try {
    const {
      name,
      code,
      code_ru,
      code_uz,
      organization,
      requested_organization,
      rank,
      signed_fio,
      signed_position,
      link,
      notes,
      data: payloadData = {},
    } = req.body;

    const raportType = (await queryRaportTypesRaw({
      where: Prisma.sql`
        rt."code" = ${code}
        AND rt."code_ru" = ${code_ru}
        AND rt."code_uz" = ${code_uz}
      `,
      limit: 1,
    }))?.[0];

    if (raportType) {
      return res
        .status(400)
        .json({ code: 400, message: "Raport type already exists" });
    }

    const data = {
      name,
      code,
      code_ru,
      code_uz,
      organization,
      requested_organization,
      signed_fio,
      signed_position,
      executorId: req.userId,
      link,
      notes,
      data: {
        rank: rank || "",
        editableWord: payloadData?.editableWord || "",
      },
    };

    const validate = RaportTypeSchema.safeParse(data);
    if (!validate.success) {
      return res
        .status(400)
        .json({ code: 400, message: validate.error.message });
    }

    const newRaportTypeRef = await prisma.raportTypes.create({
      select: { id: true },
      data: data,
    });

    const newRaportType = await getRaportTypeByIdRaw(newRaportTypeRef.id);

    return res.status(201).json({
      code: 201,
      message: "Raport type created successfully",
      data: newRaportType,
    });
  } catch (error) {
    console.error("Error creating raport type:", error);
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
 * /api/v1/raport/update:
 *   post:
 *     summary: Update raport
 *     tags: [Raport]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *                 description: Raport ID
 *               name:
 *                 type: string
 *                 description: New name for the raport
 *               link:
 *                 type: string
 *                 description: New link for the raport
 *     responses:
 *       200:
 *         description: Raport updated successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: Raport not found
 *       500:
 *         description: Internal server error
 */
exports.updateRaport = async (req, res) => {
  try {
    const { id, name, link, compr_info = "", regNumber, notes, relatives = [] } = req.body;

    const executorId = req.userId;

    const raport = await prisma.raport.findUnique({
      where: { id },
      include: {
        links: true
      }
    });

    const adminCheck = await prisma.admin.findUnique({
      where: { id: req.userId },
      select: { role: true }
    });

    if (!raport) {
      return res.status(404).json({ code: 404, message: "Raport not found" });
    }

    if (compr_info !== "" && name === "Заключение") {
      try {
        // Normalize regNumber input to an array of strings
        let regNumbers = [];
        if (Array.isArray(regNumber)) {
          regNumbers = regNumber.map((r) => String(r).trim()).filter(Boolean);
        } else if (typeof regNumber === "string") {
          // allow comma-separated string of reg numbers or a single value
          regNumbers = regNumber.includes(",")
            ? regNumber
              .split(",")
              .map((r) => r.trim())
              .filter(Boolean)
            : [regNumber.trim()].filter(Boolean);
        } else if (regNumber != null) {
          regNumbers = [String(regNumber)];
        }

        if (regNumbers.length > 0) {
          await prisma.$transaction(async (tx) => {
            // Find all matching registrations
            const registrations = await tx.registration.findMany({
              where: { regNumber: { in: regNumbers } },
            });

            for (const reg of registrations) {
              const oldNotes = reg.notes || null;
              const appended = oldNotes
                ? `${oldNotes}\n${compr_info}`
                : `${compr_info}`;

              // Update registration notes
              await tx.registration.update({
                where: { id: reg.id },
                data: { notes: compr_info },
              });

              // Create a RegistrationLog entry for the change
              await tx.registrationLog.create({
                data: {
                  registrationId: reg.id,
                  fieldName: "notes",
                  oldValue: oldNotes,
                  newValue: compr_info,
                  executorId: executorId,
                },
              });
              if (relatives.length > 0) {
                // Use Promise.all to wait for all async operations to complete
                const relativeParts = await Promise.all(
                  relatives.map(async (relative, index) => {
                    const relationDegree = await tx.relatives.findUnique({
                      where: { id: relative.id, registrationId: reg.id },
                      select: { relationDegree: true },
                    });
                    return `${index > 0 ? ', ' : ''}${relationDegree.relationDegree || ""} - ${relative.notes || ""}`;
                  })
                );

                const conclusions = compr_info + `\n` + relativeParts.join('');

                await tx.registration.update({
                  where: { id: reg.id },
                  data: { conclusion_compr: conclusions },
                });
                await tx.registrationLog.create({
                  data: {
                    registrationId: reg.id,
                    fieldName: "conclusion_compr",
                    oldValue: reg.conclusion_compr || "",
                    newValue: conclusions,
                    executorId: executorId,
                  },
                });
              }
            }
          });
        }

        if (relatives.length > 0) {
          await prisma.$transaction(async (tx) => {
            for (const relative of relatives) {
              const getRelative = await tx.relatives.findUnique({
                where: { id: relative.id },
                select: { notes: true },
              });
              const oldNotes = getRelative.notes || null;
              const newNotes = relative.notes || null;

              // Update registration notes
              await tx.relatives.update({
                where: { id: relative.id },
                data: { notes: newNotes },
              });

              // Create a RegistrationLog entry for the change
              await tx.log.create({
                data: {
                  recordId: relative.id,
                  tableName: "Relatives",
                  fieldName: "notes",
                  oldValue: oldNotes,
                  newValue: newNotes,
                  executorId: executorId,
                },
              });
            }
          });
        }

      } catch (err) {
        console.error("Error applying compr_info to registrations:", err);
        return res.status(500).json({
          code: 500,
          message: "Failed to apply compr_info to registrations",
          error: err.message,
        });
      }
    }

    if (link) {
      // Iterate over the links array from the raport object
      for (const raportLink of raport.links) {
        await prisma.raportLink.update({
          where: { id: raportLink.id },
          data: {
            ...adminCheck.role === "superAdmin" ? ({ adminCheck: true }) : { operator: true },
          },
        });
      }
    }
    if (name || link || notes) {
      await prisma.raport.update({
        where: { id },
        data: {
          name: name || raport.name,
          link: link || raport.link,
          notes: notes || raport.notes,
        },
      });
    }

    return res.status(200).json({
      code: 200,
      message: "Raport updated successfully",
    });
  } catch (error) {
    console.error("Error updating raport:", error);
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
 * /api/v1/raport/searchRelativesByRaportId:
 *   post:
 *     summary: Find raport by ID and search relatives by registration numbers
 *     tags: [Report]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *                 description: Raport ID (UUID)
 *               search:
 *                 type: string
 *                 description: Search string for filtering relatives by fullName
 *             example:
 *               id: "550e8400-e29b-41d4-a716-446655440000"
 *               search: "John"
 *     responses:
 *       200:
 *         description: Successfully retrieved relatives data
 *       400:
 *         description: Bad request - ID is required
 *       404:
 *         description: Raport not found
 *       500:
 *         description: Internal server error
 */
exports.searchRelativesByRaportId = async (req, res) => {
  try {
    const { id, search = "", limit = 10 } = req.body;

    // Validate ID
    if (!id) {
      return res.status(400).json({
        code: 400,
        message: "Raport ID is required",
      });
    }

    // Find raport by ID and include links
    const raport = await prisma.raportLink.findUnique({
      where: { id: id },
      include: {
        registrations: {
          select: { id: true, regNumber: true }
        },
      }
    });

    if (!raport.registrations) {
      return res.status(404).json({
        code: 404,
        message: "Raport not found",
      });
    }

    // Extract all regNumbers from raport links
    const regNumbers = raport.registrations
      .map((link) => link.regNumber)
      .filter((regNum) => regNum && regNum.trim() !== "");

    if (regNumbers.length === 0) {
      return res.status(200).json({
        code: 200,
        message: "No registration numbers found in raport",
        data: {
          ids: [],
          fullNames: [],
          count: 0,
        },
      });
    }

    // Start transaction to search for relatives
    const result = await prisma.$transaction(async (tx) => {
      const allRelatives = [];

      // Map through all regNumbers
      for (const regNumber of regNumbers) {
        // Find registration by regNumber
        const registration = await tx.registration.findFirst({
          where: { regNumber },
          select: { id: true },
        });

        if (registration) {
          // Build search filter for relatives
          const whereClause = {
            AND: [
              {
                notes: {
                  not: null,
                },
              },
              {
                notes: {
                  not: "",
                },
              },
            ],
            registrationId: registration.id,
          };

          // If search is not empty, add OR filter for fullName and relationDegree
          if (search && search.trim() !== "") {
            whereClause.OR = [
              {
                fullName: {
                  contains: search.trim(),
                  mode: "insensitive",
                }
              },
              {
                relationDegree: {
                  contains: search.trim(),
                  mode: "insensitive",
                }
              }
            ];
          }

          // Find all relatives for this registration
          const relatives = await tx.relatives.findMany({
            where: whereClause,
            select: {
              id: true,
              fullName: true,
              relationDegree: true
            },
          });

          // Add relatives to the collection
          allRelatives.push(...relatives);
        }
      }

      // Apply limit to the results
      const limitedRelatives = limit > 0 ? allRelatives.slice(0, limit) : allRelatives;

      return {
        allRelatives: limitedRelatives,
        count: allRelatives.length, // Total count before limit
        returnedCount: limitedRelatives.length, // Count after limit
      };
    });

    return res.status(200).json({
      code: 200,
      message: "Relatives found successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error searching relatives by raport ID:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal server error",
      error: error.message,
    });
  } finally {

  }
};
