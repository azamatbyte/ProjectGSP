process.env.TZ = 'Asia/Tashkent';
const {
  test,
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
  years: ['2023', '2024'],
  forms: ['Р', 'О'],
  executorId: ['all']
};
const counts = {
  '2023': {
    open: 10,
    close: 8,
    km: 2,
    access: 5,
    eliminete: 3,
    otk1: 2,
    pov_otkz: 1,
    pov_otkz1: 1
  },
  '2024': {
    open: 4,
    close: 3,
    km: 1,
    access: 2,
    eliminete: 1,
    otk1: 0,
    pov_otkz: 1,
    pov_otkz1: 0
  }
};
before(S.freezeTime);
after(() => {
  cap.restore();
  S.unfreezeTime();
});
beforeEach(() => {
  prisma.reset();
  cap.clear();
  prisma.when('form.findUnique', a => ({
    name: a.where.name
  }));
  prisma.when('registration.count', S.countHandler(counts, {
    byYear: true
  }));
  prisma.when('raport.create', a => ({
    id: 'year-report',
    ...a.data
  }));
});
const generate = async (body = BODY) => {
  const res = await S.call(ctrl.statisticsByYear, body);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  return {
    res,
    doc: S.lastDocx(cap).doc
  };
};
test('statisticsByYear returns one DOCX link and records executor plus deletable hidden report link', async () => {
  const {
    res
  } = await generate();
  assert.match(res.body.link, S.linkRegex(SERVER_URL));
  assert.equal(cap.files.length, 1);
  assert.ok(res.body.link.endsWith(S.lastDocx(cap).name));
  const data = prisma.calls('raport.create')[0].data;
  assert.equal(data.executorId, 'admin-7f3c');
  assert.equal(data.link, res.body.link);
  assert.equal(data.name, 'Отчет по формам (Р, О) спецпроверок (за выбранный период времениу):');
  assert.equal(data.notes, data.name);
  assert.deepEqual(prisma.calls('raportLink.create'), [{
    data: {
      raportId: 'year-report',
      code: data.name,
      delete: true,
      display: false
    }
  }]);
});
test('statisticsByYear all Word page/paragraph/run formatting, padding and merged table cells', async () => {
  const {
    doc
  } = await generate();
  L.assertFrame(doc, 'Статистика по годам, по формам «Р, О» ( 2023, 2024)');
  L.assertRows(doc, [['2023', 10, 8, 2, 5, 3, 2, 1, 1], ['2024', 4, 3, 1, 2, 1, 0, 1, 0], ['ВСЕГО:', 14, 11, 3, 7, 4, 2, 2, 1]]);
});
test('statisticsByYear each of eight metrics uses UTC inclusive calendar year and chosen forms', async () => {
  await generate();
  const calls = prisma.calls('registration.count');
  assert.equal(calls.length, 16);
  for (let i = 0; i < calls.length; i++) {
    const w = calls[i].where;
    const year = i < 8 ? '2023' : '2024';
    assert.deepEqual(w.regDate || w.regEndDate, {
      gte: new Date(`${year}-01-01T00:00:00.000Z`),
      lte: new Date(`${year}-12-31T23:59:59.999Z`)
    });
    assert.deepEqual(w.form_reg, {
      in: ['Р', 'О']
    });
    assert.equal(w.executorId, undefined);
  }
});
test('statisticsByYear explicit executors constrain every count', async () => {
  await generate({
    ...BODY,
    executorId: ['admin-a', 'admin-b']
  });
  for (const a of prisma.calls('registration.count')) assert.deepEqual(a.where.executorId, {
    in: ['admin-a', 'admin-b']
  });
});
for (const body of [{
  ...BODY,
  years: []
}, {
  ...BODY,
  forms: []
}]) test(`statisticsByYear empty ${body.years.length ? 'forms' : 'years'} returns 400 without writes`, async () => {
  const res = await S.call(ctrl.statisticsByYear, body);
  assert.equal(res.statusCode, 400);
  assert.equal(cap.files.length, 0);
  assert.equal(prisma.calls('raport.create').length, 0);
});
test('statisticsByYear unknown form returns 500 Invalid form (known validation defect)', async () => {
  prisma.when('form.findUnique', null);
  const res = await S.call(ctrl.statisticsByYear, BODY);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, 'Invalid form');
  assert.equal(cap.files.length, 0);
});
test('statisticsByYear omitted years returns 500 (length before null check)', async () => {
  const res = await S.call(ctrl.statisticsByYear, {
    forms: ['Р'],
    executorId: ['all']
  });
  assert.equal(res.statusCode, 500);
  assert.equal(cap.files.length, 0);
});
test('statisticsByYear omitted executor list silently drops years and emits zero total (known defect)', async () => {
  const {
    doc
  } = await generate({
    years: ['2024'],
    forms: ['Р']
  });
  L.assertRows(doc, [['ВСЕГО:', 0, 0, 0, 0, 0, 0, 0, 0]]);
  assert.equal(prisma.calls('registration.count').length, 0);
});
test('statisticsByYear one failed year is skipped and excluded from totals', async () => {
  prisma.when('registration.count', S.countHandler(counts, {
    byYear: true,
    throwFor: '2023'
  }));
  L.assertRows((await generate()).doc, [['2024', 4, 3, 1, 2, 1, 0, 1, 0], ['ВСЕГО:', 4, 3, 1, 2, 1, 0, 1, 0]]);
});
for (const operation of ['form.findUnique', 'raport.create', 'raportLink.create']) test(`statisticsByYear ${operation} error returns 500 and no file`, async () => {
  prisma.when(operation, () => {
    throw new Error('synthetic failure');
  });
  const res = await S.call(ctrl.statisticsByYear, BODY);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, 'synthetic failure');
  assert.equal(cap.files.length, 0);
});
