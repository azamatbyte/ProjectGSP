// Reads a generated .docx buffer into plain objects so tests can assert Word
// formatting: page size/orientation, margins, fonts, font sizes, bold/italic/
// underline, alignment, spacing, indents, tables (widths, borders, cell
// margins, merges, shading), page breaks, headers/footers and style defaults.
//
// Units are exactly what Word stores — no conversion:
//   twips (1/20 pt; 567 ≈ 1 cm) for page size, margins, spacing, indents, widths
//   half-points for font size (w:sz 28 = 14 pt)
//   eighths of a point for border size (w:sz 4 = 0.5 pt)
// Use the cm()/pt() helpers to state expectations readably.
//
//   const doc = inspectDocx(buffer);
//   doc.sections[0].margins            // { top, right, bottom, left, header, footer, gutter }
//   doc.sections[0].page               // { width, height, orientation }
//   doc.paragraphs                     // body paragraphs (not in tables), in order
//   doc.allParagraphs                  // body + table-cell paragraphs, in order
//   doc.findParagraph("ЗАКЛЮЧЕНИЕ")    // first paragraph whose text includes / matches
//   doc.tables[0].rows[0].cells[0]
//   doc.styles.defaults                // docDefaults run/paragraph props
//   doc.text                           // all body text joined with "\n"
const AdmZip = require("adm-zip");

// ---------------------------------------------------------------- XML parsing
const ENTITIES = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e] ?? m;
  });

function parseXml(xml) {
  const root = { name: "#root", attrs: {}, children: [] };
  const stack = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.children.push({ text: m[1] });
    else if (m[2]) stack.pop();
    else if (m[3]) {
      const attrs = {};
      const ar = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      let a;
      while ((a = ar.exec(m[4] || ""))) attrs[a[1]] = decode(a[2] ?? a[3]);
      const el = { name: m[3], attrs, children: [] };
      top.children.push(el);
      if (!m[5]) stack.push(el);
    } else if (m[6] !== undefined && (m[6].trim() !== "" || top.name === "w:t" || top.name === "w:instrText")) top.children.push({ text: decode(m[6]) });
  }
  return root;
}

const kids = (el, name) => (el && el.children ? el.children.filter((c) => c.name && (!name || c.name === name)) : []);
const kid = (el, name) => kids(el, name)[0];
const attr = (el, name) => (el && el.attrs ? el.attrs[name] : undefined);
// Numeric attributes become numbers; non-numeric ones (e.g. tblW "5000%",
// "auto") are kept as the raw string so nothing silently turns into NaN/null.
const num = (v) => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? v : n;
};

// w:b / w:i style toggles: present without w:val, or w:val not false/0 → true
function toggle(el) {
  if (!el) return undefined;
  const v = attr(el, "w:val");
  return !(v === "0" || v === "false" || v === "none");
}

function textOf(el) {
  if (!el) return "";
  if (el.text !== undefined) return el.text;
  return el.children.map(textOf).join("");
}

// ---------------------------------------------------------------- properties
function borderSet(el) {
  if (!el) return undefined;
  const out = {};
  for (const b of kids(el)) {
    out[b.name.replace("w:", "")] = {
      val: attr(b, "w:val"),
      size: num(attr(b, "w:sz")),
      space: num(attr(b, "w:space")),
      color: attr(b, "w:color"),
    };
  }
  return out;
}

function marginSet(el) {
  if (!el) return undefined;
  const out = {};
  for (const s of kids(el)) out[s.name.replace("w:", "")] = num(attr(s, "w:w"));
  return out;
}

function runProps(rPr) {
  if (!rPr) return {};
  const fonts = kid(rPr, "w:rFonts");
  const u = kid(rPr, "w:u");
  const out = {
    style: attr(kid(rPr, "w:rStyle"), "w:val"),
    font: fonts
      ? {
          ascii: attr(fonts, "w:ascii"),
          hAnsi: attr(fonts, "w:hAnsi"),
          cs: attr(fonts, "w:cs"),
          eastAsia: attr(fonts, "w:eastAsia"),
        }
      : undefined,
    size: num(attr(kid(rPr, "w:sz"), "w:val")),
    sizeCs: num(attr(kid(rPr, "w:szCs"), "w:val")),
    bold: toggle(kid(rPr, "w:b")),
    italic: toggle(kid(rPr, "w:i")),
    underline: u ? attr(u, "w:val") || "single" : undefined,
    strike: toggle(kid(rPr, "w:strike")),
    caps: toggle(kid(rPr, "w:caps")),
    smallCaps: toggle(kid(rPr, "w:smallCaps")),
    color: attr(kid(rPr, "w:color"), "w:val"),
    highlight: attr(kid(rPr, "w:highlight"), "w:val"),
    characterSpacing: num(attr(kid(rPr, "w:spacing"), "w:val")),
    vertAlign: attr(kid(rPr, "w:vertAlign"), "w:val"),
  };
  return prune(out);
}

function paraProps(pPr) {
  if (!pPr) return {};
  const sp = kid(pPr, "w:spacing");
  const ind = kid(pPr, "w:ind");
  const out = {
    style: attr(kid(pPr, "w:pStyle"), "w:val"),
    alignment: attr(kid(pPr, "w:jc"), "w:val"),
    spacing: sp
      ? prune({
          before: num(attr(sp, "w:before")),
          after: num(attr(sp, "w:after")),
          line: num(attr(sp, "w:line")),
          lineRule: attr(sp, "w:lineRule"),
        })
      : undefined,
    indent: ind
      ? prune({
          left: num(attr(ind, "w:left") ?? attr(ind, "w:start")),
          right: num(attr(ind, "w:right") ?? attr(ind, "w:end")),
          firstLine: num(attr(ind, "w:firstLine")),
          hanging: num(attr(ind, "w:hanging")),
        })
      : undefined,
    keepNext: toggle(kid(pPr, "w:keepNext")),
    keepLines: toggle(kid(pPr, "w:keepLines")),
    pageBreakBefore: toggle(kid(pPr, "w:pageBreakBefore")),
    widowControl: toggle(kid(pPr, "w:widowControl")),
    contextualSpacing: toggle(kid(pPr, "w:contextualSpacing")),
    numbering: kid(pPr, "w:numPr")
      ? {
          level: num(attr(kid(kid(pPr, "w:numPr"), "w:ilvl"), "w:val")),
          id: num(attr(kid(kid(pPr, "w:numPr"), "w:numId"), "w:val")),
        }
      : undefined,
    tabs: kid(pPr, "w:tabs")
      ? kids(kid(pPr, "w:tabs"), "w:tab").map((t) => ({ val: attr(t, "w:val"), pos: num(attr(t, "w:pos")), leader: attr(t, "w:leader") }))
      : undefined,
    borders: borderSet(kid(pPr, "w:pBdr")),
    shading: kid(pPr, "w:shd") ? { fill: attr(kid(pPr, "w:shd"), "w:fill"), val: attr(kid(pPr, "w:shd"), "w:val") } : undefined,
    runDefaults: kid(pPr, "w:rPr") ? runProps(kid(pPr, "w:rPr")) : undefined,
  };
  return prune(out);
}

function prune(o) {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

function sectionProps(sectPr) {
  if (!sectPr) return undefined;
  const pgSz = kid(sectPr, "w:pgSz");
  const pgMar = kid(sectPr, "w:pgMar");
  const cols = kid(sectPr, "w:cols");
  return prune({
    type: attr(kid(sectPr, "w:type"), "w:val"),
    page: pgSz
      ? prune({
          width: num(attr(pgSz, "w:w")),
          height: num(attr(pgSz, "w:h")),
          orientation: attr(pgSz, "w:orient") || "portrait",
        })
      : undefined,
    margins: pgMar
      ? prune({
          top: num(attr(pgMar, "w:top")),
          right: num(attr(pgMar, "w:right")),
          bottom: num(attr(pgMar, "w:bottom")),
          left: num(attr(pgMar, "w:left")),
          header: num(attr(pgMar, "w:header")),
          footer: num(attr(pgMar, "w:footer")),
          gutter: num(attr(pgMar, "w:gutter")),
        })
      : undefined,
    columns: cols ? prune({ count: num(attr(cols, "w:num")), space: num(attr(cols, "w:space")) }) : undefined,
    titlePage: kid(sectPr, "w:titlePg") ? toggle(kid(sectPr, "w:titlePg")) : undefined,
    pageNumberStart: num(attr(kid(sectPr, "w:pgNumType"), "w:start")),
    verticalAlign: attr(kid(sectPr, "w:vAlign"), "w:val"),
    headerRefs: kids(sectPr, "w:headerReference").map((h) => ({ type: attr(h, "w:type"), rId: attr(h, "r:id") })),
    footerRefs: kids(sectPr, "w:footerReference").map((h) => ({ type: attr(h, "w:type"), rId: attr(h, "r:id") })),
  });
}

// ---------------------------------------------------------------- body model
function readRun(r) {
  const props = runProps(kid(r, "w:rPr"));
  let text = "";
  const breaks = [];
  let tabs = 0;
  for (const c of kids(r)) {
    if (c.name === "w:t") text += textOf(c);
    else if (c.name === "w:tab") {
      text += "\t";
      tabs += 1;
    } else if (c.name === "w:br") {
      const type = attr(c, "w:type") || "textWrapping";
      breaks.push(type);
      if (type === "textWrapping") text += "\n";
    } else if (c.name === "w:cr") text += "\n";
    else if (c.name === "w:drawing" || c.name === "w:pict") props.hasImage = true;
    else if (c.name === "w:fldChar") props.fieldChar = attr(c, "w:fldCharType");
    else if (c.name === "w:instrText") props.fieldCode = (props.fieldCode || "") + textOf(c);
  }
  return { text, ...props, breaks, tabs };
}

function readParagraph(p, ctx) {
  const pPr = kid(p, "w:pPr");
  const props = paraProps(pPr);
  const runs = [];
  const collect = (el) => {
    for (const c of kids(el)) {
      if (c.name === "w:r") runs.push(readRun(c));
      else if (c.name === "w:hyperlink" || c.name === "w:smartTag" || c.name === "w:ins" || c.name === "w:fldSimple") collect(c);
    }
  };
  collect(p);
  const para = {
    index: ctx.counter++,
    text: runs.map((r) => r.text).join(""),
    ...props,
    runs,
    hasPageBreak: !!props.pageBreakBefore || runs.some((r) => r.breaks.includes("page")),
    inTable: ctx.inTable,
    sectionIndex: ctx.sectionIndex,
  };
  const sectPr = pPr && kid(pPr, "w:sectPr");
  if (sectPr) {
    ctx.sections.push(sectionProps(sectPr));
    ctx.sectionIndex += 1;
    para.endsSection = true;
  }
  return para;
}

function readTable(tbl, ctx) {
  const tblPr = kid(tbl, "w:tblPr");
  const w = kid(tblPr, "w:tblW");
  const ind = kid(tblPr, "w:tblInd");
  const table = {
    index: ctx.tableCounter++,
    sectionIndex: ctx.sectionIndex,
    nested: ctx.inTable,
    style: attr(kid(tblPr, "w:tblStyle"), "w:val"),
    width: w ? { size: num(attr(w, "w:w")), type: attr(w, "w:type") } : undefined,
    alignment: attr(kid(tblPr, "w:jc"), "w:val"),
    layout: attr(kid(tblPr, "w:tblLayout"), "w:type"),
    indent: ind ? { size: num(attr(ind, "w:w")), type: attr(ind, "w:type") } : undefined,
    borders: borderSet(kid(tblPr, "w:tblBorders")),
    cellMargins: marginSet(kid(tblPr, "w:tblCellMar")),
    grid: kids(kid(tbl, "w:tblGrid"), "w:gridCol").map((g) => num(attr(g, "w:w"))),
    rows: [],
  };
  const wasInTable = ctx.inTable;
  ctx.inTable = true;
  for (const tr of kids(tbl, "w:tr")) {
    const trPr = kid(tr, "w:trPr");
    const h = kid(trPr, "w:trHeight");
    const row = {
      height: h ? { size: num(attr(h, "w:val")), rule: attr(h, "w:hRule") } : undefined,
      isHeader: toggle(kid(trPr, "w:tblHeader")) || false,
      cantSplit: toggle(kid(trPr, "w:cantSplit")) || false,
      cells: [],
    };
    for (const tc of kids(tr, "w:tc")) {
      const tcPr = kid(tc, "w:tcPr");
      const tw = kid(tcPr, "w:tcW");
      const vm = kid(tcPr, "w:vMerge");
      const shd = kid(tcPr, "w:shd");
      const cell = prune({
        width: tw ? { size: num(attr(tw, "w:w")), type: attr(tw, "w:type") } : undefined,
        gridSpan: num(attr(kid(tcPr, "w:gridSpan"), "w:val")) || 1,
        vMerge: vm ? attr(vm, "w:val") || "continue" : undefined,
        verticalAlign: attr(kid(tcPr, "w:vAlign"), "w:val"),
        borders: borderSet(kid(tcPr, "w:tcBorders")),
        margins: marginSet(kid(tcPr, "w:tcMar")),
        shading: shd ? { fill: attr(shd, "w:fill"), val: attr(shd, "w:val"), color: attr(shd, "w:color") } : undefined,
        textDirection: attr(kid(tcPr, "w:textDirection"), "w:val"),
        paragraphs: [],
        tables: [],
      });
      for (const c of kids(tc)) {
        if (c.name === "w:p") {
          const p = readParagraph(c, ctx);
          cell.paragraphs.push(p);
          ctx.allParagraphs.push(p);
        } else if (c.name === "w:tbl") {
          const nt = readTable(c, ctx);
          cell.tables.push(nt);
          ctx.tables.push(nt);
        }
      }
      cell.text = cell.paragraphs.map((p) => p.text).join("\n");
      row.cells.push(cell);
    }
    table.rows.push(row);
  }
  ctx.inTable = wasInTable;
  return table;
}

function readPart(root) {
  const ctx = { counter: 0, tableCounter: 0, inTable: false, sectionIndex: 0, sections: [], allParagraphs: [], tables: [], blocks: [] };
  const container = kid(kid(root, "w:document"), "w:body") || kid(root, "w:hdr") || kid(root, "w:ftr");
  const paragraphs = [];
  for (const c of kids(container)) {
    if (c.name === "w:p") {
      const p = readParagraph(c, ctx);
      paragraphs.push(p);
      ctx.allParagraphs.push(p);
      ctx.blocks.push({ type: "paragraph", ref: p });
    } else if (c.name === "w:tbl") {
      const t = readTable(c, ctx);
      ctx.tables.push(t);
      ctx.blocks.push({ type: "table", ref: t });
    } else if (c.name === "w:sectPr") ctx.sections.push(sectionProps(c));
  }
  ctx.tables.sort((a, b) => a.index - b.index);
  return { paragraphs, allParagraphs: ctx.allParagraphs, tables: ctx.tables, sections: ctx.sections, blocks: ctx.blocks };
}

// ---------------------------------------------------------------- styles
function readStyles(root) {
  if (!root) return { defaults: {}, byId: {} };
  const styles = kid(root, "w:styles");
  const dd = kid(styles, "w:docDefaults");
  const defaults = {
    run: runProps(kid(kid(dd, "w:rPrDefault"), "w:rPr")),
    paragraph: paraProps(kid(kid(dd, "w:pPrDefault"), "w:pPr")),
  };
  const byId = {};
  for (const s of kids(styles, "w:style")) {
    byId[attr(s, "w:styleId")] = {
      type: attr(s, "w:type"),
      name: attr(kid(s, "w:name"), "w:val"),
      basedOn: attr(kid(s, "w:basedOn"), "w:val"),
      isDefault: attr(s, "w:default") === "1" || attr(s, "w:default") === "true",
      run: runProps(kid(s, "w:rPr")),
      paragraph: paraProps(kid(s, "w:pPr")),
    };
  }
  return { defaults, byId };
}

// ---------------------------------------------------------------- public API
function inspectDocx(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.slice(0, 4).toString("hex") !== "504b0304") {
    throw new Error("inspectDocx: buffer is not a zip/docx (missing PK\\x03\\x04 magic)");
  }
  const zip = new AdmZip(buffer);
  const read = (name) => {
    const e = zip.getEntry(name);
    return e ? e.getData().toString("utf8") : undefined;
  };
  const documentXml = read("word/document.xml");
  if (!documentXml) throw new Error("inspectDocx: word/document.xml missing");
  const body = readPart(parseXml(documentXml));

  const relsXml = read("word/_rels/document.xml.rels");
  const rels = {};
  if (relsXml) for (const r of kids(kid(parseXml(relsXml), "Relationships"), "Relationship")) rels[attr(r, "Id")] = attr(r, "Target");
  const partFor = (rId) => {
    const target = rels[rId];
    const xml = target && read(`word/${target.replace(/^\/?word\//, "")}`);
    return xml ? readPart(parseXml(xml)) : undefined;
  };
  for (const s of body.sections) {
    if (!s) continue;
    s.headers = Object.fromEntries((s.headerRefs || []).map((h) => [h.type, partFor(h.rId)]));
    s.footers = Object.fromEntries((s.footerRefs || []).map((h) => [h.type, partFor(h.rId)]));
  }

  const stylesXml = read("word/styles.xml");
  const styles = readStyles(stylesXml && parseXml(stylesXml));
  const settingsXml = read("word/settings.xml");
  const settingsRoot = settingsXml && kid(parseXml(settingsXml), "w:settings");

  const match = (p, q) => (q instanceof RegExp ? q.test(p.text) : p.text.includes(q));
  return {
    ...body,
    styles,
    settings: settingsRoot
      ? {
          defaultTabStop: num(attr(kid(settingsRoot, "w:defaultTabStop"), "w:val")),
          evenAndOddHeaders: toggle(kid(settingsRoot, "w:evenAndOddHeaders")) || false,
        }
      : {},
    entries: zip.getEntries().map((e) => e.entryName),
    xml: documentXml,
    text: body.allParagraphs.map((p) => p.text).join("\n"),
    pageBreakCount: body.allParagraphs.filter((p) => p.hasPageBreak).length,
    findParagraph: (q) => body.allParagraphs.find((p) => match(p, q)),
    findParagraphs: (q) => body.allParagraphs.filter((p) => match(p, q)),
    nonEmptyParagraphs: () => body.allParagraphs.filter((p) => p.text.trim() !== ""),
    // Every distinct font / size actually used by runs with text.
    fontsUsed: () => [...new Set(body.allParagraphs.flatMap((p) => p.runs.filter((r) => r.text.trim()).map((r) => r.font && (r.font.ascii || r.font.hAnsi))))],
    sizesUsed: () => [...new Set(body.allParagraphs.flatMap((p) => p.runs.filter((r) => r.text.trim()).map((r) => r.size)))].sort((a, b) => (a ?? 0) - (b ?? 0)),
  };
}

// Readable expectation helpers.
const cm = (v) => Math.round(v * 566.929); // twips; 1.5 cm -> 850, 3 cm -> 1701 (matches docx code comments)
const mm = (v) => cm(v / 10);
const pt = (v) => v * 2; // half-points for font sizes (14 pt -> 28)
const lineTwips = (v) => v * 20; // points -> twips for spacing before/after
const A4 = { width: 11906, height: 16838 }; // docx library default A4 portrait in twips

module.exports = { inspectDocx, parseXml, cm, mm, pt, lineTwips, A4 };
