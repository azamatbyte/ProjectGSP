require('../api/helpers/consoleLogWithFunctionName');
const { loadEnv } = require('../config/env');
const { PrismaClient } = require('@prisma/client');
const { exitProcess } = require('../core/processLifecycle');

loadEnv();

const prisma = new PrismaClient();

async function clearProductionDB() {
    console.log('Clearing database...');
    try {
        await prisma.accessStatus.deleteMany();
        await prisma.workPlace.deleteMany();
        await prisma.refreshToken.deleteMany();
        await prisma.form.deleteMany();
        await prisma.upload.deleteMany();
        await prisma.relationDegree.deleteMany();
        await prisma.adminServiceAccess.deleteMany();
        await prisma.service.deleteMany();
        await prisma.seans.deleteMany();
        await prisma.admin.deleteMany();
        await prisma.registrationLog.deleteMany();
        await prisma.relatives.deleteMany();
        await prisma.registration.deleteMany();
        await prisma.initiator.deleteMany();
        await prisma.raport.deleteMany();
        await prisma.raportLink.deleteMany();
        await prisma.raportTypes.deleteMany();
        await prisma.archive.deleteMany();
        await prisma.temporaryData.deleteMany();
        await prisma.session.deleteMany();
        await prisma.signList.deleteMany();
        console.log('Database cleared successfully!');
    } catch (err) {
        console.error('Failed to clear database:', err);
        throw err;
    }
}

async function createDefaultAdminsAndServices() {
    try {
        // First clear all data
        await clearProductionDB();

        console.log('Starting seed process...');

        const service = await prisma.service.create({ data: { name: "Руководители", description: "Руководители для операторов.", code: 1 } });
        await prisma.service.create({ data: { name: "Места работы", description: "Места работы для операторов.", code: 2 } });
        await prisma.service.create({ data: { name: "Статистика", description: "Статистика для операторов.", code: 3 } });
        await prisma.service.create({ data: { name: "Удаление", description: "Удаление Ф-4 для операторов.", code: 4 } });

        const superAdmin = await prisma.admin.create({
            data: {
                first_name: "Super", last_name: "Admin", username: "superadmin", status: "active",
                password: "$2a$10$VlxkGYp1/vjOX4TGkppFPeBwUcByuCNp5GhMOPGWC116Vr9sN/9oO",
                salt: "$2a$10$Q4b2cf/QMoJMr.NFxnyBZu", role: "superAdmin"
            }
        });
        const admin = await prisma.admin.create({
            data: {
                first_name: "Admin", last_name: "Super", username: "admin01", status: "active",
                password: "$2a$10$VlxkGYp1/vjOX4TGkppFPeBwUcByuCNp5GhMOPGWC116Vr9sN/9oO",
                salt: "$2a$10$Q4b2cf/QMoJMr.NFxnyBZu", role: "superAdmin"
            }
        });
        const adminSimple = await prisma.admin.create({
            data: {
                first_name: "Admin", last_name: "Admin", username: "admin02", status: "active",
                password: "$2a$10$VlxkGYp1/vjOX4TGkppFPeBwUcByuCNp5GhMOPGWC116Vr9sN/9oO",
                salt: "$2a$10$Q4b2cf/QMoJMr.NFxnyBZu", role: "admin"
            }
        });
        await prisma.adminServiceAccess.create({ data: { adminId: admin.id, serviceId: service.id, grantedBy: superAdmin.id } });

        // Create forms
        await prisma.form.create({ data: { name: "Р", description: "Р", length: 2, month: 1, status: true, type: "registration" } });
        await prisma.form.create({ data: { name: "О", description: "О", length: 4, month: 1, status: true, type: "registration" } });
        await prisma.form.create({ data: { name: "У", description: "У", length: 1, month: 1, status: true, type: "registration4" } });
        await prisma.form.create({ data: { name: "1", description: "1", length: 2, month: 1, type: "registration" } });
        await prisma.form.create({ data: { name: "2", description: "2", length: 4, month: 1, type: "registration" } });
        await prisma.form.create({ data: { name: "3", description: "3", length: 4, month: 1, type: "registration" } });
        await prisma.form.create({ data: { name: "4", description: "4", length: 2, month: 1, type: "registration4" } });

        // Create access statuses
        await prisma.accessStatus.create({ data: { name: "СП ПРОВЕРКА", adminId: admin.id, status: true } });
        await prisma.accessStatus.create({ data: { name: "ОТКАЗ", adminId: admin.id, status: true } });
        await prisma.accessStatus.create({ data: { name: "ОТКАЗ-1", adminId: admin.id, status: true } });
        await prisma.accessStatus.create({ data: { name: "ДОПУСК АННУЛИРОВАН", adminId: admin.id, status: true } });
        await prisma.accessStatus.create({ data: { name: "ДОПУСК", adminId: admin.id, status: true } });
        await prisma.accessStatus.create({ data: { name: "ПРОВЕРКА", adminId: admin.id, status: true } });
        await prisma.accessStatus.create({ data: { name: "ЗАКЛЮЧЕНИЕ", adminId: admin.id, status: true } });
        await prisma.accessStatus.create({ data: { name: "ПОВТОРНЫЙ ОТКАЗ", adminId: admin.id, status: true } });
        await prisma.accessStatus.create({ data: { name: "СНЯТ ОТКАЗ", adminId: admin.id, status: true } });

        const raportTypesSeedData = [
            {
                name: "Т А Л А Б Н О М А",
                code: "osu_mvd",
                code_ru: "osu_mvd",
                code_uz: "osu_mvd",
                organization: "МВД Республики Узбекистан",
                requested_organization: "ГСБП Республики Узбекистан",
                signed_fio: "И.И.Иванов",
                signed_position: "Генеральный директор",
                link: "type1",
                notes: "Р",
                executorId: admin.id,
            },
            {
                name: "Т А Л А Б Н О М А",
                code: "osu_sgb",
                code_ru: "osu_sgb",
                code_uz: "osu_sgb",
                organization: "СГБ Республики Узбекистан",
                requested_organization: "ГСБП Республики Узбекистан",
                signed_fio: "И.И.Иванов",
                signed_position: "Генеральный директор",
                link: "type2",
                notes: "no name, no request_organization",
                executorId: admin.id,
            },
            {
                name: "Т А Л А Б Н О М А",
                code: "osu_gsbp",
                code_ru: "osu_gsbp",
                code_uz: "osu_gsbp",
                organization: "ГСБП Республики Узбекистан",
                requested_organization: "ГСБП Республики Узбекистан",
                signed_fio: "И.И.Иванов",
                signed_position: "Генеральный директор",
                link: "type2",
                notes: "no name, no request_organization",
                executorId: admin.id,
            },
            {
                name: "СЛУЖЕБНАЯ ЗАПИСКА",
                code: "avr",
                code_ru: "avr",
                code_uz: "avr",
                organization: "СГБ Республики Узбекистан",
                requested_organization: "ГСБП Республики Узбекистан",
                signed_fio: "И.И.Иванов",
                signed_position: "Генеральный директор",
                link: "Р",
                notes: "проверка по учетам",
                executorId: admin.id,
            },
            {
                name: "Т А Л А Б Н О М А",
                code: "upk",
                code_ru: "upk",
                code_uz: "upk",
                organization: "УПК ПВ",
                requested_organization: "ГСБП Республики Узбекистан",
                signed_fio: "И.И.Иванов",
                signed_position: "Генеральный директор",
                link: "Р",
                notes: "проверка по учетам",
                executorId: admin.id,
            },
            {
                name: "MA'LUMONOMA",
                code: "type8",
                code_ru: "mlm",
                code_uz: "mlm",
                organization: "Ўзбекистон Республикаси ПДХХ",
                requested_organization: "ГСБП Республики Узбекистан",
                signed_fio: "И.И.Иванов",
                signed_position: "Генеральный директор",
                link: "Р",
                notes: "bad",
                executorId: admin.id,
            },
            {
                name: "MA'LUMONOMA",
                code: "type9",
                code_ru: "mlm",
                code_uz: "mlm",
                organization: "ГСБП Республики Узбекистан",
                requested_organization: "ГСБП Республики Узбекистан",
                signed_fio: "И.И.Иванов",
                signed_position: "Генеральный директор",
                link: "Р",
                notes: "good",
                executorId: admin.id,
            },
            {
                name: "ND",
                code: "nd",
                code_ru: "nd",
                code_uz: "nd",
                organization: "Директору Ташкентского городского филиала РСНПМЦН",
                requested_organization: "ГОСУДАРСТВЕННАЯ СЛУЖБА БЕЗОПАСНОСТИ ПРИ ПРЕЗИДЕНТЕ РЕСПУБЛИКИ УЗБЕКИСТАН",
                link: "type3",
                signed_fio: "И.И.Иванов",
                signed_position: "Генеральный директор",
                notes: "В связи с возникшей необходимостью просим проверить по имеющимся учетам следующих лиц;должн подразделения",
                executorId: admin.id,
            },
            {
                name: "ND1",
                code: "nd1",
                code_ru: "nd1",
                code_uz: "nd1",
                organization: "ГЛАВНОМУ ВРАЧУ ГОРОДСКОГО ПСИХОНЕВРОЛОГИЧЕСКОГО  ДИСПАНСЕРА 1 (ул.Мукими, 94)",
                requested_organization: "ГОСУДАРСТВЕННАЯ СЛУЖБА БЕЗОПАСНОСТИ ПРИ ПРЕЗИДЕНТЕ РЕСПУБЛИКИ УЗБЕКИСТАН",
                signed_fio: "И.И.Иванов",
                signed_position: "Генеральный директор",
                link: "type3",
                notes: "В связи с возникшей необходимостью просим проверить по имеющимся учетам:;Начальник подразделения",
                executorId: admin.id,
            },
            {
                name: "ND2",
                code: "nd2",
                code_ru: "nd2",
                code_uz: "nd2",
                organization: "ГЛАВНОМУ ВРАЧУ ГОРОДСКОГО ПСИХОНЕВРОЛОГИЧЕСКОГО  ДИСПАНСЕРА 2 (ул. Лисунова, 25)",
                requested_organization: "ГОСУДАРСТВЕННАЯ СЛУЖБА БЕЗОПАСНОСТИ ПРИ ПРЕЗИДЕНТЕ РЕСПУБЛИКИ УЗБЕКИСТАН",
                signed_fio: "И.И.Иванов",
                signed_position: "Генеральный директор",
                link: "type3",
                notes: "В связи с возникшей необходимостью просим проверить по имеющимся учетам;Начальник подразделения",
                executorId: admin.id,
            },
        ];

        for (const raportType of raportTypesSeedData) {
            try {
                await prisma.raportTypes.create({ data: raportType });
            } catch (error) {
                if (error?.code === "P2002") {
                    console.warn(`Skipping duplicate raportType: ${raportType.code}`);
                    continue;
                }
                throw error;
            }
        }

        await prisma.registration.create({ data: { fullName: "Неизвестно", firstName: "Неизвестно", lastName: "Неизвестно", fatherName: "Неизвестно", regNumber: "Неизвестно", regDate: "2025-01-01T00:00:00.000Z", notes: "Неизвестно", executorId: admin.id } });
        await prisma.registration.create({ data: { fullName: "Неизвестно1", form_reg: "Р", firstName: "Неизвестно1", lastName: "Неизвестно1", fatherName: "Неизвестно1", regNumber: "Неизвестно1", regDate: "2024-01-01T00:00:00.000Z", notes: "Неизвестно1", executorId: adminSimple.id } });

        console.log('Seed completed successfully!');
        console.log('Created:');
        console.log('  - 4 services');
        console.log('  - 3 admins (superadmin, admin01, admin02)');
        console.log('  - 7 forms');
        console.log('  - 9 access statuses');
        console.log('  - 10 raport types');
        console.log('  - 2 registrations');

        return { id: admin.id, adminId: admin.id };
    } catch (err) {
        console.error('Failed to create default data:', err);
        throw err;
    } finally {
        await prisma.$disconnect();
    }
}

createDefaultAdminsAndServices()
    .then(() => exitProcess(0))
    .catch((err) => {
        console.error(err);
        exitProcess(1);
    });
