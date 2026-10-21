// Small, realistic rows for every model exported by /auth/backup.
// Keys are the Prisma model names used in backupHelper.js (prismaModel).
// Returns fresh objects on every call.
const D = (s) => new Date(s);

function buildFixtures() {
  const created = D("2025-02-10T08:30:00.000Z");
  const updated = D("2025-03-11T12:45:30.500Z");
  const ts = { createdAt: created, updatedAt: updated };

  return {
    admin: [
      {
        id: "adm-1",
        username: "superadmin",
        password: "$2a$10$hashhashhash",
        birthDate: D("1980-05-17T00:00:00.000Z"),
        father_name: "Рустамович",
        first_name: "Азамат",
        last_name: "Алиқулов",
        nationality: "узбек",
        rank: "майор",
        gender: "male",
        workplace: "Управление, отдел 1",
        phone: "+998901112233",
        photo: null,
        salt: "salt-1",
        role: "superAdmin",
        status: "active",
        ...ts,
        // not a backup column: must not appear in the CSV
        secretInternal: "do-not-export",
      },
      {
        id: "adm-2",
        username: "operator",
        password: "$2a$10$otherhash",
        birthDate: null,
        father_name: "Ильич",
        first_name: "Иван",
        last_name: "Петров",
        nationality: "русский",
        rank: "капитан",
        gender: "male",
        workplace: "Отдел 2",
        phone: "+998907776655",
        photo: "/uploads/p.png",
        salt: "salt-2",
        role: "admin",
        status: "inactive",
        ...ts,
      },
    ],
    service: [
      { id: "srv-1", name: "Проверка", description: "Сервис проверки", code: 0, ...ts },
      { id: "srv-2", name: "Архив", description: null, code: 12, ...ts },
    ],
    form: [
      // status 'yes' is not === true -> serialized as false (see test NOTE)
      { id: "frm-1", name: "Форма 1", description: "Описание", length: 5, month: 12, type: "registration", status: "yes", ...ts },
      { id: "frm-2", name: "Форма 2", description: "", length: 3, month: 6, type: "registration4", status: true, ...ts },
    ],
    initiator: [
      { id: "ini-1", first_name: "Шерзод", last_name: "Каримов", father_name: "Бахтиёрович", rank: "полковник", notes: null, ...ts },
    ],
    relationDegree: [
      { id: "rd-1", name: "Отец", ...ts },
      { id: "rd-2", name: "Мать", ...ts },
      { id: "rd-3", name: "Брат", ...ts },
    ],
    workPlace: [{ id: "wp-1", name: "ООО \"Ромашка\"", ...ts }],
    systemSetting: [{ key: "regPrefix", value: "Р-", ...ts }],
    accessStatus: [
      { id: "as-1", name: "ДОПУСК", adminId: "adm-1", status: true, ...ts },
      { id: "as-2", name: "ОТКАЗ", adminId: "adm-1", status: false, ...ts },
    ],
    adminServiceAccess: [{ id: "asa-1", adminId: "adm-2", serviceId: "srv-1", grantedBy: "adm-1", ...ts }],
    registration: [
      {
        id: "reg-1",
        regNumber: "12/345",
        regDate: D("2025-01-20T00:00:00.000Z"),
        regEndDate: D("2030-01-20T00:00:00.000Z"),
        fullName: "Иванов Иван Иванович",
        firstName: "Иван",
        lastName: "Иванов",
        fatherName: "Иванович",
        nationality: "узбек",
        pinfl: "31234567890123",
        passport: "AA1234567",
        birthDate: D("1985-04-01T00:00:00.000Z"),
        birthYear: 1985,
        birthPlace: "г. Ташкент",
        residence: "г. Ташкент; ул. Навои, д. 5",
        workplace: "Завод",
        position: "инженер",
        status: "accepted",
        completeStatus: "WAITING",
        form_reg: "frm-1",
        form_reg_log: "frm-1",
        conclusionDate: null,
        conclusionRegNum: null,
        model: "registration",
        notes: "Примечание, с запятой",
        additionalNotes: 'Он сказал "да"',
        conclusion_compr: "  с пробелами  ",
        externalNotes: "Строка 1\nСтрока 2",
        accessStatus: "ДОПУСК",
        expired: D("2026-01-20T00:00:00.000Z"),
        expiredDate: null,
        recordNumber: "77",
        // a string date is normalised to ISO; an invalid one becomes ''
        endDate: "2025-03-01",
        or_tab: "ini-1",
        executorId: "adm-1",
        whoAdd: "adm-1",
        ...ts,
      },
      {
        id: "reg-2",
        regNumber: "12/346",
        regDate: D("2025-01-21T00:00:00.000Z"),
        fullName: "Петрова Анна Сергеевна",
        firstName: "Анна",
        lastName: "Петрова",
        fatherName: "Сергеевна",
        pinfl: null,
        birthYear: 1990,
        completeStatus: "COMPLETED",
        model: "registration4",
        endDate: "not-a-date",
        or_tab: "ini-1",
        executorId: "adm-2",
        ...ts,
      },
      {
        id: "reg-3",
        regNumber: "12/347",
        fullName: "Каримов Алишер",
        firstName: "Алишер",
        lastName: "Каримов",
        completeStatus: "IN_PROGRESS",
        model: "registration",
        ...ts,
      },
    ],
    relatives: [
      { id: "rel-1", regNumber: "12/345", relationDegree: "Отец", fullName: "Иванов Иван Петрович", firstName: "Иван", lastName: "Иванов", fatherName: "Петрович", birthYear: 1955, birthStatus: true, status_analysis: null, registrationId: "reg-1", model: "relative", ...ts },
      { id: "rel-2", regNumber: "12/345", relationDegree: "Мать", fullName: "Иванова Мария Олеговна", firstName: "Мария", lastName: "Иванова", fatherName: "Олеговна", birthYear: 1958, birthStatus: false, status_analysis: true, registrationId: "reg-1", model: "relative", ...ts },
      { id: "rel-3", regNumber: "12/345", relationDegree: "Брат", fullName: "Иванов Пётр Иванович", birthDate: D("1988-09-09T00:00:00.000Z"), birthStatus: null, registrationId: "reg-1", notes: "Проживает, работает", model: "relative", ...ts },
      { id: "rel-4", regNumber: "12/346", relationDegree: "Отец", fullName: "Петров Сергей", registrationId: "reg-2", model: "relative", ...ts },
    ],
    registrationLog: [
      { id: "rl-1", registrationId: "reg-1", fieldName: "notes", oldValue: "", newValue: "Примечание, с запятой", executorId: "adm-1", ...ts },
    ],
    log: [
      // a bare \r is NOT quoted by csv-writer (see test NOTE)
      { id: "log-1", recordId: "reg-1", tableName: "Registration", fieldName: "residence", oldValue: "a\rb", newValue: "Ташкент", executorId: "adm-1", ...ts },
      { id: "log-2", recordId: "rel-1", tableName: "Relatives", fieldName: "notes", oldValue: null, newValue: "x\r\ny", executorId: "adm-2", ...ts },
    ],
    seans: [
      { id: "se-1", adminId: "adm-1", resource: "login", ip_address: "192.168.1.10", user_agent: "Mozilla/5.0 (KHTML, like Gecko)", auth_method: "password", ...ts },
    ],
    refreshToken: [{ id: "rt-1", token: "tok.abc.def", adminId: "adm-1", expiredAt: D("2025-04-01T00:00:00.000Z"), ...ts }],
    upload: [{ id: "up-1", file_link: "/uploads/file1.pdf", uploadedBy: "adm-1", ...ts }],
    signList: [
      { id: "sl-1", lastName: "Сидоров", firstName: "Олег", fatherName: "Павлович", workplace: "Управление", position: "Начальник управления", rank: "генерал-майор", notes: null, birthDate: null, nationality: "узбек", gender: "male", phone: "+998900000001", photo: null, status: "active", ...ts },
      { id: "sl-2", lastName: "Тошматов", firstName: "Бахром", fatherName: "Анварович", workplace: "Отдел", position: "Заместитель", rank: "полковник", status: "active", ...ts },
    ],
    raportTypes: [
      { id: "rty-1", name: "Справка", code: "SPR", code_ru: "Справка", code_uz: "Ma'lumotnoma", organization: "Орг", requested_organization: "Запр. орг", signed_fio: "О. Сидоров", signed_position: "Начальник", link: null, notes: null, executorId: "adm-1", data: { a: 1, b: "x, y" }, ...ts },
    ],
    raport: [{ id: "rp-1", name: "Рапорт №1", executorId: "adm-1", link: "http://localhost:8080/api/v1/download/x.docx", notes: null, ...ts }],
    raportLink: [
      { id: "rlk-1", raportId: "rp-1", regNumber: "12/345", code: "R1", delete: false, display: true, adminCheck: false, discussCheck: true, operator: false, notes: null, registrations: [{ id: "reg-1" }, { id: "reg-2" }], ...ts },
      { id: "rlk-2", raportId: "rp-1", regNumber: "12/347", code: "R2", delete: true, display: false, adminCheck: true, discussCheck: false, operator: true, notes: "n", registrations: [], ...ts },
    ],
    archive: [{ id: "ar-1", name: "Архив 2024", data: [{ id: "reg-9", fullName: "Удалённый" }], executorId: "adm-1", ...ts }],
    temporaryData: [
      { id: "td-1", order: 1, form_reg: "frm-1", regNumber: "T-1", regDate: created, firstName: "Тест", lastName: "Тестов", fatherName: "Тестович", fullName: "Тестов Тест Тестович", birthYear: 1999, data: { k: "v" }, found_status: true, registrationSimilarity: [0.9], migration_status: false, status: "new", ...ts },
    ],
    session: [
      { id: "ss-1", registrationId: "reg-1", regNumber: "12/345", fullName: "Иванов Иван Иванович", firstName: "Иван", lastName: "Иванов", fatherName: "Иванович", birthYear: 1985, adminId: "adm-1", type: "RESERVE", order: 2, ...ts },
      { id: "ss-2", registrationId: "reg-2", regNumber: "12/346", fullName: "Петрова Анна Сергеевна", adminId: "adm-1", type: "SESSION", order: 1, ...ts },
    ],
  };
}

module.exports = { buildFixtures };
