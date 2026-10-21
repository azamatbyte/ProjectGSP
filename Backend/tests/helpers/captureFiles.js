// Intercepts generated documents so tests read them from memory and nothing
// lands in Backend/uploads.
//
//   const cap = captureGeneratedFiles();   // in before()
//   ... call the controller ...
//   const { buffer, path } = cap.last();    // or cap.byExt(".docx")
//   cap.restore();                          // in after()
//
// Covers fs.writeFileSync / fs.promises.writeFile / fs.writeFile (docx via
// Packer.toBuffer) and ExcelJS workbook.xlsx.writeFile (xlsx). Writes outside
// Backend/uploads pass through untouched.
const fs = require("fs");
const path = require("path");

const UPLOADS = path.resolve(__dirname, "../../uploads");

function isUpload(p) {
  if (typeof p !== "string") return false;
  const relative = path.relative(UPLOADS, path.resolve(p));
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function captureGeneratedFiles() {
  const files = [];
  const orig = {
    writeFileSync: fs.writeFileSync,
    writeFile: fs.writeFile,
    promisesWriteFile: fs.promises.writeFile,
  };

  const record = (p, data) => {
    files.push({ path: p, ext: path.extname(p).toLowerCase(), buffer: Buffer.isBuffer(data) ? data : Buffer.from(data) });
  };

  fs.writeFileSync = function (p, data, ...rest) {
    if (isUpload(p)) return record(p, data);
    return orig.writeFileSync.call(this, p, data, ...rest);
  };
  fs.writeFile = function (p, data, ...rest) {
    if (isUpload(p)) {
      record(p, data);
      const cb = rest.find((r) => typeof r === "function");
      if (cb) process.nextTick(cb, null);
      return undefined;
    }
    return orig.writeFile.call(this, p, data, ...rest);
  };
  fs.promises.writeFile = async function (p, data, ...rest) {
    if (isUpload(p)) return record(p, data);
    return orig.promisesWriteFile.call(this, p, data, ...rest);
  };

  let xlsxProto = null;
  let origXlsxWriteFile = null;
  try {
    xlsxProto = require("exceljs/lib/xlsx/xlsx").prototype;
    origXlsxWriteFile = xlsxProto.writeFile;
    xlsxProto.writeFile = async function (p, options) {
      if (isUpload(p)) return record(p, await this.writeBuffer(options));
      return origXlsxWriteFile.call(this, p, options);
    };
  } catch {
    xlsxProto = null;
  }

  return {
    files,
    last() {
      return files[files.length - 1];
    },
    byExt(ext) {
      return files.filter((f) => f.ext === ext.toLowerCase());
    },
    clear() {
      files.length = 0;
    },
    restore() {
      fs.writeFileSync = orig.writeFileSync;
      fs.writeFile = orig.writeFile;
      fs.promises.writeFile = orig.promisesWriteFile;
      if (xlsxProto) xlsxProto.writeFile = origXlsxWriteFile;
    },
  };
}

module.exports = { captureGeneratedFiles, UPLOADS };
