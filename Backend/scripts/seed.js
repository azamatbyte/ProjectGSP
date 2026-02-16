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
        await prisma.admin.create({
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

        // Create raport types
        await prisma.raportTypes.create({ data: { name: "МВД", code: "osu_mvd", code_ru: "osu_mvd", code_uz: "osu_mvd", organization: "МВД Республики Узбекистан", requested_organization: "ГСБП Республики Узбекистан", signed_fio: "И.И.Иванов", signed_position: "Генеральный директор", link: "type1", notes: "Р", executorId: admin.id } });
        await prisma.raportTypes.create({ data: { name: "ОСУ", code: "osu_sgb", code_ru: "osu_sgb", code_uz: "osu_sgb", organization: "СГБ Республики Узбекистан", requested_organization: "ГСБП Республики Узбекистан", signed_fio: "И.И.Иванов", signed_position: "Генеральный директор", link: "type2", notes: "no name, no request_organization", executorId: admin.id } });
        await prisma.raportTypes.create({ data: { name: "ГСБП", code: "osu_sgb", code_ru: "osu_sgb", code_uz: "osu_sgb", organization: "ГСБП Республики Узбекистан", requested_organization: "ГСБП Республики Узбекистан", signed_fio: "И.И.Иванов", signed_position: "Генеральный директор", link: "type2", notes: "no name, no request_organization", executorId: admin.id } });

        await prisma.registration.create({ data: { fullName: "Неизвестно", firstName: "Неизвестно", lastName: "Неизвестно", fatherName: "Неизвестно", regNumber: "Неизвестно", regDate: "2025-01-01T00:00:00.000Z", notes: "Неизвестно", executorId: admin.id } });
        await prisma.registration.create({ data: { fullName: "Неизвестно1", form_reg: "Р", firstName: "Неизвестно1", lastName: "Неизвестно1", fatherName: "Неизвестно1", regNumber: "Неизвестно1", regDate: "2024-01-01T00:00:00.000Z", notes: "Неизвестно1", executorId: admin.id } });

        console.log('Seed completed successfully!');
        console.log('Created:');
        console.log('  - 4 services');
        console.log('  - 3 admins (superadmin, admin01, admin02)');
        console.log('  - 7 forms');
        console.log('  - 9 access statuses');
        console.log('  - 3 raport types');
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
