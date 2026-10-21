// Reads a generated .xlsx buffer with ExcelJS into plain objects so tests can
// assert sheet layout and formatting: sheet names, page setup + margins
// (inches), orientation, column widths, row heights, merges, frozen panes,
// fonts, alignment, borders, fills, number formats, images, auto-filter.
//
//   const book = await inspectXlsx(buffer);
//   const s = book.sheet("Поиск");          // or book.sheets[0]
//   s.pageSetup.margins                     // { left, right, top, bottom, header, footer }
//   s.columns[0].width
//   s.cell("A1")                             // { value, text, font, alignment, border, fill, numFmt }
//   s.merges                                 // ["A1:F1", ...]
//   s.rows[3].height
const ExcelJS = require("exceljs");

function plain(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

function cellInfo(cell) {
  return {
    address: cell.address,
    value: cell.value && typeof cell.value === "object" && cell.value.richText ? cell.value.richText.map((t) => t.text).join("") : cell.value,
    text: cell.text,
    type: cell.type,
    font: plain(cell.font),
    alignment: plain(cell.alignment),
    border: plain(cell.border),
    fill: plain(cell.fill),
    numFmt: cell.numFmt,
    isMerged: cell.isMerged,
    master: cell.isMerged ? cell.master.address : undefined,
  };
}

async function inspectXlsx(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.slice(0, 4).toString("hex") !== "504b0304") {
    throw new Error("inspectXlsx: buffer is not a zip/xlsx (missing PK\\x03\\x04 magic)");
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheets = wb.worksheets.map((ws) => {
    const columns = [];
    for (let i = 1; i <= Math.max(ws.columnCount, ws.actualColumnCount); i += 1) {
      const c = ws.getColumn(i);
      columns.push({ index: i, letter: c.letter, width: c.width, hidden: c.hidden });
    }
    const rows = {};
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      rows[n] = { number: n, height: row.height, hidden: row.hidden, values: row.values.slice(1) };
    });
    const merges = Object.keys((ws._merges || {})).map((k) => ws._merges[k].range || ws._merges[k].shortRange || String(ws._merges[k]));
    return {
      name: ws.name,
      state: ws.state,
      rowCount: ws.rowCount,
      actualRowCount: ws.actualRowCount,
      columnCount: ws.columnCount,
      pageSetup: plain(ws.pageSetup),
      headerFooter: plain(ws.headerFooter),
      views: plain(ws.views),
      properties: plain(ws.properties),
      autoFilter: plain(ws.autoFilter),
      columns,
      rows,
      merges,
      // Anchor positions are 0-based col/row (ExcelJS native), ext is in pixels when set.
      images: ws.getImages().map((img) => {
        const anchor = (a) => (a ? { col: a.nativeCol ?? a.col, row: a.nativeRow ?? a.row, colOff: a.nativeColOff, rowOff: a.nativeRowOff } : undefined);
        return {
          imageId: img.imageId,
          tl: anchor(img.range && img.range.tl),
          br: anchor(img.range && img.range.br),
          ext: img.range && img.range.ext ? { width: img.range.ext.width, height: img.range.ext.height } : undefined,
          editAs: img.range && img.range.editAs,
        };
      }),
      cell: (addr) => cellInfo(ws.getCell(addr)),
      // Every cell in a row as info objects (1-based row number).
      row: (n) => {
        const out = [];
        ws.getRow(n).eachCell({ includeEmpty: true }, (c) => out.push(cellInfo(c)));
        return out;
      },
      findCell: (q) => {
        let hit;
        ws.eachRow((row) =>
          row.eachCell((c) => {
            if (!hit && (q instanceof RegExp ? q.test(c.text) : c.text === q)) hit = cellInfo(c);
          })
        );
        return hit;
      },
      raw: ws,
    };
  });
  return {
    sheets,
    sheetNames: sheets.map((s) => s.name),
    sheet: (name) => sheets.find((s) => s.name === name),
    media: (wb.model.media || []).map((m) => ({ type: m.type, extension: m.extension, name: m.name })),
    raw: wb,
  };
}

module.exports = { inspectXlsx };
