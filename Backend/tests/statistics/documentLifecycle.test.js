// Fault injection at the persistence boundary: generate real Word documents,
// but never connect to a database or write generated files to disk.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { Packer } = require('docx');
const S = require('./reports/_support');
const { prisma, cap, ctrl, SERVER_URL } = S.setup();
const period = { startDate: '2024-01-01T00:00:00.000Z', endDate: '2024-12-31T23:59:59.999Z' };
const endpoints = [
  ['reportStatements', { ...period, workplaces: ['all'] }, true],
  ['reportFromForm', period, true],
  ['statisticsByForm', { ...period, workplaces: ['all'] }, true],
  ['statisticsByYear', { years: ['2024'], forms: ['Р'], executorId: ['all'] }, true],
  ['monitoringByAdmin', { years: '2024', forms: ['Р'], executors: ['all'] }, false],
  ['weeeklyReport', { ...period, forms: ['Р'], admins: ['all'] }, true],
];

before(S.freezeTime);
after(() => { cap.restore(); S.unfreezeTime(); });
beforeEach(() => {
  prisma.reset();
  cap.clear();
  prisma.when('form.findMany', [{ name: 'Р' }]);
  prisma.when('form.findUnique', { name: 'Р' });
  const admin = { id: 'admin-1', role: 'superAdmin', first_name: 'Али', last_name: 'Каримов', father_name: '', AdminServiceAccess: [] };
  prisma.when('admin.findMany', [admin]);
  prisma.when('admin.findUnique', admin);
  prisma.when('registration.findMany', [{ workplace: 'Завод', regNumber: '42', form_reg: 'Р', fullName: 'Азиз', regDate: new Date('2024-02-01'), executor: admin }]);
  prisma.when('registration.count', 1);
  prisma.when('raport.create', a => ({ id: 'report-1', ...a.data }));
});

for (const [name, body, hasLink] of endpoints) {
  test(`${name}: packer failure returns 500 before any metadata or file is written`, async (t) => {
    t.mock.method(Packer, 'toBuffer', async () => { throw new Error('DOCX serialization failed'); });
    const res = await S.call(ctrl[name], body);
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error, 'DOCX serialization failed');
    assert.equal(res.body.link, undefined);
    assert.equal(prisma.calls('raport.create').length, 0);
    assert.equal(prisma.calls('raportLink.create').length, 0);
    assert.equal(cap.files.length, 0);
  });

  test(`${name}: disk failure exposes existing metadata-before-file ordering`, async (t) => {
    t.mock.method(fs, 'writeFileSync', () => { throw new Error('disk full'); });
    const res = await S.call(ctrl[name], body);
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error, 'disk full');
    assert.equal(res.body.link, undefined);
    assert.equal(cap.files.length, 0);
    assert.equal(prisma.calls('raport.create').length, 1);
    assert.equal(prisma.calls('raportLink.create').length, hasLink ? 1 : 0);
    // Characterize the orphan risk explicitly instead of claiming atomicity.
    assert.equal(prisma.calls('raport.delete').length, 0);
    assert.equal(prisma.calls('raportLink.delete').length, 0);
  });

  test(`${name}: repeated identical requests produce separate valid documents and matching metadata`, async () => {
    const first = await S.call(ctrl[name], body);
    const second = await S.call(ctrl[name], body);
    assert.equal(first.statusCode, 200, JSON.stringify(first.body));
    assert.equal(second.statusCode, 200, JSON.stringify(second.body));
    assert.match(first.body.link, S.linkRegex(SERVER_URL));
    assert.match(second.body.link, S.linkRegex(SERVER_URL));
    assert.notEqual(first.body.link, second.body.link);
    assert.equal(cap.files.length, 2);
    assert.equal(prisma.calls('raport.create').length, 2);
    assert.equal(prisma.calls('raportLink.create').length, hasLink ? 2 : 0);
    const { inspectDocx } = require('../helpers/docxInspector');
    for (let i = 0; i < 2; i++) {
      assert.ok(inspectDocx(cap.files[i].buffer).tables.length > 0);
      assert.equal(prisma.calls('raport.create')[i].data.link, [first, second][i].body.link);
      assert.ok([first, second][i].body.link.endsWith(require('node:path').basename(cap.files[i].path)));
    }
    assert.equal(prisma.calls('registration.update').length, 0);
    assert.equal(prisma.calls('registration.updateMany').length, 0);
  });
}
