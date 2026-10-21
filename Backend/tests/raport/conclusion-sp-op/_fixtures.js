// Realistic fixtures (Cyrillic data shaped like the real rows) for the
// conclusion / SP / OP tests. Every factory returns fresh objects.

// conclusionController.readConclusions() -> the "Conclusion" entry used by generateReport.
const conclusion = () => ({
  id: "5e11cebc-925b-497b-8bc9-6a5075d79194",
  name: "Conclusion",
  title: "«У Т В Е Р Ж Д А Ю»",
  to_organization: "Министр МВД Республики Узбекистан",
  to_position: "генерал,Арипов О.А.",
  to_who: "",
  title_center: "Заключение",
  executor: "Сотрудник УАК",
  boss: "Начальник УКЕ МВД Республики Узбекистан",
  first_input: "По результатам проверки по форме (________):",
  second_input: "По итогам допуск или отказ!",
});

// The logged-in admin (req.userId = "admin-1").
const admin = () => ({
  id: "admin-1",
  first_name: "Бахтиёр",
  last_name: "Шарипов",
  father_name: "Умарович",
  workplace: "УАК МВД",
  rank: "майор",
  phone: "+998 71 233-45-67",
});

const signers = () => ({
  "sign-1": {
    id: "sign-1",
    lastName: "Каримов",
    firstName: "Рустам",
    fatherName: "Алиевич",
    position: "Начальник управления",
    workplace: "УКЕ МВД",
    rank: "полковник",
  },
  "sign-2": {
    id: "sign-2",
    lastName: "Юсупова",
    firstName: "Дилноза",
    fatherName: "Бахромовна",
    position: "Заместитель начальника",
    workplace: "ГСБП",
    rank: "подполковник",
  },
  "sign-3": {
    id: "sign-3",
    lastName: "Турсунов",
    firstName: "Олим",
    fatherName: "Хакимович",
    position: "Начальник отдела",
    workplace: "СГБ",
    rank: "майор",
  },
});

// Registrations as prisma.registration.findFirst/findUnique return them.
const registrations = () => ({
  "reg-1": {
    id: "reg-1",
    model: "registration",
    regNumber: "1708-19",
    form_reg: "4",
    fullName: "Абдуллаев Жасур Бахтиярович",
    firstName: "Жасур",
    lastName: "Абдуллаев",
    fatherName: "Бахтиярович",
    birthDate: new Date("1985-03-07T00:00:00.000Z"),
    birthYear: 1985,
    birthPlace: "г. Ташкент",
    residence: "м/ж: г. Ташкент, Юнусабадский р-н, кв. 4",
    workplace: "АО «Узбекнефтегаз», инженер",
    position: "инженер",
    recordNumber: "77/12",
    notes: "к/м",
    accessStatus: "ПРОВЕРКА",
    completeStatus: "COMPLETED",
    conclusionRegNum: "1700-19 ф-4",
    expired: new Date("2027-01-01T00:00:00.000Z"),
  },
  "reg-2": {
    id: "reg-2",
    model: "registration4",
    regNumber: "455-24",
    form_reg: "4",
    fullName: "Рахимова Нигора Шавкатовна",
    firstName: "Нигора",
    lastName: "Рахимова",
    fatherName: "Шавкатовна",
    birthDate: null,
    birthYear: 1990,
    birthPlace: "Самаркандская область",
    residence: "г. Самарканд, ул. Регистан, 12",
    workplace: "ООО «Самарканд Текстиль»",
    recordNumber: "",
    notes: null,
    accessStatus: "ДОПУСК",
    completeStatus: "WAITING",
    conclusionRegNum: null,
    expired: null,
  },
  "reg-3": {
    id: "reg-3",
    model: "relative",
    regNumber: "",
    form_reg: "1",
    fullName: "Абдуллаева Малика Рустамовна",
    firstName: "Малика",
    lastName: "Абдуллаева",
    fatherName: "Рустамовна",
    birthDate: new Date("1988-11-21T00:00:00.000Z"),
    birthYear: 1988,
    birthPlace: "Ферганская область",
    residence: "г. Фергана",
    workplace: "",
    notes: "",
    accessStatus: "ПРОВЕРКА",
    completeStatus: "FAILED",
    conclusionRegNum: null,
    expired: null,
  },
});

// relatives.findMany select shape used for the single-person conclusion.
const conclusionRelatives = () => [
  {
    relationDegree: "Отец",
    fullName: "Абдуллаев Бахтияр Каримович",
    notes: "судим в 1998 г.",
    birthDate: null,
    birthYear: 1960,
    birthPlace: "Самаркандская обл.",
    residence: "г. Самарканд",
    workplace: "пенсионер",
  },
  {
    relationDegree: "Брат",
    fullName: "Абдуллаев Шерзод Бахтиярович",
    notes: "выезжал в РФ",
    birthDate: new Date("1990-06-02T00:00:00.000Z"),
    birthYear: 1990,
    birthPlace: "г. Ташкент",
    residence: "г. Москва",
    workplace: "ООО «Строй»",
  },
];

// registration.findUnique(include Initiator/executor) for generateSP / generateOPRaport.
const spRegistration = () => ({
  id: "35d603b1-946d-42df-b565-100c98f0750c",
  model: "registration",
  regNumber: "1708-19",
  form_reg: "4",
  firstName: "Жасур",
  lastName: "Абдуллаев",
  fatherName: "Бахтиярович",
  fullName: "Абдуллаев Жасур Бахтиярович",
  birthDate: new Date("1985-03-07T00:00:00.000Z"),
  birthYear: 1985,
  birthPlace: "г. Ташкент",
  residence: "г. Ташкент, Юнусабадский р-н, кв. 4",
  workplace: "АО «Узбекнефтегаз»",
  position: "инженер",
  notes: "к/м",
  Initiator: { first_name: "Ойбек", last_name: "Назаров", father_name: "Тахирович" },
  executor: { first_name: "Бахтиёр", last_name: "Шарипов", father_name: "Умарович", phone: "+998 71 233-45-67" },
});

// Rows returned by the raw "RaportTypes" query (getRaportTypesByLinksRaw).
const raportTypes = () => [
  {
    id: "rt-1",
    name: "Т  А  Л  А  Б  Н  О  М  А",
    code: "mvd",
    organization: "ИЦ МВД Республики Узбекистан",
    requested_organization: "ГСБП Республики Узбекистан",
    link: "type1",
    notes: "",
  },
  {
    id: "rt-2",
    name: "СГБ",
    code: "sgb",
    organization: "СГБ Республики Узбекистан",
    requested_organization: "ГСБП Республики Узбекистан",
    link: "type2",
    notes: "",
  },
  {
    id: "rt-3",
    name: "НД1",
    code: "nd1",
    organization: "ГЛАВНОМУ ВРАЧУ ГОРОДСКОГО НАРКОЛОГИЧЕСКОГО ДИСПАНСЕРА",
    requested_organization: "ГОСУДАРСТВЕННАЯ СЛУЖБА БЕЗОПАСНОСТИ",
    link: "type3",
    notes: "Прошу проверить по учётам наркологии;Ответ направить в ГСБП",
  },
  {
    id: "rt-4",
    name: "НД2",
    code: "nd2",
    organization: "ГЛАВНОМУ ВРАЧУ ГОРОДСКОГО ПСИХОНЕВРОЛОГИЧЕСКОГО ДИСПАНСЕРА",
    requested_organization: "ГОСУДАРСТВЕННАЯ СЛУЖБА БЕЗОПАСНОСТИ",
    link: "type3",
    notes: "Прошу проверить по учётам психиатрии;Ответ направить в ГСБП",
  },
];

// prisma.relatives.findMany rows for generateOPRaport (model "relative").
const opRelatives = () => [
  {
    id: "rel-1",
    model: "relative",
    registrationId: "35d603b1-946d-42df-b565-100c98f0750c",
    lastName: "Абдуллаев",
    firstName: "Бахтияр",
    fatherName: "Каримович",
    birthDate: null,
    birthYear: 1960,
    birthPlace: "Самаркандская обл.",
    residence: "г. Самарканд, ул. Навои, 5",
  },
  {
    id: "rel-2",
    model: "relative",
    registrationId: "35d603b1-946d-42df-b565-100c98f0750c",
    lastName: "Абдуллаева",
    firstName: "Мунира",
    fatherName: "",
    birthDate: new Date("1963-05-10T12:00:00.000Z"),
    birthYear: null,
    birthPlace: "",
    residence: "",
  },
];

module.exports = {
  conclusion,
  admin,
  signers,
  registrations,
  conclusionRelatives,
  spRegistration,
  raportTypes,
  opRelatives,
};
