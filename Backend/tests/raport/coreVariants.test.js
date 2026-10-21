// Branch and failure contracts supplement documentGeneration.test.js's full
// OOXML baselines. All database responses and upload writes stay in memory.
const { describe, test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Packer } = require('docx');
const { S, F, B, REG, cases, configure, run, documentXml } = require('./_layoutSupport');
const { UPLOADS } = require('../helpers/captureFiles');
const isUpload = file => path.dirname(String(file)) === UPLOADS;
const env = S.boot();
after(() => env.shutdown());
const variant = name => cases.find(c => c.name === name);
const core = ['conclusion-single', 'sp-talabnoma', 'op-nd1', 'avr', 'upk', 'malumotnoma'].map(variant);
const assertNoPublication = result => {
  assert.equal(result.file, undefined);
  assert.equal(result.res.body.link, undefined);
  assert.equal(env.prisma.calls('raport.create').length, 0);
  assert.equal(env.prisma.calls('raportLink.create').length, 0);
};

describe('conclusion configuration, signer order and exact status changes', () => {
  test('missing Conclusion configuration returns 404 before any registration read or update', async () => {
    configure(env, variant('conclusion-single'));
    env.conclusions.list = [{ ...F.conclusion(), name: 'Other document' }];
    const result = await S.call(env, 'generateReport', { body: variant('conclusion-single').body });
    assert.equal(result.res.statusCode, 404);
    assert.equal(result.res.body.message, 'Conclusion not found');
    assert.equal(env.prisma.calls('registration.findFirst').length, 0);
    assertNoPublication(result);
  });

  test('unreadable conclusion configuration returns 500 without writes', async () => {
    configure(env, variant('conclusion-single'));
    env.conclusions.throw = new Error('configuration unavailable');
    const result = await S.call(env, 'generateReport', { body: variant('conclusion-single').body });
    assert.equal(result.res.statusCode, 500);
    assertNoPublication(result);
    assert.equal(env.prisma.calls('registration.update').length, 0);
  });

  test('explicit ids bypass session selection and mixed registration models link once each', async () => {
    const result = await run(env, variant('conclusion-multiple'));
    assert.equal(result.res.statusCode, 200);
    assert.equal(env.prisma.calls('session.findMany').length, 0);
    const link = env.prisma.calls('raportLink.create')[0].data;
    assert.deepEqual(link.registrations, { connect: [{ id: REG }, { id: 'reg-2' }] });
    assert.equal(link.regNumber, '455-24');
    assert.equal(link.code, 'Заключение');
    assert.deepEqual(env.prisma.calls('registration.update'), [
      { where: { id: REG }, data: { accessStatus: 'ЗАКЛЮЧЕНИЕ', completeStatus: 'WAITING', expired: null, conclusionRegNum: '1708-19 ф-4', expiredDate: null } },
      { where: { id: 'reg-2' }, data: { accessStatus: 'ДОПУСК', completeStatus: 'WAITING', expired: null, conclusionRegNum: '455-24 ф-4', expiredDate: null } },
    ]);
    const logs = env.prisma.calls('registrationLog.create').map(call => call.data);
    assert.deepEqual(logs.filter(log => log.registrationId === REG), [
      { registrationId: REG, fieldName: 'accessStatus', oldValue: 'ПРОВЕРКА', newValue: 'ЗАКЛЮЧЕНИЕ', executorId: 'admin-1' },
      { registrationId: REG, fieldName: 'completeStatus', oldValue: 'COMPLETED', newValue: 'WAITING ЗАКЛЮЧЕНИЕ 1708-19 ф-4', executorId: 'admin-1' },
      { registrationId: REG, fieldName: 'conclusionRegNum', oldValue: '1700-19 ф-4', newValue: '1708-19 ф-4', executorId: 'admin-1' },
    ]);
    assert.deepEqual(logs.filter(log => log.registrationId === 'reg-2'), [
      { registrationId: 'reg-2', fieldName: 'conclusionRegNum', oldValue: null, newValue: '455-24 ф-4', executorId: 'admin-1' },
    ]);
  });

  test('first selected signer is the head, even when caller reverses signer order', async () => {
    const result = await run(env, variant('conclusion-single'), { body: { signListIds: ['sign-2', 'sign-1'] } });
    assert.equal(result.res.statusCode, 200);
    assert.deepEqual(env.prisma.calls('signList.findUnique'), [{ where: { id: 'sign-2' } }, { where: { id: 'sign-1' } }]);
    assert.match(result.doc.text, /Юсупова Д\.Б\./);
    assert.match(result.doc.text, /Каримов Р\.А\./);
    assert.ok(result.doc.text.indexOf('Юсупова Д.Б.') < result.doc.text.indexOf('Каримов Р.А.'));
    assert.equal(result.doc.sections[0].margins.left, 1701);
  });
});

describe('SP and OP psycho template selection', () => {
  for (const name of ['sp-nd1', 'sp-nd2', 'op-nd1', 'op-nd2']) {
    test(`${name}: legacy type2 template works when no type3 template exists`, async () => {
      const result = await run(env, variant(name), { overrides: {
        '$queryRaw': [{ ...F.raportTypes()[1], organization: 'LEGACY CLINIC' }],
      } });
      assert.equal(result.res.statusCode, 200);
      assert.match(result.doc.text, /LEGACY CLINIC/);
      assert.equal(result.doc.sections.length, 1);
      assert.deepEqual(result.doc.sections[0].margins, B.MARGINS);
      assert.equal(result.doc.tables.length, 5);
    });
  }

  test('OP automatic company selection is limited by the selected form', async () => {
    const result = await run(env, variant('op-nd1'), { body: { id: 'reg-2', ids: [] } });
    assert.equal(result.res.statusCode, 200);
    assert.deepEqual(env.prisma.calls('registration.findMany')[0].where, { form_reg: '4' });
    assert.equal(env.prisma.calls('relatives.findMany').length, 0);
    assert.equal(env.prisma.calls('raportLink.create')[0].data.registrations, undefined);
  });

  test('OP explicit selection with no registrations or relatives returns 404', async () => {
    const result = await run(env, variant('op-nd1'), { overrides: { 'registration.findMany': [], 'relatives.findMany': [] } });
    assert.equal(result.res.statusCode, 404);
    assert.equal(result.res.body.message, 'registration not found');
    assertNoPublication(result);
  });

  test('OP unsupported document type returns 404 even when templates exist', async () => {
    const result = await run(env, variant('op-nd1'), { body: { name: 'type123' } });
    assert.equal(result.res.statusCode, 404);
    assert.equal(result.res.body.message, 'No matching raport templates found');
    assertNoPublication(result);
  });
});

describe('form fields and signer validation', () => {
  for (const name of ['avr', 'upk', 'malumotnoma']) {
    test(`${name}: omitted and null signer selections are rejected without publication`, async () => {
      for (const signListIds of [undefined, null]) {
        const result = await run(env, variant(name), { body: { signListIds } });
        assert.equal(result.res.statusCode, 404);
        assert.equal(result.res.body.message, 'signListIds not found');
        assertNoPublication(result);
      }
    });
  }
  test('Malumotnoma rejects non-existent signers instead of emitting an unsigned certificate', async () => {
    const result = await run(env, variant('malumotnoma'), { body: { signListIds: ['unknown'] } });
    assert.equal(result.res.statusCode, 404);
    assert.equal(result.res.body.message, 'signList not found');
    assertNoPublication(result);
  });
  test('Malumotnoma refusal variant renders refusal text and the same page geometry', async () => {
    const result = await run(env, variant('malumotnoma'), { body: { name: 'type8' } });
    assert.equal(result.res.statusCode, 200);
    assert.match(result.doc.text, /уведомление об ОТКАЗЕ в допуске/);
    assert.doesNotMatch(result.doc.text, /справка о наличии допуска/);
    assert.deepEqual(result.doc.sections[0].margins, B.MARGINS);
    assert.equal(result.doc.tables.length, 12);
    assert.equal(env.prisma.calls('raportLink.create')[0].data.code, 'type8');
  });
  test('AVR request values appear in generated fields with XML-safe Unicode', async () => {
    const fields = { nationality: 'Ўзбек <>&', residence: 'RESIDENCE <>&', passport: 'PASSPORT <>&', travel: 'TRAVEL <>&' };
    const result = await run(env, variant('avr'), { body: fields });
    assert.equal(result.res.statusCode, 200);
    for (const value of Object.values(fields)) assert.ok(result.doc.text.includes(value), value);
    assert.match(result.doc.xml, /&lt;&gt;&amp;/);
    assert.deepEqual(result.doc.sections[0].margins, B.MARGINS);
  });
  test('known defect: AVR additional_information does not reach the generated document', async () => {
    const result = await run(env, variant('avr'), { body: { additional_information: 'UNIQUE ADDITIONAL INFORMATION' } });
    assert.equal(result.res.statusCode, 200);
    assert.doesNotMatch(result.doc.text, /UNIQUE ADDITIONAL INFORMATION/);
  });
  test('UPK request passport, residence and time period populate the form', async () => {
    const fields = { passport: 'PASSPORT-TEST', residence: 'RESIDENCE-TEST', time_period: '2019–2026 TEST' };
    const result = await run(env, variant('upk'), { body: fields });
    assert.equal(result.res.statusCode, 200);
    for (const value of Object.values(fields)) assert.ok(result.doc.text.includes(value), value);
    assert.deepEqual(result.doc.sections[0].margins, B.MARGINS);
  });
});

describe('deterministic default dates and failure stages', () => {
  for (const v of core.filter(v => v.handler !== 'generateReport')) {
    test(`${v.handler}: omitted date uses the frozen clock with identical document formatting`, async () => {
      const explicit = await run(env, v);
      const omitted = await run(env, v, { body: { raport_data: undefined } });
      assert.equal(omitted.res.statusCode, 200);
      assert.equal(documentXml(omitted.file.buffer), documentXml(explicit.file.buffer));
    });
  }
  for (const v of core) {
    test(`${v.handler}: serialization failure creates no report, link or upload`, async () => {
      const original = Packer.toBuffer;
      Packer.toBuffer = async () => { throw new Error('DOCX serialization failed'); };
      try {
        const result = await run(env, v);
        assert.equal(result.res.statusCode, 500);
        assert.equal(result.res.body.error, 'DOCX serialization failed');
        assertNoPublication(result);
        assert.equal(env.prisma.calls('registration.update').length, 0);
      } finally { Packer.toBuffer = original; }
    });
    test(`${v.handler}: link insertion failure reports 500 and does not publish a file`, async () => {
      const result = await run(env, v, { overrides: { 'raportLink.create': () => { throw new Error('link insert failed'); } } });
      assert.equal(result.res.statusCode, 500);
      assert.equal(result.res.body.error, 'link insert failed');
      assert.equal(result.file, undefined);
      assert.equal(result.res.body.link, undefined);
      // Characterization: report creation is not transactional with link creation.
      assert.equal(env.prisma.calls('raport.create').length, 1);
      assert.equal(env.prisma.calls('registration.update').length, 0);
    });
    test(`${v.handler}: disk failure returns 500 without a download URL`, async () => {
      const original = fs.writeFileSync;
      fs.writeFileSync = function (file, ...args) {
        if (isUpload(file)) throw new Error('upload disk full');
        return original.call(this, file, ...args);
      };
      try {
        const result = await run(env, v);
        assert.equal(result.res.statusCode, 500);
        assert.equal(result.res.body.error, 'upload disk full');
        assert.equal(result.file, undefined);
        assert.equal(result.res.body.link, undefined);
        // Current order creates both database rows before attempting the write.
        assert.equal(env.prisma.calls('raport.create').length, 1);
        assert.equal(env.prisma.calls('raportLink.create').length, 1);
      } finally { fs.writeFileSync = original; }
    });
  }
});
