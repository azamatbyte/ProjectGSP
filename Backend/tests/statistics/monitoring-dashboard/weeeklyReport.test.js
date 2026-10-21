const S = require('./_support');
const {
  test,
  before,
  after,
  beforeEach,
  mock
} = require('node:test');
const assert = require('node:assert/strict');
const {
  inspectDocx
} = require('../../helpers/docxInspector');
const L = require('../reports/_formLayout');
const {
  prisma,
  ctrl,
  SERVER_URL
} = S.loadController();
const BODY = {
  startDate: '2024-01-01T00:00:00.000Z',
  endDate: '2024-12-31T23:59:59.999Z',
  forms: ['Р'],
  admins: ['all']
};
const ADMIN = {
  role: 'superAdmin',
  first_name: 'Али',
  last_name: 'Каримов',
  father_name: 'Олимович',
  AdminServiceAccess: []
};
const REG = {
  regNumber: '42',
  regDate: new Date('2024-02-02'),
  form_reg: 'Р',
  fullName: 'Азиз <А> & Б',
  workplace: 'Завод',
  executor: {
    last_name: 'Каримов',
    first_name: 'Али'
  },
  Initiator: {
    last_name: 'Саидов',
    first_name: 'Умар'
  }
};
const HEADERS = ['№', 'Рег. номер', 'Дата начала СП', 'Форма СП', 'Ф.И.О.', 'Объект', 'Инициатор', 'Оператор', 'Причина превышения сроков СП принятые меры (вводится оператором вручную)'];
const WIDTHS = [5, 7, 5, 5, 25, 7, 20, 20, 26];
let cap;
before(() => {
  mock.timers.enable({
    apis: ['Date'],
    now: S.FROZEN_NOW
  });
  cap = S.captureGeneratedFiles();
});
after(() => {
  cap.restore();
  mock.timers.reset();
});
beforeEach(() => {
  prisma.reset();
  cap.clear();
  prisma.when('admin.findUnique', ADMIN);
  prisma.when('form.findMany', [{
    name: 'Р'
  }]);
  prisma.when('registration.findMany', [REG]);
  prisma.when('raport.create', a => ({
    id: 'weekly-report',
    ...a.data
  }));
});
async function invoke(body = BODY) {
  return (await S.quiet(() => S.invoke(ctrl.weeeklyReport, {
    body
  }))).result;
}
async function generate(body = BODY) {
  const res = await invoke(body);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  return {
    res,
    doc: inspectDocx(cap.last().buffer)
  };
}
test('weeeklyReport emits one DOCX link and correct report/link metadata', async () => {
  const {
    res
  } = await generate();
  assert.match(res.body.link, S.linkRe(SERVER_URL, 'docx'));
  assert.equal(cap.files.length, 1);
  assert.ok(res.body.link.endsWith(require('path').basename(cap.last().path)));
  assert.deepEqual(prisma.calls('raport.create'), [{
    data: {
      name: 'Недельный отчет по спецпроверкам',
      executorId: 'admin-sa',
      link: res.body.link,
      notes: 'test'
    }
  }]);
  assert.deepEqual(prisma.calls('raportLink.create'), [{
    data: {
      raportId: 'weekly-report',
      code: 'Weeekly Report',
      delete: true,
      display: false
    }
  }]);
});
for (const single of [false, true]) test(`weeeklyReport ${single ? 'single operator' : 'all operators'} exact Word geometry, margins, typography, spacing, table padding and widths`, async () => {
  const {
    doc
  } = await generate({
    ...BODY,
    admins: single ? ['admin-sa'] : ['all']
  });
  L.assertFrame(doc, single ? 'ОТЧЕТ ОПЕРАТОРА Али Каримов Олимович  (01.01.2024 - 31.12.2024):' : 'Анализ работы операторов, по формам «Р»  (01.01.2024 - 31.12.2024):');
  const table = doc.tables[0];
  S.assertTableShell(table, single ? 8 : 9);
  const headers = HEADERS.filter((_, i) => !single || i !== 7),
    widths = WIDTHS.filter((_, i) => !single || i !== 7);
  const data = ['1', '42', '02.02.2024', 'Р', 'Азиз <А> & Б', 'Завод', 'Саидов Умар ', 'Каримов Али ', '       '].filter((_, i) => !single || i !== 7);
  assert.equal(table.rows.length, 2);
  S.assertRow(table.rows[0], headers.map((text, i) => ({
    text,
    widthPct: widths[i]
  })));
  S.assertRow(table.rows[1], data.map((text, i) => ({
    text,
    widthPct: widths[i]
  })));
  assert.deepEqual(doc.sizesUsed(), [1, 12, 22, 24, 32]);
});
test('weeeklyReport filters exact UTC period, overdue only, active forms and stable executor/date order', async () => {
  await generate();
  const a = prisma.calls('registration.findMany')[0];
  assert.deepEqual(a.where, {
    form_reg: {
      in: ['Р']
    },
    regDate: {
      gte: new Date(BODY.startDate),
      lte: new Date(BODY.endDate)
    },
    AND: [{
      expiredDate: {
        not: null
      }
    }, {
      expiredDate: {
        lte: S.FROZEN_NOW
      }
    }]
  });
  assert.deepEqual(a.orderBy, [{
    executorId: 'asc'
  }, {
    regDate: 'asc'
  }]);
  assert.deepEqual(prisma.calls('form.findMany')[0].where, {
    name: {
      in: ['Р']
    },
    status: {
      equals: true
    }
  });
});
test('weeeklyReport explicit admin list constrains queries and numbers all resulting rows', async () => {
  const {
    doc
  } = await generate({
    ...BODY,
    admins: ['admin-a', 'admin-b']
  });
  assert.deepEqual(prisma.calls('registration.findMany').map(a => a.where.executorId), [{
    equals: 'admin-a'
  }, {
    equals: 'admin-b'
  }]);
  assert.deepEqual(doc.tables[0].rows.slice(1).map(r => r.cells[0].text), ['1', '2']);
});
test('weeeklyReport permission denial currently returns 500, with no file or writes', async () => {
  prisma.when('admin.findUnique', {
    ...ADMIN,
    role: 'admin'
  });
  const res = await invoke();
  assert.deepEqual(res.body, {
    code: 500,
    message: 'Access denied'
  });
  assert.equal(res.statusCode, 500);
  assert.equal(cap.files.length, 0);
  assert.equal(prisma.calls('raport.create').length, 0);
});
test('weeeklyReport own report is allowed without service permission', async () => {
  prisma.when('admin.findUnique', {
    ...ADMIN,
    role: 'admin'
  });
  await generate({
    ...BODY,
    admins: ['admin-sa']
  });
});
test('weeeklyReport one Statistics service grants other operators access', async () => {
  prisma.when('admin.findUnique', {
    ...ADMIN,
    role: 'admin',
    AdminServiceAccess: [{
      service: {
        name: 'Статистика'
      }
    }]
  });
  await generate();
});
test('weeeklyReport no rows generates empty DOCX rather than 404 (current contract)', async () => {
  prisma.when('registration.findMany', []);
  const {
    doc
  } = await generate();
  assert.equal(doc.tables.length, 0);
  assert.equal(doc.text, '');
});
test('weeeklyReport null optional names and fields are blank, never literal undefined/null', async () => {
  prisma.when('registration.findMany', [{
    ...REG,
    regDate: null,
    regNumber: null,
    fullName: null,
    workplace: null,
    Initiator: null,
    executor: null
  }]);
  const {
    doc
  } = await generate();
  assert.doesNotMatch(doc.text, /undefined|null/);
  assert.equal(doc.tables[0].rows[1].cells[1].text, '');
});
for (const operation of ['admin.findUnique', 'form.findMany', 'raport.create', 'raportLink.create']) test(`weeeklyReport ${operation} failure returns 500 with no file`, async () => {
  prisma.when(operation, () => {
    throw new Error('synthetic failure');
  });
  const res = await invoke();
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, 'synthetic failure');
  assert.equal(cap.files.length, 0);
});
test('weeeklyReport missing admins is caught and produces no file', async () => {
  const res = await invoke({
    ...BODY,
    admins: undefined
  });
  assert.equal(res.statusCode, 500);
  assert.equal(cap.files.length, 0);
});

test('weeeklyReport long Unicode rows preserve text, numbering and every cell format across a large table', async () => {
  const longName = 'Ғулом «Ўзбекистон» <А> & Б "Исми" 🧪 '.repeat(12).trim();
  const rows = Array.from({ length: 48 }, (_, i) => ({ ...REG, regNumber: String(1000 + i), fullName: `${longName} ${i + 1}` }));
  prisma.when('registration.findMany', rows);
  const { doc } = await generate();
  L.assertFrame(doc, 'Анализ работы операторов, по формам «Р»  (01.01.2024 - 31.12.2024):');
  S.assertTableShell(doc.tables[0], 9);
  assert.equal(doc.tables[0].rows.length, 49);
  doc.tables[0].rows.slice(1).forEach((row, i) => {
    const values = [String(i + 1), rows[i].regNumber, '02.02.2024', 'Р', rows[i].fullName, 'Завод', 'Саидов Умар ', 'Каримов Али ', '       '];
    S.assertRow(row, values.map((text, j) => ({ text, widthPct: WIDTHS[j] })));
  });
  assert.match(doc.xml, /&lt;А&gt; &amp; Б/);
  // Structural preservation only: pagination/line wrapping needs a Word renderer.
  assert.equal(doc.pageBreakCount, 0);
});

test('weeeklyReport per-operator read error silently drops only that operator (known defect)', async () => {
  prisma.when('registration.findMany', a => {
    if (a.where.executorId.equals === 'admin-a') throw new Error('operator unavailable');
    return [REG];
  });
  const { doc } = await generate({ ...BODY, admins: ['admin-a', 'admin-b'] });
  assert.equal(prisma.calls('registration.findMany').length, 2);
  assert.equal(doc.tables[0].rows.length, 2);
  assert.equal(doc.tables[0].rows[1].cells[0].text, '1');
});

test('weeeklyReport missing requesting administrator returns 500 without metadata or document', async () => {
  prisma.when('admin.findUnique', null);
  const res = await invoke();
  assert.equal(res.statusCode, 500);
  assert.equal(prisma.calls('raport.create').length, 0);
  assert.equal(cap.files.length, 0);
});
