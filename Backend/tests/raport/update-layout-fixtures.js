// Explicit maintenance command; never invoked by tests or npm test.
// Review every resulting JSON diff before accepting changed formatting.
if (!process.argv.includes('--write')) throw new Error('Pass --write to deliberately replace the reviewed layout baselines.');
const fs = require('node:fs');
const path = require('node:path');
const { S, cases, run, layout, documentXml } = require('./_layoutSupport');
const env = S.boot();
(async () => {
  try {
    const directory = path.join(__dirname, 'layouts');
    fs.mkdirSync(directory, { recursive: true });
    for (const variant of cases) {
      const result = await run(env, variant);
      if (result.res.statusCode !== 200 || !result.doc) throw new Error(`${variant.name}: ${JSON.stringify(result.res.body)}`);
      fs.writeFileSync(path.join(directory, `${variant.name}.json`), JSON.stringify(layout(result.doc), null, 2) + '\n');
      fs.writeFileSync(path.join(directory, `${variant.name}.xml`), documentXml(result.file.buffer));
      console.log(variant.name, result.doc.sections.map(s => s.margins), result.doc.tables.length, result.doc.fontsUsed(), result.doc.sizesUsed());
    }
  } finally { env.shutdown(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
