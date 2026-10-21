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
  startDate: '2024-01-01T00:00:00.000Z',
  endDate: '2024-12-31T23:59:59.999Z',
  workplaces: ['all']
};
const counts = {
  'Завод': {
    open: 10,
    close: 8,
    access: 5,
    access_expired: 2,
    eliminete: 3,
    otk1: 1
  },
  'Объект': {
    open: 4,
    close: 3,
    access: 2,
    access_expired: 0,
    eliminete: 1,
    otk1: 0
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
  prisma.when('form.findMany', [{
    name: 'Р'
  }, {
    name: 'О'
  }]);
  prisma.when('registration.findMany', [{
    workplace: 'Завод'
  }, {
    workplace: 'Объект'
  }]);
  prisma.when('registration.count', S.countHandler(counts));
  prisma.when('raport.create', a => ({
    id: 'by-form-report',
    ...a.data
  }));
});
const generate = async (body = BODY) => {
  const res = await S.call(ctrl.statisticsByForm, body);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  return {
    res,
    doc: S.lastDocx(cap).doc
  };
};
test('statisticsByForm one linked DOCX and report metadata, with no registration mutations', async () => {
  const {
    res
  } = await generate();
  assert.match(res.body.link, S.linkRegex(SERVER_URL));
  assert.equal(cap.files.length, 1);
  assert.ok(res.body.link.endsWith(S.lastDocx(cap).name));
  const data = prisma.calls('raport.create')[0].data;
  assert.equal(data.executorId, 'admin-7f3c');
  assert.equal(data.link, res.body.link);
  assert.equal(data.name, 'Отчет по формам (registration) спецпроверок (за выбранный период времениу):');
  assert.equal(data.notes, data.name);
  assert.deepEqual(prisma.calls('raportLink.create'), [{
    data: {
      raportId: 'by-form-report',
      code: data.name,
      delete: true,
      display: false
    }
  }]);
  assert.equal(prisma.calls('registration.update').length, 0);
});
test('statisticsByForm every page, paragraph, run and table property including padding and totals', async () => {
  const {
    doc
  } = await generate();
  L.assertFrame(doc, 'Сверка по ведомствам, по формам «Р, О» (01.01.2024 - 31.12.2024)');
  L.assertRows(doc, [['Завод', 10, 8, 5, 2, 3, 1], ['Объект', 4, 3, 2, 0, 1, 0], ['ВСЕГО:', 14, 11, 7, 2, 4, 1]], 'workplace');
  assert.deepEqual(doc.sizesUsed(), [1, 12, 22, 24, 32]);
});
test('statisticsByForm count queries preserve UTC dates, active model forms and frozen expiry cutoff', async () => {
  await generate();
  const calls = prisma.calls('registration.count');
  assert.equal(calls.length, 12);
  for (const {
    where: w
  } of calls) {
    assert.deepEqual(w.form_reg, {
      in: ['Р', 'О']
    });
    assert.deepEqual(w.regDate || w.regEndDate, {
      gte: new Date(BODY.startDate),
      lte: new Date(BODY.endDate)
    });
    if (S.metricOf(w) === 'access_expired') assert.deepEqual(w.AND, [{
      expired: {
        not: null
      }
    }, {
      expired: {
        lte: S.NOW
      }
    }]);
  }
  assert.ok(prisma.calls('form.findMany').every(a => a.where.type.equals === 'registration'));
});
test('statisticsByForm named duplicate workplaces are deduplicated, skip lookup and support registration4', async () => {
  await generate({
    ...BODY,
    workplaces: ['Завод', 'Завод'],
    form_reg_req: 'registration4'
  });
  assert.equal(prisma.calls('registration.findMany').length, 0);
  assert.equal(prisma.calls('registration.count').length, 6);
  assert.equal(prisma.calls('form.findMany')[0].where.type.equals, 'registration4');
});
for (const workplaces of [undefined, [], null, 'Завод']) test(`statisticsByForm invalid workplaces ${JSON.stringify(workplaces)} returns 400`, async () => {
  const res = await S.call(ctrl.statisticsByForm, {
    ...BODY,
    workplaces
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'Workplaces are required');
  assert.equal(cap.files.length, 0);
  assert.equal(prisma.log.length, 0);
});
test('statisticsByForm zero counts return 404 without metadata or file', async () => {
  prisma.when('registration.count', 0);
  const res = await S.call(ctrl.statisticsByForm, BODY);
  assert.equal(res.statusCode, 404);
  assert.equal(cap.files.length, 0);
  assert.equal(prisma.calls('raport.create').length, 0);
});
test('statisticsByForm count failure skips one workplace and recomputes totals', async () => {
  prisma.when('registration.count', S.countHandler(counts, {
    throwFor: 'Завод'
  }));
  L.assertRows((await generate()).doc, [['Объект', 4, 3, 2, 0, 1, 0], ['ВСЕГО:', 4, 3, 2, 0, 1, 0]], 'workplace');
});
for (const operation of ['registration.findMany', 'raport.create', 'raportLink.create']) test(`statisticsByForm ${operation} failure returns 500 without file`, async () => {
  prisma.when(operation, () => {
    throw new Error('synthetic failure');
  });
  const res = await S.call(ctrl.statisticsByForm, BODY);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, 'synthetic failure');
  assert.equal(cap.files.length, 0);
});
