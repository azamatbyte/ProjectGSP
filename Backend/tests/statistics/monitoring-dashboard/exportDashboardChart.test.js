const S = require('./_support');
const {
  test,
  before,
  after,
  beforeEach,
  mock
} = require('node:test');
const assert = require('node:assert/strict');
const AdmZip = require('adm-zip');
const {
  inspectXlsx
} = require('../../helpers/xlsxInspector');
const {
  prisma,
  ctrl,
  SERVER_URL
} = S.loadController();
const BODY = {
  chartKey: 'counted_records',
  title: '  Итоги <2026> & СП  ',
  periodLabel: '  2 года  ',
  imageDataUrl: S.PNG_DATA_URL,
  filters: {
    x_axis: 'YEAR',
    year: 2
  }
};
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
  prisma.when('registration.count', a => a.where.regDate ? 11 : a.where.OR ? 5 : a.where.AND ? 2 : 8);
  prisma.when('registration.groupBy', [{
    workplace: 'Завод <1> & цех',
    _count: {
      id: 9
    }
  }, {
    workplace: 'Объект',
    _count: {
      id: 3
    }
  }]);
  prisma.when('form.findMany', [{
    name: 'Р'
  }, {
    name: 'О'
  }]);
  prisma.when('$queryRaw', []);
});
async function invoke(body = BODY) {
  return (await S.quiet(() => S.invoke(ctrl.exportDashboardChart, {
    body
  }))).result;
}
async function generate(body = BODY) {
  const res = await invoke(body);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const book = await inspectXlsx(cap.last().buffer);
  return {
    res,
    book,
    sheet: book.sheets[0]
  };
}
test('dashboard_chart_export returns one XLSX link with no report metadata writes', async () => {
  const {
    res,
    book
  } = await generate();
  assert.match(res.body.link, S.linkRe(SERVER_URL, 'xlsx'));
  assert.equal(cap.files.length, 1);
  assert.ok(res.body.link.endsWith(require('path').basename(cap.last().path)));
  assert.deepEqual(book.sheetNames, ['Dashboard Export']);
  assert.equal(prisma.calls('raport.create').length, 0);
  assert.equal(prisma.calls('raportLink.create').length, 0);
});
test('dashboard title/date/period: trimmed Unicode content, merged rows, heights, fonts, fills and alignment', async () => {
  const {
    sheet: s
  } = await generate();
  assert.deepEqual(s.merges, ['A1:F1', 'A2:F2', 'A3:F3']);
  assert.equal(s.cell('A1').value, 'Итоги <2026> & СП');
  assert.equal(s.cell('A2').value, 'Дата выгрузки: 15.01.2026, 14:00:00');
  assert.equal(s.cell('A3').value, 'Период: 2 года');
  assert.equal(s.rows[1].height, 30);
  assert.deepEqual(s.cell('A1').font, {
    bold: true,
    size: 16,
    color: {
      argb: 'FFFFFFFF'
    }
  });
  assert.deepEqual(s.cell('A1').fill, {
    type: 'pattern',
    pattern: 'solid',
    fgColor: {
      argb: 'FF2F5597'
    }
  });
  for (const address of ['A1', 'A2', 'A3']) assert.deepEqual(s.cell(address).alignment, {
    horizontal: 'left',
    vertical: 'middle'
  });
  for (const address of ['A2', 'A3']) assert.deepEqual(s.cell(address).font, {
    size: 11,
    color: {
      argb: 'FF333333'
    }
  });
});
test('dashboard embedded PNG bytes, A5 anchor and 920x340 dimensions survive real XLSX serialization', async () => {
  const {
    sheet,
    book
  } = await generate();
  assert.equal(sheet.images.length, 1);
  assert.deepEqual(sheet.images[0].tl, {
    col: 0,
    row: 4,
    colOff: 0,
    rowOff: 0
  });
  assert.deepEqual(sheet.images[0].ext, {
    width: 920,
    height: 340
  });
  assert.equal(book.media[0].extension, 'png');
  const zip = new AdmZip(cap.last().buffer);
  const image = zip.getEntries().find(e => /^xl\/media\/.*\.png$/.test(e.entryName));
  assert.ok(image);
  assert.deepEqual(image.getData(), Buffer.from(S.PNG_B64, 'base64'));
});
test('dashboard counted records table starts row 24 and retains numeric metrics and column widths', async () => {
  const {
    sheet: s
  } = await generate();
  assert.deepEqual(s.columns.map(c => c.width), [18, 14, 16, 14, 12, 18]);
  assert.equal(s.rows[24].height, 24);
  assert.deepEqual(s.rows[24].values.slice(1), ['Период', 'ОТКАЗ-1', 'Регистрация', 'Завершено', 'Доступ']);
  assert.deepEqual(s.rows[25].values.slice(1), ['2025', 2, 11, 8, 5]);
  assert.deepEqual(s.rows[26].values.slice(1), ['2026', 2, 11, 8, 5]);
  assert.equal(prisma.calls('registration.count').length, 8);
});
test('dashboard every table cell has exact borders/alignment; headers have blue fill and white bold font', async () => {
  const {
    sheet: s
  } = await generate();
  const edge = {
    style: 'thin',
    color: {
      argb: 'FFD9D9D9'
    }
  };
  for (let row = 24; row <= 26; row++) for (let col = 1; col <= 5; col++) {
    const c = s.cell(`${String.fromCharCode(64 + col)}${row}`);
    assert.deepEqual(c.border, {
      top: edge,
      left: edge,
      bottom: edge,
      right: edge
    });
    assert.deepEqual(c.alignment, {
      horizontal: 'left',
      vertical: 'middle',
      wrapText: true
    });
    assert.equal(c.numFmt, undefined);
    if (row === 24) {
      assert.deepEqual(c.font, {
        bold: true,
        color: {
          argb: 'FFFFFFFF'
        }
      });
      assert.deepEqual(c.fill, {
        type: 'pattern',
        pattern: 'solid',
        fgColor: {
          argb: 'FF4F81BD'
        }
      });
    }
  }
});
test('dashboard default print margins/orientation and no frozen panes, header/footer or filter', async () => {
  const {
    sheet: s
  } = await generate();
  assert.deepEqual(s.pageSetup.margins, {
    left: 0.7,
    right: 0.7,
    top: 0.75,
    bottom: 0.75,
    header: 0.3,
    footer: 0.3
  });
  assert.equal(s.pageSetup.orientation, 'portrait');
  assert.equal(s.views, null);
  assert.equal(s.headerFooter, null);
  assert.equal(s.autoFilter, undefined);
});
for (const model of ['registration', 'registration4']) test(`dashboard top OTK1 ${model} selects the right model, preserves rankings and widths`, async () => {
  const {
    sheet: s
  } = await generate({
    ...BODY,
    chartKey: `top_otk1_${model}`,
    filters: {
      year: 1
    }
  });
  assert.deepEqual(s.rows[24].values.slice(1), ['Год', 'Топ', 'Подразделение', 'ОТКАЗ-1']);
  assert.deepEqual(s.rows[25].values.slice(1), [2026, 1, 'Завод <1> & цех', 9]);
  assert.deepEqual(s.rows[26].values.slice(1), [2026, 2, 'Объект', 3]);
  assert.deepEqual(s.columns.map(c => c.width), [10, 8, 35, 14, 18, 18]);
  const q = prisma.calls('registration.groupBy')[0];
  assert.equal(q.where.model, model);
  assert.equal(q.take, 3);
  assert.deepEqual(q.orderBy, {
    _count: {
      id: 'desc'
    }
  });
});
test('dashboard empty top OTK1 emits placeholder row', async () => {
  prisma.when('registration.groupBy', []);
  const {
    sheet: s
  } = await generate({
    ...BODY,
    chartKey: 'top_otk1_registration',
    filters: {
      year: 1
    }
  });
  assert.deepEqual(s.rows[25].values.slice(1), [2026, '-', '-', 0]);
});
test('dashboard overdue trend exports active forms with zero rows for missing groups', async () => {
  const {
    sheet: s
  } = await generate({
    ...BODY,
    chartKey: 'form_overdue_trend',
    filters: {
      x_axis: 'YEAR',
      year: 1
    }
  });
  assert.deepEqual(s.rows[24].values.slice(1), ['Период', 'Форма', 'Просрочено']);
  assert.deepEqual(s.columns.map(c => c.width), [18, 35, 14, 18, 18, 18]);
  assert.ok(s.rows[25]);
  assert.equal(s.rows[25].values[1], '2026');
  assert.equal(s.rows[25].values[3], 0);
});
test('dashboard MONTH uses month period labels', async () => {
  const {
    sheet: s
  } = await generate({
    ...BODY,
    filters: {
      x_axis: 'MONTH',
      month: 2
    }
  });
  assert.deepEqual([s.rows[25].values[1], s.rows[26].values[1]], ['Dec.2025', 'Jan.2026']);
});
const invalid = [['unsupported key', {
  chartKey: 'unknown'
}], ['blank title', {
  title: ' '
}], ['nonstring title', {
  title: 5
}], ['blank period', {
  periodLabel: ''
}], ['missing filters', {
  filters: undefined
}], ['array filters', {
  filters: []
}], ['missing image', {
  imageDataUrl: undefined
}], ['unsupported image', {
  imageDataUrl: 'data:image/svg+xml;base64,QQ=='
}], ['empty image', {
  imageDataUrl: 'data:image/png;base64,!!!'
}], ['unknown axis', {
  filters: {
    x_axis: 'DAY'
  }
}], ['invalid month', {
  filters: {
    x_axis: 'MONTH',
    month: 0
  }
}], ['invalid year', {
  filters: {
    x_axis: 'YEAR',
    year: -1
  }
}], ['top years too large', {
  chartKey: 'top_otk1_registration',
  filters: {
    year: 11
  }
}]];
for (const [name, patch] of invalid) test(`dashboard rejects ${name} with 400 before writing`, async () => {
  const res = await invoke({
    ...BODY,
    ...patch
  });
  assert.equal(res.statusCode, 400, JSON.stringify(res.body));
  assert.equal(cap.files.length, 0);
  assert.equal(prisma.calls('raport.create').length, 0);
});
test('dashboard database failure returns 500 without file', async () => {
  prisma.when('registration.count', () => {
    throw new Error('synthetic failure');
  });
  const res = await invoke();
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, 'synthetic failure');
  assert.equal(cap.files.length, 0);
});
test('dashboard documents current one-column data/style offset defect explicitly', async () => {
  const {
    sheet: s
  } = await generate();
  // [null, ...values] is contiguous, so ExcelJS assigns null to A and starts
  // real values in B. Styling still targets A:E. Do not silently hide this by
  // stripping blanks without also documenting the actual cell addresses.
  assert.equal(s.cell('A24').value, null);
  assert.equal(s.cell('B24').value, 'Период');
  assert.equal(s.cell('F24').value, 'Доступ');
  assert.equal(s.cell('F25').value, 5);
  assert.equal(s.cell('F24').font, undefined);
  assert.equal(s.cell('F24').border, undefined);
});
test('dashboard overdue trend deduplicates forms, converts bigint counts, keeps absent forms zero', async () => {
  prisma.when('form.findMany', [{
    name: ' Р '
  }, {
    name: 'Р'
  }, {
    name: 'О'
  }, {
    name: ''
  }, {
    name: null
  }]);
  prisma.when('$queryRaw', [{
    form_key: 'Р',
    value: 7n
  }]);
  const {
    sheet: s
  } = await generate({
    ...BODY,
    chartKey: 'form_overdue_trend',
    filters: {
      x_axis: 'YEAR',
      year: 1
    }
  });
  assert.deepEqual(s.rows[25].values.slice(1), ['2026', 'Р', 7]);
  assert.deepEqual(s.rows[26].values.slice(1), ['2026', 'О', 0]);
  assert.equal(s.rows[27], undefined);
  assert.equal(prisma.calls('$queryRaw').length, 1);
});
test('dashboard overdue trend with no valid active forms returns 400', async () => {
  prisma.when('form.findMany', []);
  const res = await invoke({
    ...BODY,
    chartKey: 'form_overdue_trend'
  });
  assert.equal(res.statusCode, 400);
  assert.equal(cap.files.length, 0);
});
test('dashboard write failure is caught and does not create metadata', async () => {
  const proto = require('exceljs/lib/xlsx/xlsx').prototype;
  const original = proto.writeFile;
  try {
    proto.writeFile = async () => {
      throw new Error('disk full');
    };
    const res = await invoke();
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error, 'disk full');
    assert.equal(cap.files.length, 0);
    assert.equal(prisma.calls('raport.create').length, 0);
  } finally {
    proto.writeFile = original;
  }
});

test('dashboard trims image URL and normalizes axis while preserving exact image bytes', async () => {
  const { book, sheet } = await generate({
    ...BODY,
    imageDataUrl: `  ${S.PNG_DATA_URL}  `,
    filters: { x_axis: ' year ', year: 1 },
  });
  assert.equal(book.media[0].extension, 'png');
  assert.equal(sheet.rows[25].values[1], '2026');
  assert.equal(sheet.rows[26], undefined);
  const zip = new AdmZip(cap.last().buffer);
  assert.deepEqual(zip.getEntries().find(e => /^xl\/media\/.*\.png$/.test(e.entryName)).getData(), Buffer.from(S.PNG_B64, 'base64'));
});

test('dashboard creates a missing upload directory before writing the workbook', async (t) => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { UPLOADS } = require('../../helpers/captureFiles');
  const exists = fs.existsSync;
  t.mock.method(fs, 'existsSync', file => path.resolve(file) === UPLOADS ? false : exists(file));
  const mkdir = t.mock.method(fs, 'mkdirSync', (file, options) => {
    assert.equal(path.resolve(file), UPLOADS);
    assert.deepEqual(options, { recursive: true });
  });
  await generate();
  assert.equal(mkdir.mock.callCount(), 1);
  assert.equal(cap.files.length, 1);
});

test('dashboard directory creation failure returns 500 with no file or metadata', async (t) => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { UPLOADS } = require('../../helpers/captureFiles');
  const exists = fs.existsSync;
  t.mock.method(fs, 'existsSync', file => path.resolve(file) === UPLOADS ? false : exists(file));
  t.mock.method(fs, 'mkdirSync', () => { throw new Error('directory denied'); });
  const res = await invoke();
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, 'directory denied');
  assert.equal(res.body.link, undefined);
  assert.equal(cap.files.length, 0);
  assert.equal(prisma.calls('raport.create').length, 0);
});

for (const [chartKey, operation] of [
  ['form_overdue_trend', 'form.findMany'],
  ['form_overdue_trend', '$queryRaw'],
  ['top_otk1_registration', 'registration.groupBy'],
  ['top_otk1_registration4', 'registration.groupBy'],
]) test(`dashboard ${chartKey} ${operation} failure cannot publish a download link`, async () => {
  prisma.when(operation, () => { throw new Error('query unavailable'); });
  const res = await invoke({ ...BODY, chartKey, filters: { x_axis: 'YEAR', year: 1 } });
  assert.deepEqual(res.body, { code: 500, message: 'Internal server error', error: 'query unavailable' });
  assert.equal(res.statusCode, 500);
  assert.equal(cap.files.length, 0);
  assert.equal(prisma.calls('raport.create').length, 0);
});
