const { describe, test, mock } = require('node:test');
const assert = require('node:assert/strict');
const S = require('./_support');
const Q = require('./_queryShared');

for (const [method, fixedName, kind] of [['generateQuerySgb', 'type9', 'SGB'], ['generateQueryGsbp', 'type8', 'GSBP']]) {
  describe(`${method} — editable body and variable content`, () => {
    const call = (opts) => Q.callQuery(S.ctrl[method], fixedName, opts);
    const bodyParagraphs = doc => doc.paragraphs.filter(p => p.alignment === 'both');
    test('body uses exact first-line/subject indentation and paragraph line/after spacing', async () => {
      const { doc } = await call();
      const paras = bodyParagraphs(doc);
      assert.equal(paras.length, kind === 'SGB' ? 4 : 3);
      assert.deepEqual(paras.map(p => p.indent), kind === 'SGB'
        ? [{ firstLine: 567 }, { left: 2832 }, { firstLine: 567 }, { firstLine: 567 }]
        : [{ firstLine: 567 }, { firstLine: 567 }, { firstLine: 567 }]);
      assert.deepEqual(paras.map(p => p.spacing), kind === 'SGB'
        ? [{ after: 120, line: 324 }, { after: 160 }, { after: 120 }, { after: 360 }]
        : [{ after: 120, line: 324 }, { after: 120, line: 324 }, { after: 360, line: 324 }]);
      for (const p of paras) for (const run of p.runs) {
        assert.deepEqual(run.font, Q.TNR);
        assert.equal(run.size, 28);
        assert.equal(run.highlight, undefined, 'Editable template text is ordinary text, not colored highlight');
      }
      assert.match(paras.map(p => p.text).join('\n'), /Ашуров Тохир Тилаволдиевич/);
      assert.match(paras.map(p => p.text).join('\n'), /12\.03\.1985/);
      assert.equal(paras.at(-1).text, 'Просим сообщить имеющиеся сведения.');
    });
    test('long Unicode/XML-sensitive body survives serialization without changing page geometry or margins', async () => {
      const long = 'Тест <документ> & "сведения" — '.repeat(65);
      const types = [S.raportType({ code: fixedName, link: fixedName, notes: long, editable_word: long })];
      const { doc, res } = await call({ types, reg: S.registration({ fullName: long, lastName: long, notes: long, birthPlace: long }) });
      assert.equal(res.statusCode, 200);
      assert.ok(doc.text.includes(long.trim()));
      assert.match(doc.xml, /&lt;документ&gt; &amp;/);
      assert.deepEqual(doc.sections[0].margins, { top: 850, right: 850, bottom: 850, left: 1701, header: 708, footer: 708, gutter: 0 });
      assert.equal(doc.sections.length, 1);
      assert.equal(doc.tables.length, 1);
      assert.equal(doc.tables[0].cellMargins, undefined);
      for (const cell of doc.tables[0].rows[0].cells) assert.equal(cell.margins, undefined);
      assert.equal(doc.pageBreakCount, 0, 'Long text relies on Word automatic pagination');
    });
    test('legacy data.editableWord is used when editable_word is absent', async () => {
      const { doc } = await call({ types: [S.raportType({ link: fixedName, code: fixedName, editable_word: '', data: { editableWord: 'Старый текст требований' } })] });
      assert.equal(bodyParagraphs(doc).at(-1).text, 'Старый текст требований.');
    });
    test('editable_word takes precedence over legacy JSON text', async () => {
      const { doc } = await call({ types: [S.raportType({ link: fixedName, code: fixedName, editable_word: 'Новый текст', data: { editableWord: 'СТАРЫЙ ТЕКСТ' } })] });
      assert.equal(bodyParagraphs(doc).at(-1).text, 'Новый текст.');
      assert.ok(!doc.text.includes('СТАРЫЙ ТЕКСТ'));
    });
    test('missing birth date falls back to birth year', async () => {
      const { doc } = await call({ reg: S.registration({ birthDate: null, birthYear: 1977 }) });
      assert.match(bodyParagraphs(doc).map(p => p.text).join('\n'), /1977 г\.р\./);
      assert.doesNotMatch(doc.text, /Invalid Date|NaN/);
    });
    test('only the first matching template supplies the dedicated query body', async () => {
      const { doc } = await call({ types: [
        S.raportType({ code: fixedName, link: fixedName, editable_word: 'Первое требование' }),
        S.raportType({ code: fixedName, link: fixedName, editable_word: 'ВТОРОЕ ТРЕБОВАНИЕ' }),
      ] });
      assert.equal(doc.sections.length, 1);
      assert.ok(doc.text.includes('Первое требование'));
      assert.ok(!doc.text.includes('ВТОРОЕ ТРЕБОВАНИЕ'));
    });
    test('database report-link failure returns no file after one report insert', async () => {
      const r = await call({ overrides: { 'raportLink.create': () => { throw new Error('link insert unavailable'); } } });
      assert.equal(r.res.statusCode, 500);
      assert.match(r.res.body.error, /link insert unavailable/);
      assert.equal(S.prisma.calls('raport.create').length, 1);
      assert.equal(r.files.length, 0);
    });
    for (const [label, matchAt] of [['name/link/code', 2], ['type2', 3], ['type1', 4], ['any template', 5]]) {
      test(`template fallback to ${label} preserves query layout and uses the returned editable body`, async () => {
        let queries = 0;
        const r = await call({ overrides: { '$queryRaw': () => {
          queries += 1;
          return queries === matchAt ? [S.raportType({ editable_word: `Fallback ${label}` })] : [];
        } } });
        assert.equal(r.res.statusCode, 200);
        assert.equal(queries, matchAt);
        assert.deepEqual(S.prisma.calls('$queryRaw').map(S.sqlValues), [
          [`%${fixedName}%`],
          [`%${fixedName}%`, `%${fixedName}%`, `%${fixedName}%`],
          ['%type2%'], ['%type1%'], [],
        ].slice(0, matchAt));
        assert.equal(bodyParagraphs(r.doc).at(-1).text, `Fallback ${label}.`);
        assert.deepEqual(r.doc.sections[0].margins, { top: 850, right: 850, bottom: 850, left: 1701, header: 708, footer: 708, gutter: 0 });
        assert.deepEqual(r.doc.tables[0].rows[0].cells.map(c => c.width), [18, 52, 30].map(size => ({ size: `${size}%`, type: 'pct' })));
      });
    }
    test('unresolved signer IDs are omitted while surviving input order still selects recipient and approval', async () => {
      const r = await call({ body: { id: 'reg-0001', signListIds: ['missing-a', 'sign-0002', 'missing-b', 'sign-0001'] } });
      assert.equal(r.res.statusCode, 200);
      assert.equal(Q.recipientParas(r.doc).at(-1).text, 'Юсупова Д.А.');
      assert.deepEqual(Q.agreedParas(r.doc).map(p => p.text), Q.agreedLines(S.signers.s1));
      assert.deepEqual(S.prisma.calls('signList.findUnique').map(a => a.where.id), ['missing-a', 'sign-0002', 'missing-b', 'sign-0001']);
      assert.doesNotMatch(r.doc.text, /missing-a|missing-b/);
    });
    test('DOCX packing failure returns 500 before any report persistence or file write', async () => {
      const packer = require('docx').Packer;
      const packed = mock.method(packer, 'toBuffer', async () => { throw new Error('fixture packing failed'); });
      try {
        const r = await call();
        assert.equal(r.res.statusCode, 500);
        assert.equal(r.res.body.error, 'fixture packing failed');
        assert.equal(r.files.length, 0);
        assert.equal(S.prisma.calls('raport.create').length, 0);
        assert.equal(S.prisma.calls('raportLink.create').length, 0);
      } finally {
        packed.mock.restore();
      }
    });
    test('trailing empty paragraphs are explicit spacing, not extra sections or page breaks', async () => {
      const { doc } = await call();
      if (kind === 'GSBP') {
        assert.equal(doc.paragraphs.slice(-20).length, 20);
        for (const p of doc.paragraphs.slice(-20)) {
          assert.equal(p.text, '');
          assert.deepEqual(p.spacing, { after: 0 });
          assert.equal(p.hasPageBreak, false);
        }
      } else assert.equal(doc.paragraphs.at(-1).text, '1708-19');
      assert.deepEqual(doc.sections[0].headers, {});
      assert.deepEqual(doc.sections[0].footers, {});
    });
  });
}
