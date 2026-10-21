process.env.TZ = 'Asia/Tashkent';
const {
  test,
  describe,
  before,
  after,
  beforeEach
} = require('node:test');
const assert = require('node:assert/strict');
const S = require('./_support');
const L = require('./_formLayout');
const {
  prisma,
  cap,
  ctrl,
  SERVER_URL
} = S.setup();
const BODY = {
  startDate: '2024-01-01T00:00:00.000Z',
  endDate: '2024-12-31T23:59:59.999Z'
};
const counts = {
  Р: {
    open: 10,
    close: 8,
    km: 2,
    access: 5,
    eliminete: 3,
    otk1: 2,
    pov_otkz: 1,
    pov_otkz1: 1
  },
  О: {
    open: 4,
    close: 3,
    km: 1,
    access: 2,
    eliminete: 1,
    otk1: 0,
    pov_otkz: 1,
    pov_otkz1: 0
  },
  У: {
    open: 6,
    close: 4,
    km: 0,
    access: 2,
    eliminete: 2,
    otk1: 1,
    pov_otkz: 0,
    pov_otkz1: 0
  }
};
const ROWS = [['Р', 10, 8, 2, 5, 3, 2, 1, 1], ['О', 4, 3, 1, 2, 1, 0, 1, 0], ['ВСЕГО:', 14, 11, 3, 7, 4, 2, 2, 1], ['У', 6, 4, 0, 2, 2, 1, 0, 0], ['ВСЕГО:', 20, 15, 3, 9, 6, 3, 2, 1]];
before(S.freezeTime);
after(() => {
  cap.restore();
  S.unfreezeTime();
});
beforeEach(() => {
  prisma.reset();
  cap.clear();
  prisma.when('form.findMany', a => a.where.type.equals === 'registration' ? [{
    name: 'Р'
  }, {
    name: 'О'
  }] : [{
    name: 'У'
  }]);
  prisma.when('registration.count', S.countHandler(counts));
  prisma.when('raport.create', a => ({
    id: 'report-forms',
    ...a.data
  }));
});
const generate = async (body = BODY) => {
  const res = await S.call(ctrl.reportFromForm, body);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  return {
    res,
    doc: S.lastDocx(cap).doc
  };
};
test('reportFromForm returns a DOCX link matching one captured upload and persists both metadata rows', async () => {
  const {
    res
  } = await generate();
  assert.match(res.body.link, S.linkRegex(SERVER_URL));
  assert.equal(cap.files.length, 1);
  assert.ok(res.body.link.endsWith(S.lastDocx(cap).name));
  const data = prisma.calls('raport.create')[0].data;
  assert.deepEqual(data, {
    name: 'Отчет по формам (Р, О,У) спецпроверок (01.01.2024 - 31.12.2024)',
    notes: 'Отчет по формам (Р, О,У) спецпроверок (01.01.2024 - 31.12.2024)',
    executorId: 'admin-7f3c',
    link: res.body.link
  });
  assert.deepEqual(prisma.calls('raportLink.create'), [{
    data: {
      raportId: 'report-forms',
      code: data.name,
      delete: true,
      display: false
    }
  }]);
  assert.equal(prisma.calls('registration.update').length, 0);
});
test('reportFromForm page, every paragraph/run, margins, spacing, defaults, headers and footers', async () => {
  const {
    doc
  } = await generate();
  L.assertFrame(doc, 'Статистика по формам (Р, О,У) спецпроверок (01.01.2024 - 31.12.2024)');
  assert.deepEqual(doc.sizesUsed(), [1, 12, 14, 22, 24, 32]);
});
test('reportFromForm every cell: widths, merged headers, borders, padding, font and correct separate/grand totals', async () => {
  L.assertRows((await generate()).doc, ROWS);
});
test('reportFromForm queries active forms of both models and preserves exact UTC endpoints for every metric', async () => {
  await generate();
  assert.deepEqual(prisma.calls('form.findMany').map(a => a.where), [{
    type: {
      equals: 'registration'
    },
    status: {
      equals: true
    }
  }, {
    type: {
      equals: 'registration4'
    },
    status: {
      equals: true
    }
  }]);
  assert.equal(prisma.calls('registration.count').length, 24);
  for (const a of prisma.calls('registration.count')) assert.deepEqual(a.where.regDate || a.where.regEndDate, {
    gte: new Date(BODY.startDate),
    lte: new Date(BODY.endDate)
  });
});
test('reportFromForm no active forms produces both zero totals without throwing', async () => {
  prisma.when('form.findMany', []);
  L.assertRows((await generate()).doc, [['ВСЕГО:', 0, 0, 0, 0, 0, 0, 0, 0], ['ВСЕГО:', 0, 0, 0, 0, 0, 0, 0, 0]]);
});
test('reportFromForm count failure skips only the failed form and totals remaining rows', async () => {
  prisma.when('registration.count', S.countHandler(counts, {
    throwFor: 'Р'
  }));
  const rows = (await generate()).doc.tables[0].rows.slice(2).map(S.rowTexts);
  assert.deepEqual(rows.map(r => r[0]), ['О', 'ВСЕГО:', 'У', 'ВСЕГО:']);
  assert.deepEqual(rows.at(-1), ['ВСЕГО:', '10', '7', '1', '4', '3', '1', '1', '0']);
});
for (const operation of ['form.findMany', 'raport.create', 'raportLink.create']) test(`reportFromForm ${operation} failure returns 500 and does not save a file`, async () => {
  prisma.when(operation, () => {
    throw new Error('synthetic failure');
  });
  const res = await S.call(ctrl.reportFromForm, BODY);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, 'synthetic failure');
  assert.equal(cap.files.length, 0);
});
test('reportFromForm missing/invalid dates currently bypass validation (known defect)', async () => {
  const {
    doc
  } = await generate({});
  assert.match(doc.paragraphs[0].text, / - /);
  assert.ok(Number.isNaN(prisma.calls('registration.count')[0].where.regDate.gte.getTime()));
});
