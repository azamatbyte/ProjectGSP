const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { S, F, B, REG, REL, cases, configure, run, layout, documentXml } = require('./_layoutSupport');
const env = S.boot();
after(() => env.shutdown());

const specs = {
  'conclusion-single': [1, 7, [20, 28]],
  'conclusion-multiple': [1, 7, [20, 28]],
  'sp-talabnoma': [2, 20, [1, 12, 16, 24, 28, 32, 48]],
  'sp-nd1': [1, 5, [1, 12, 20, 24]],
  'sp-nd2': [1, 5, [1, 12, 20, 24]],
  'op-nd1': [1, 5, [1, 12, 20, 28]],
  'op-nd2': [1, 5, [1, 12, 20, 28]],
  avr: [1, 12, [1, 12, 24, 28, 32]],
  upk: [1, 12, [1, 12, 16, 24, 32, 48]],
  malumotnoma: [1, 12, [1, 12, 24, 28, 32]],
  'malumotnoma-list': [1, 6, [1, 12, 24]],
  'relative-list': [2, 6, [1, 12, 20, 24, 28]],
  'query-sgb': [1, 1, [20, 28]],
  'query-gsbp': [1, 1, [20, 28]],
};
const queryOrConclusion = name => /^(query|conclusion)-/.test(name);
const expectedLayout = name => JSON.parse(fs.readFileSync(path.join(__dirname, 'layouts', `${name}.json`), 'utf8'));

for (const variant of cases) {
  describe(`${variant.handler}: ${variant.name} — serialized DOCX contract`, () => {
    let result, expected, actual;
    before(async () => {
      result = await run(env, variant);
      assert.equal(result.res.statusCode, 200, JSON.stringify(result.res.body));
      assert.ok(result.doc, 'Handler must actually serialize a DOCX');
      expected = expectedLayout(variant.name);
      actual = layout(result.doc);
    });

    test('returns a document link, writes one valid package, persists the same URL', () => {
      const { res, file, doc } = result;
      assert.deepEqual(Object.keys(res.body).sort(), ['code', 'link', 'message']);
      assert.equal(res.body.code, 200);
      assert.equal(res.body.message, 'Document generated and saved successfully');
      assert.match(res.body.link, env.LINK_RE);
      assert.equal(path.basename(file.path), res.body.link.split('/').at(-1));
      assert.equal(env.cap.files.length, 1);
      assert.equal(res.downloaded, null);
      assert.equal(res.sentFile, null);
      for (const entry of ['[Content_Types].xml', 'word/document.xml', 'word/styles.xml', 'word/_rels/document.xml.rels']) assert.ok(doc.entries.includes(entry), entry);
      assert.equal(env.prisma.calls('raport.create').length, 1);
      assert.equal(env.prisma.calls('raport.create')[0].data.link, res.body.link);
      assert.equal(env.prisma.calls('raport.create')[0].data.executorId, 'admin-1');
      assert.equal(env.prisma.calls('raportLink.create').length, 1);
      if (variant.handler !== 'generateReport') assert.equal(env.prisma.calls('registration.update').length, 0);
    });

    test('every section has exact A4 dimensions, orientation and all seven margins', () => {
      assert.equal(result.doc.sections.length, specs[variant.name][0]);
      for (const section of result.doc.sections) {
        assert.deepEqual(section.page, { width: 11906, height: 16838, orientation: 'portrait' });
        assert.deepEqual(section.margins, queryOrConclusion(variant.name)
          ? { top: 850, right: 850, bottom: 850, left: 1701, header: 708, footer: 708, gutter: 0 }
          : B.MARGINS);
      }
      assert.deepEqual(actual.sections, expected.sections);
    });

    test('all text runs preserve fonts, half-point sizes, bold, italic, underline and colors', () => {
      assert.deepEqual(result.doc.sizesUsed(), specs[variant.name][2]);
      assert.deepEqual(result.doc.fontsUsed(), queryOrConclusion(variant.name) ? ['Times New Roman'] : [undefined, 'Times New Roman']);
      const runs = blocks => blocks.filter(b => b.type === 'paragraph').map(b => b.ref.runs);
      assert.deepEqual(runs(actual.blocks), runs(expected.blocks));
      assert.deepEqual(actual.styles, expected.styles);
    });

    test('every body paragraph preserves alignment, before/after/line spacing, indentation, tabs and breaks', () => {
      const paragraphs = blocks => blocks.filter(b => b.type === 'paragraph').map(({ ref: { runs, ...paragraph } }) => paragraph);
      assert.deepEqual(paragraphs(actual.blocks), paragraphs(expected.blocks));
    });

    test('every table and nested cell preserves widths, grid, borders, padding, merges, shading and text formatting', () => {
      assert.equal(result.doc.tables.length, specs[variant.name][1]);
      const tables = blocks => blocks.filter(b => b.type === 'table');
      assert.deepEqual(tables(actual.blocks), tables(expected.blocks));
    });

    test('all content and layout properties match the committed readable baseline', () => {
      assert.deepEqual(actual, expected);
      assert.match(result.doc.text, /Абдуллаев|АБДУЛЛАЕВ/);
      assert.equal(env.uploadsCount(), env.uploadsBefore, 'Generated files must stay in memory');
    });
    test('raw Word document XML preserves every attribute, including formatting outside the inspector model', () => {
      assert.equal(documentXml(result.file.buffer), fs.readFileSync(path.join(__dirname, 'layouts', `${variant.name}.xml`), 'utf8'));
    });
  });
}

const unique = [...new Map(cases.map(c => [c.handler, c])).values()];
for (const variant of unique) {
  describe(`${variant.handler} — failed generation`, () => {
    test('empty signers are rejected before persisting report or file', async () => {
      const result = await run(env, variant, { body: { signListIds: [] } });
      assert.equal(result.res.statusCode, 404, JSON.stringify(result.res.body));
      assert.equal(result.res.body.message, 'signListIds not found');
      assert.equal(result.file, undefined);
      assert.equal(env.prisma.calls('raport.create').length, 0);
      assert.equal(env.prisma.calls('raportLink.create').length, 0);
    });

    test('report persistence failure returns 500 and does not publish a file', async () => {
      const result = await run(env, variant, { overrides: { 'raport.create': () => { throw new Error('simulated report insert failure'); } } });
      assert.equal(result.res.statusCode, 500);
      assert.match(result.res.body.error, /simulated report insert failure/);
      assert.equal(result.file, undefined);
      assert.equal(env.prisma.calls('raportLink.create').length, 0);
    });

    if (!queryOrConclusion(variant.name) && variant.handler !== 'generateRelativeList') {
      test('invalid report date produces 400 with no file or report insert', async () => {
        const result = await run(env, variant, { body: { raport_data: 'not-a-date' } });
        assert.equal(result.res.statusCode, 400);
        assert.equal(result.res.body.message, 'Invalid raport_data');
        assert.equal(result.file, undefined);
        assert.equal(env.prisma.calls('raport.create').length, 0);
      });
      test('missing templates produces 404 without publishing a document', async () => {
        const result = await run(env, variant, { overrides: { '$queryRaw': [] } });
        assert.equal(result.res.statusCode, 404);
        assert.equal(result.file, undefined);
        assert.equal(env.prisma.calls('raport.create').length, 0);
      });
    }
  });
}

describe('generateReport — session fallback and registration updates', () => {
  const variant = cases[0];
  test('invalid type returns 400 before reads or writes', async () => {
    const r = await run(env, variant, { body: { type: 'INVALID' } });
    assert.equal(r.res.statusCode, 400);
    assert.equal(r.res.body.message, 'Invalid session type');
    assert.equal(env.prisma.log.length, 0);
  });
  test('empty explicit ids use ordered sessions belonging to the caller and requested type', async () => {
    const r = await run(env, variant, { body: { ids: [], type: 'RESERVE' } });
    assert.equal(r.res.statusCode, 200);
    assert.deepEqual(env.prisma.calls('session.findMany'), [{ where: { type: 'RESERVE', adminId: 'admin-1' }, orderBy: { order: 'asc' } }]);
    assert.match(r.doc.text, /Абдуллаев/);
  });
  test('no sessions returns 404 with no report or registration updates', async () => {
    const r = await run(env, variant, { body: { ids: [] }, overrides: { 'session.findMany': [] } });
    assert.equal(r.res.statusCode, 404);
    assert.equal(r.res.body.message, 'No data found');
    assert.equal(env.prisma.calls('registration.update').length, 0);
    assert.equal(r.file, undefined);
  });
  test('success updates each registration and records status changes', async () => {
    const r = await run(env, variant);
    assert.equal(r.res.statusCode, 200);
    const updates = env.prisma.calls('registration.update');
    assert.ok(updates.length > 0);
    assert.ok(updates.some(a => a.where.id === REG && a.data.completeStatus === 'WAITING'));
    assert.ok(updates.some(a => a.data.expired === null && a.data.expiredDate === null));
    assert.ok(env.prisma.calls('registrationLog.create').length > 0);
  });
  test('known defect: all ids missing returns 500 instead of a not-found response', async () => {
    const r = await run(env, variant, { overrides: { 'registration.findFirst': null } });
    assert.equal(r.res.statusCode, 500);
    assert.match(r.res.body.error, /regNumber/);
    assert.equal(r.file, undefined);
  });
});

describe('generateRelativeList — validation, fallback and known defects', () => {
  const variant = cases.find(c => c.handler === 'generateRelativeList');
  test('ids must be an array', async () => {
    for (const ids of [undefined, null, 'reg-1', {}]) {
      const r = await run(env, variant, { body: { ids } });
      assert.equal(r.res.statusCode, 400);
      assert.equal(r.res.body.message, 'Ids must be an array');
      assert.equal(env.prisma.log.length, 0);
    }
  });
  test('empty ids use sessions; missing sessions return 404', async () => {
    const success = await run(env, variant, { body: { ids: [] } });
    assert.equal(success.res.statusCode, 200);
    assert.equal(env.prisma.calls('session.findMany')[0].where.adminId, 'admin-1');
    const missing = await run(env, variant, { body: { ids: [] }, overrides: { 'session.findMany': [] } });
    assert.equal(missing.res.statusCode, 404);
    assert.equal(missing.res.body.message, 'No sessions found for the given type');
    assert.equal(missing.file, undefined);
  });
  test('known defect: invalid report dates are accepted and rendered as NaN', async () => {
    const r = await run(env, variant, { body: { raport_data: 'not-a-date' } });
    assert.equal(r.res.statusCode, 200);
    assert.match(r.doc.text, /NaNг\./);
  });
  test('known defect: no templates still creates a report and an empty DOCX', async () => {
    const r = await run(env, variant, { overrides: { '$queryRaw': [] } });
    assert.equal(r.res.statusCode, 200);
    assert.equal(r.doc.text, '');
    assert.equal(r.doc.sections.length, 0);
    assert.equal(env.prisma.calls('raport.create').length, 1);
  });
  test('relative-only list generates a file without linking to an unrelated registration', async () => {
    const r = await run(env, variant, { body: { ids: [REL] } });
    assert.equal(r.res.statusCode, 200);
    assert.match(r.doc.text, /Бахтияр/);
    assert.equal(env.prisma.calls('raportLink.create').length, 0);
  });
});

describe('downloadRaport — lookup contract', () => {
  test('requires registrationId and code independently', async () => {
    for (const query of [{}, { registrationId: REG }, { code: 'AVR' }]) {
      configure(env, cases[0]);
      const r = await S.call(env, 'downloadRaport', { query });
      assert.equal(r.res.statusCode, 400);
      assert.equal(r.res.body.message, 'Registration ID and code are required');
      assert.equal(env.prisma.log.length, 0);
    }
  });
  test('returns the newest matching stored report link without generating a document', async () => {
    configure(env, cases[0], { 'raportLink.findFirst': { raport: { name: 'AVR', link: 'https://example.invalid/document.docx' } } });
    const r = await S.call(env, 'downloadRaport', { query: { registrationId: REG, code: 'AVR' } });
    assert.equal(r.res.statusCode, 200);
    assert.deepEqual(r.res.body.data, { name: 'AVR', link: 'https://example.invalid/document.docx' });
    assert.deepEqual(env.prisma.calls('raportLink.findFirst'), [{ where: { code: 'AVR', registrations: { some: { id: REG } } }, include: { raport: true }, orderBy: { createdAt: 'desc' } }]);
    assert.equal(r.file, undefined);
  });
  test('returns 404 when no report matches', async () => {
    configure(env, cases[0]);
    const r = await S.call(env, 'downloadRaport', { query: { registrationId: REG, code: 'missing' } });
    assert.equal(r.res.statusCode, 404);
    assert.equal(r.res.body.message, 'Raport not found');
  });
  test('database lookup failure returns 500', async () => {
    configure(env, cases[0], { 'raportLink.findFirst': () => { throw new Error('lookup failed'); } });
    const r = await S.call(env, 'downloadRaport', { query: { registrationId: REG, code: 'AVR' } });
    assert.equal(r.res.statusCode, 500);
    assert.equal(r.res.body.error, 'lookup failed');
  });
});

describe('alternate sources, template composition and hostile text', () => {
  for (const handler of ['generateAVR', 'generateUPK', 'generateMalumotnoma']) {
    const variant = cases.find(c => c.handler === handler);
    test(`${handler}: absent registration and relative returns 404 without a document`, async () => {
      const r = await run(env, variant, { body: { id: 'missing' } });
      assert.equal(r.res.statusCode, 404);
      assert.equal(r.res.body.message, 'data not found');
      assert.equal(r.file, undefined);
      assert.equal(env.prisma.calls('raport.create').length, 0);
    });
    test(`${handler}: relative fallback supplies its own person data`, async () => {
      const r = await run(env, variant, { body: { id: REL } });
      assert.equal(r.res.statusCode, 200);
      assert.match(r.doc.text, /БАХТИЯР|Бахтияр/);
      assert.equal(env.prisma.calls('relatives.findUnique').length, 1);
    });
    test(`${handler}: multiple matching templates preserve each page's formatting and contents`, async () => {
      const r = await run(env, variant, { overrides: { '$queryRaw': [B.makeRaportType(), B.makeRaportType({ id: 'rt-2', organization: 'SECOND ORGANIZATION' })] } });
      assert.equal(r.res.statusCode, 200);
      assert.equal(r.doc.sections.length, 2);
      assert.match(r.doc.text, /SECOND ORGANIZATION/);
      for (const section of r.doc.sections) assert.deepEqual(section.margins, B.MARGINS);
      assert.equal(env.prisma.calls('raport.create').length, 1);
    });
  }
  test('SP rejects a missing registration and unsupported template combination', async () => {
    const variant = cases.find(c => c.name === 'sp-talabnoma');
    const missing = await run(env, variant, { body: { id: 'missing' } });
    assert.equal(missing.res.statusCode, 404);
    assert.equal(missing.res.body.message, 'registration not found');
    const unsupported = await run(env, variant, { body: { name: 'type6' }, overrides: { '$queryRaw': [F.raportTypes()[0]] } });
    assert.equal(unsupported.res.statusCode, 404);
    assert.equal(unsupported.file, undefined);
  });
  test('OP empty ids include relatives of the selected registration', async () => {
    const variant = cases.find(c => c.name === 'op-nd1');
    const r = await run(env, variant, { body: { ids: [] } });
    assert.equal(r.res.statusCode, 200);
    assert.match(r.doc.text, /Жасур/);
    assert.match(r.doc.text, /Бахтияр/);
    assert.deepEqual(env.prisma.calls('relatives.findMany')[0].where, { registrationId: REG, model: 'relative' });
  });
  test('known defect: OP missing registration in automatic-selection mode returns 500', async () => {
    const variant = cases.find(c => c.name === 'op-nd1');
    const r = await run(env, variant, { body: { id: 'missing', ids: [] } });
    assert.equal(r.res.statusCode, 500);
    assert.match(r.res.body.error, /model/);
    assert.equal(r.file, undefined);
  });
  test('Malumotnoma list resolves registrations from caller sessions when ids are empty', async () => {
    const variant = cases.find(c => c.name === 'malumotnoma-list');
    const r = await run(env, variant, { body: { ids: [] } });
    assert.equal(r.res.statusCode, 200);
    assert.deepEqual(env.prisma.calls('session.findMany')[0].where, { adminId: 'admin-1', type: 'SESSION' });
    assert.match(r.doc.text, /Абдуллаев/);
    const missing = await run(env, variant, { body: { ids: [] }, overrides: { 'session.findMany': [] } });
    assert.equal(missing.res.statusCode, 404);
    assert.equal(missing.file, undefined);
  });
  test('Word XML escapes metacharacters and retains long Unicode content without introducing markup', async () => {
    const variant = cases.find(c => c.name === 'query-sgb');
    const fullName = 'Абдуллаев <script>&" Тест ' + 'Ўзбекистон '.repeat(35);
    const r = await run(env, variant, { overrides: { 'registration.findUnique': { ...F.spRegistration(), id: REG, fullName, lastName: fullName, notes: 'Проверка <>&' } } });
    assert.equal(r.res.statusCode, 200);
    assert.ok(r.doc.text.includes('<script>&"'));
    assert.ok(!r.doc.xml.includes('<script>'));
    assert.match(r.doc.xml, /&lt;script&gt;&amp;/);
    assert.equal(r.doc.sections[0].margins.left, 1701);
  });
});
