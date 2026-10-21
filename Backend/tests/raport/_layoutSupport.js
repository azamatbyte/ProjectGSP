const { mock } = require('node:test');
const S = require('./conclusion-sp-op/_support');
const F = require('./conclusion-sp-op/_fixtures');
const B = require('./avr-upk-malumotnoma/_support');
const NOW = new Date('2026-01-15T09:00:00Z');
const REG = 'reg-1';
const REL = 'rel-1';
const base = { id: REG, ids: [REG], signListIds: ['sign-1', 'sign-2'], raport_data: '2026-01-15T09:00:00Z' };
const cases = [
  ['conclusion-single', 'generateReport', { type: 'RAPORT' }],
  ['conclusion-multiple', 'generateReport', { type: 'RAPORT', ids: [REG, 'reg-2'] }],
  ['sp-talabnoma', 'generateSP', { name: 'type123' }],
  ['sp-nd1', 'generateSP', { name: 'type6' }],
  ['sp-nd2', 'generateSP', { name: 'type7' }],
  ['op-nd1', 'generateOPRaport', { name: 'type6', ids: [REG, REL] }],
  ['op-nd2', 'generateOPRaport', { name: 'type7', ids: [REG, REL] }],
  ['avr', 'generateAVR', { name: 'AVR', code: 'avr', nationality: 'узбек', passport: 'AB1234567', residence: 'г. Ташкент', travel: 'РФ, 2020', additional_information: 'Дополнительные сведения' }],
  ['upk', 'generateUPK', { name: 'UPK', code: 'upk' }],
  ['malumotnoma', 'generateMalumotnoma', { name: 'Malumotnoma', code: 'malumotnoma' }],
  ['malumotnoma-list', 'generateMalumotnomaList', { type: 'SESSION', ids: [REG, REL] }],
  ['relative-list', 'generateRelativeList', { name: 'type11', ids: [REG, REL] }],
  ['query-sgb', 'generateQuerySgb', {}],
  ['query-gsbp', 'generateQueryGsbp', {}],
].map(([name, handler, body]) => ({ name, handler, body: { ...base, ...body } }));

function configure(env, variant, overrides = {}) {
  const p = env.prisma;
  p.reset();
  env.cap.clear();
  env.conclusions.list = [F.conclusion()];
  env.conclusions.throw = undefined;
  const rows = [
    { ...B.makeRegistration(), ...F.registrations()[REG], id: REG, executor: F.spRegistration().executor, Initiator: F.spRegistration().Initiator },
    { ...B.makeRegistration(), ...F.registrations()['reg-2'], id: 'reg-2' },
  ];
  const relatives = [{ ...B.makeRelative(), ...F.opRelatives()[0], id: REL }];
  const find = (list, a) => list.find(r => r.id === a.where.id) || null;
  const many = (list, a) => a?.where?.id?.in ? list.filter(r => a.where.id.in.includes(r.id)) : list;
  p.when('registration.findUnique', a => B.project(find(rows, a), a.include));
  p.when('registration.findFirst', a => find(rows, a));
  p.when('registration.findMany', a => many(rows, a));
  p.when('relatives.findUnique', a => B.project(find(relatives, a), a.include));
  p.when('relatives.findFirst', a => find(relatives, a));
  p.when('relatives.findMany', a => a?.where?.AND ? F.conclusionRelatives() : many(relatives, a));
  p.when('signList.findUnique', a => F.signers()[a.where.id] || null);
  p.when('signList.findMany', a => Object.values(F.signers()).filter(s => !a?.where?.id?.in || a.where.id.in.includes(s.id)));
  p.when('admin.findUnique', F.admin());
  p.when('session.findMany', [{ registrationId: REG }]);
  const isSingleForm = ['generateAVR', 'generateUPK', 'generateMalumotnoma', 'generateQuerySgb', 'generateQueryGsbp'].includes(variant.handler);
  const types = isSingleForm ? [B.makeRaportType({ code: variant.body.code || 'type9' })] : F.raportTypes();
  p.when('$queryRaw', types);
  for (const [key, value] of Object.entries(overrides)) p.when(key, value);
  return { rows, relatives, types };
}

async function run(env, variant, options = {}) {
  configure(env, variant, options.overrides);
  mock.timers.enable({ apis: ['Date'], now: NOW });
  try {
    return await S.call(env, variant.handler, { body: { ...variant.body, ...options.body }, query: options.query });
  } finally {
    mock.timers.reset();
  }
}

// Retain every parsed property, including all nested cells, runs, padding,
// spacing, indentation, page configuration, styles, headers and footers.
// Zip timestamps and relationship IDs are deliberately excluded.
function layout(doc) {
  const sections = doc.sections.map(({ headerRefs, footerRefs, ...section }) => section);
  return JSON.parse(JSON.stringify({ sections, styles: doc.styles, settings: doc.settings, blocks: doc.blocks }));
}
// Keep all OOXML attributes, even formatting fields the semantic inspector
// does not yet understand. Line breaks between tags make diffs reviewable.
function documentXml(buffer) {
  const AdmZip = require('adm-zip');
  return new AdmZip(buffer).readAsText('word/document.xml').replace(/></g, '>\n<') + '\n';
}
module.exports = { S, F, B, NOW, REG, REL, cases, configure, run, layout, documentXml };
