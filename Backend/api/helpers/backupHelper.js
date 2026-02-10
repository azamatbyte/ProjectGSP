// Helper functions and configurations for complete database backup/restore

/**
 * Get all table configurations for backup/restore
 * Returns array of table configs with headers and data mapping functions
 */
const getTableConfigurations = () => {
    return [
        {
            name: 'admins',
            headers: [
                { id: 'id', title: 'ID' },
                { id: 'username', title: 'Username' },
                { id: 'password', title: 'Password' },
                { id: 'birthDate', title: 'Birth Date' },
                { id: 'father_name', title: 'Father Name' },
                { id: 'first_name', title: 'First Name' },
                { id: 'last_name', title: 'Last Name' },
                { id: 'nationality', title: 'Nationality' },
                { id: 'rank', title: 'Rank' },
                { id: 'gender', title: 'Gender' },
                { id: 'workplace', title: 'Workplace' },
                { id: 'phone', title: 'Phone' },
                { id: 'photo', title: 'Photo' },
                { id: 'salt', title: 'Salt' },
                { id: 'role', title: 'Role' },
                { id: 'status', title: 'Status' },
                { id: 'createdAt', title: 'Created At' },
                { id: 'updatedAt', title: 'Updated At' }
            ],
            dataMapper: (item) => ({
                id: item.id,
                username: item.username || '',
                password: item.password || '',
                birthDate: item.birthDate ? item.birthDate.toISOString() : '',
                father_name: item.father_name || '',
                first_name: item.first_name || '',
                last_name: item.last_name || '',
                nationality: item.nationality || '',
                rank: item.rank || '',
                gender: item.gender || '',
                workplace: item.workplace || '',
                phone: item.phone || '',
                photo: item.photo || '',
                salt: item.salt || '',
                role: item.role || '',
                status: item.status || '',
                createdAt: item.createdAt.toISOString(),
                updatedAt: item.updatedAt.toISOString()
            })
        },
        {
            name: 'initiators',
            headers: [
                { id: 'id', title: 'ID' },
                { id: 'first_name', title: 'First Name' },
                { id: 'last_name', title: 'Last Name' },
                { id: 'father_name', title: 'Father Name' },
                { id: 'rank', title: 'Rank' },
                { id: 'notes', title: 'Notes' },
                { id: 'createdAt', title: 'Created At' },
                { id: 'updatedAt', title: 'Updated At' }
            ],
            dataMapper: (item) => ({
                id: item.id,
                first_name: item.first_name || '',
                last_name: item.last_name || '',
                father_name: item.father_name || '',
                rank: item.rank || '',
                notes: item.notes || '',
                createdAt: item.createdAt.toISOString(),
                updatedAt: item.updatedAt.toISOString()
            })
        },
        {
            name: 'forms',
            headers: [
                { id: 'id', title: 'ID' },
                { id: 'name', title: 'Name' },
                { id: 'description', title: 'Description' },
                { id: 'length', title: 'Length' },
                { id: 'month', title: 'Month' },
                { id: 'type', title: 'Type' },
                { id: 'status', title: 'Status' },
                { id: 'createdAt', title: 'Created At' },
                { id: 'updatedAt', title: 'Updated At' }
            ],
            dataMapper: (item) => ({
                id: item.id,
                name: item.name || '',
                description: item.description || '',
                length: item.length || '',
                month: item.month || '',
                type: item.type || '',
                status: item.status !== undefined ? item.status : false,
                createdAt: item.createdAt.toISOString(),
                updatedAt: item.updatedAt.toISOString()
            })
        },
        {
            name: 'services',
            headers: [
                { id: 'id', title: 'ID' },
                { id: 'name', title: 'Name' },
                { id: 'description', title: 'Description' },
                { id: 'code', title: 'Code' },
                { id: 'createdAt', title: 'Created At' },
                { id: 'updatedAt', title: 'Updated At' }
            ],
            dataMapper: (item) => ({
                id: item.id,
                name: item.name || '',
                description: item.description || '',
                code: item.code || '',
                createdAt: item.createdAt.toISOString(),
                updatedAt: item.updatedAt.toISOString()
            })
        },
        {
            name: 'accessStatuses',
            headers: [
                { id: 'id', title: 'ID' },
                { id: 'name', title: 'Name' },
                { id: 'adminId', title: 'Admin ID' },
                { id: 'status', title: 'Status' },
                { id: 'createdAt', title: 'Created At' },
                { id: 'updatedAt', title: 'Updated At' }
            ],
            dataMapper: (item) => ({
                id: item.id,
                name: item.name || '',
                adminId: item.adminId || '',
                status: item.status !== undefined ? item.status : false,
                createdAt: item.createdAt.toISOString(),
                updatedAt: item.updatedAt.toISOString()
            })
        },
        {
            name: 'workPlaces',
            headers: [
                { id: 'id', title: 'ID' },
                { id: 'name', title: 'Name' },
                { id: 'createdAt', title: 'Created At' },
                { id: 'updatedAt', title: 'Updated At' }
            ],
            dataMapper: (item) => ({
                id: item.id,
                name: item.name || '',
                createdAt: item.createdAt.toISOString(),
                updatedAt: item.updatedAt.toISOString()
            })
        },
        {
            name: 'relationDegrees',
            headers: [
                { id: 'id', title: 'ID' },
                { id: 'name', title: 'Name' },
                { id: 'createdAt', title: 'Created At' },
                { id: 'updatedAt', title: 'Updated At' }
            ],
            dataMapper: (item) => ({
                id: item.id,
                name: item.name || '',
                createdAt: item.createdAt.toISOString(),
                updatedAt: item.updatedAt.toISOString()
            })
        },
        {
            name: 'signLists',
            headers: [
                { id: 'id', title: 'ID' },
                { id: 'lastName', title: 'Last Name' },
                { id: 'firstName', title: 'First Name' },
                { id: 'fatherName', title: 'Father Name' },
                { id: 'workplace', title: 'Workplace' },
                { id: 'position', title: 'Position' },
                { id: 'rank', title: 'Rank' },
                { id: 'notes', title: 'Notes' },
                { id: 'birthDate', title: 'Birth Date' },
                { id: 'nationality', title: 'Nationality' },
                { id: 'gender', title: 'Gender' },
                { id: 'phone', title: 'Phone' },
                { id: 'photo', title: 'Photo' },
                { id: 'status', title: 'Status' },
                { id: 'createdAt', title: 'Created At' },
                { id: 'updatedAt', title: 'Updated At' }
            ],
            dataMapper: (item) => ({
                id: item.id,
                lastName: item.lastName || '',
                firstName: item.firstName || '',
                fatherName: item.fatherName || '',
                workplace: item.workplace || '',
                position: item.position || '',
                rank: item.rank || '',
                notes: item.notes || '',
                birthDate: item.birthDate ? item.birthDate.toISOString() : '',
                nationality: item.nationality || '',
                gender: item.gender || '',
                phone: item.phone || '',
                photo: item.photo || '',
                status: item.status || '',
                createdAt: item.createdAt.toISOString(),
                updatedAt: item.updatedAt.toISOString()
            })
        },
        {
            name: 'registrationLogs',
            headers: [
                { id: 'id', title: 'ID' },
                { id: 'registrationId', title: 'Registration ID' },
                { id: 'fieldName', title: 'Field Name' },
                { id: 'oldValue', title: 'Old Value' },
                { id: 'newValue', title: 'New Value' },
                { id: 'executorId', title: 'Executor ID' },
                { id: 'createdAt', title: 'Created At' },
                { id: 'updatedAt', title: 'Updated At' }
            ],
            dataMapper: (item) => ({
                id: item.id,
                registrationId: item.registrationId || '',
                fieldName: item.fieldName || '',
                oldValue: item.oldValue || '',
                newValue: item.newValue || '',
                executorId: item.executorId || '',
                createdAt: item.createdAt.toISOString(),
                updatedAt: item.updatedAt.toISOString()
            })
        },
        {
            name: 'logs',
            headers: [
                { id: 'id', title: 'ID' },
                { id: 'recordId', title: 'Record ID' },
                { id: 'tableName', title: 'Table Name' },
                { id: 'fieldName', title: 'Field Name' },
                { id: 'oldValue', title: 'Old Value' },
                { id: 'newValue', title: 'New Value' },
                { id: 'executorId', title: 'Executor ID' },
                { id: 'createdAt', title: 'Created At' },
                { id: 'updatedAt', title: 'Updated At' }
            ],
            dataMapper: (item) => ({
                id: item.id,
                recordId: item.recordId || '',
                tableName: item.tableName || '',
                fieldName: item.fieldName || '',
                oldValue: item.oldValue || '',
                newValue: item.newValue || '',
                executorId: item.executorId || '',
                createdAt: item.createdAt.toISOString(),
                updatedAt: item.updatedAt.toISOString()
            })
        },
        {
            name: 'seans',
            headers: [
                { id: 'id', title: 'ID' },
                { id: 'adminId', title: 'Admin ID' },
                { id: 'resource', title: 'Resource' },
                { id: 'ip_address', title: 'IP Address' },
                { id: 'user_agent', title: 'User Agent' },
                { id: 'auth_method', title: 'Auth Method' },
                { id: 'createdAt', title: 'Created At' },
                { id: 'updatedAt', title: 'Updated At' }
            ],
            dataMapper: (item) => ({
                id: item.id,
                adminId: item.adminId || '',
                resource: item.resource || '',
                ip_address: item.ip_address || '',
                user_agent: item.user_agent || '',
                auth_method: item.auth_method || '',
                createdAt: item.createdAt.toISOString(),
                updatedAt: item.updatedAt.toISOString()
            })
        },
        {
            name: 'sessions',
            headers: [
                { id: 'id', title: 'ID' },
                { id: 'registrationId', title: 'Registration ID' },
                { id: 'regNumber', title: 'Reg Number' },
                { id: 'fullName', title: 'Full Name' },
                { id: 'firstName', title: 'First Name' },
                { id: 'lastName', title: 'Last Name' },
                { id: 'fatherName', title: 'Father Name' },
                { id: 'birthYear', title: 'Birth Year' },
                { id: 'birthDate', title: 'Birth Date' },
                { id: 'birthPlace', title: 'Birth Place' },
                { id: 'workplace', title: 'Workplace' },
                { id: 'position', title: 'Position' },
                { id: 'residence', title: 'Residence' },
                { id: 'model', title: 'Model' },
                { id: 'notes', title: 'Notes' },
                { id: 'additionalNotes', title: 'Additional Notes' },
                { id: 'externalNotes', title: 'External Notes' },
                { id: 'adminId', title: 'Admin ID' },
                { id: 'type', title: 'Type' },
                { id: 'order', title: 'Order' },
                { id: 'createdAt', title: 'Created At' },
                { id: 'updatedAt', title: 'Updated At' }
            ],
            dataMapper: (item) => ({
                id: item.id,
                registrationId: item.registrationId || '',
                regNumber: item.regNumber || '',
                fullName: item.fullName || '',
                firstName: item.firstName || '',
                lastName: item.lastName || '',
                fatherName: item.fatherName || '',
                birthYear: item.birthYear || '',
                birthDate: item.birthDate ? item.birthDate.toISOString() : '',
                birthPlace: item.birthPlace || '',
                workplace: item.workplace || '',
                position: item.position || '',
                residence: item.residence || '',
                model: item.model || '',
                notes: item.notes || '',
                additionalNotes: item.additionalNotes || '',
                externalNotes: item.externalNotes || '',
                adminId: item.adminId || '',
                type: item.type || '',
                order: item.order || '',
                createdAt: item.createdAt.toISOString(),
                updatedAt: item.updatedAt.toISOString()
            })
        },
        {
            name: 'temporaryData',
            headers: [
                { id: 'id', title: 'ID' },
                { id: 'order', title: 'Order' },
                { id: 'form_reg', title: 'Form Reg' },
                { id: 'regNumber', title: 'Reg Number' },
                { id: 'regDate', title: 'Reg Date' },
                { id: 'firstName', title: 'First Name' },
                { id: 'lastName', title: 'Last Name' },
                { id: 'fatherName', title: 'Father Name' },
                { id: 'fullName', title: 'Full Name' },
                { id: 'birthYear', title: 'Birth Year' },
                { id: 'birthPlace', title: 'Birth Place' },
                { id: 'workplace', title: 'Workplace' },
                { id: 'position', title: 'Position' },
                { id: 'model', title: 'Model' },
                { id: 'residence', title: 'Residence' },
                { id: 'initiatorId', title: 'Initiator ID' },
                { id: 'executorId', title: 'Executor ID' },
                { id: 'accessStatus', title: 'Access Status' },
                { id: 'data', title: 'Data' },
                { id: 'recordNumber', title: 'Record Number' },
                { id: 'pinfl', title: 'PINFL' },
                { id: 'found_status', title: 'Found Status' },
                { id: 'action_status', title: 'Action Status' },
                { id: 'registration', title: 'Registration' },
                { id: 'registrationSimilarity', title: 'Registration Similarity' },
                { id: 'registration_four', title: 'Registration Four' },
                { id: 'registration_four_similarity', title: 'Registration Four Similarity' },
                { id: 'relatives', title: 'Relatives' },
                { id: 'migration_status', title: 'Migration Status' },
                { id: 'status', title: 'Status' },
                { id: 'createdAt', title: 'Created At' },
                { id: 'updatedAt', title: 'Updated At' }
            ],
            dataMapper: (item) => ({
                id: item.id,
                order: item.order || '',
                form_reg: item.form_reg || '',
                regNumber: item.regNumber || '',
                regDate: item.regDate ? item.regDate.toISOString() : '',
                firstName: item.firstName || '',
                lastName: item.lastName || '',
                fatherName: item.fatherName || '',
                fullName: item.fullName || '',
                birthYear: item.birthYear || '',
                birthPlace: item.birthPlace || '',
                workplace: item.workplace || '',
                position: item.position || '',
                model: item.model || '',
                residence: item.residence || '',
                initiatorId: item.initiatorId || '',
                executorId: item.executorId || '',
                accessStatus: item.accessStatus || '',
                data: item.data ? JSON.stringify(item.data) : '',
                recordNumber: item.recordNumber || '',
                pinfl: item.pinfl || '',
                found_status: item.found_status !== undefined ? item.found_status : false,
                action_status: item.action_status || '',
                registration: item.registration || '',
                registrationSimilarity: item.registrationSimilarity ? JSON.stringify(item.registrationSimilarity) : '',
                registration_four: item.registration_four || '',
                registration_four_similarity: item.registration_four_similarity ? JSON.stringify(item.registration_four_similarity) : '',
                relatives: item.relatives || '',
                migration_status: item.migration_status !== undefined ? item.migration_status : false,
                status: item.status || '',
                createdAt: item.createdAt.toISOString(),
                updatedAt: item.updatedAt.toISOString()
            })
        },
        {
            name: 'raports',
            headers: [
                { id: 'id', title: 'ID' },
                { id: 'name', title: 'Name' },
                { id: 'executorId', title: 'Executor ID' },
                { id: 'link', title: 'Link' },
                { id: 'notes', title: 'Notes' },
                { id: 'createdAt', title: 'Created At' },
                { id: 'updatedAt', title: 'Updated At' }
            ],
            dataMapper: (item) => ({
                id: item.id,
                name: item.name || '',
                executorId: item.executorId || '',
                link: item.link || '',
                notes: item.notes || '',
                createdAt: item.createdAt.toISOString(),
                updatedAt: item.updatedAt.toISOString()
            })
        },
        {
            name: 'raportTypes',
            headers: [
                { id: 'id', title: 'ID' },
                { id: 'name', title: 'Name' },
                { id: 'code', title: 'Code' },
                { id: 'code_ru', title: 'Code RU' },
                { id: 'code_uz', title: 'Code UZ' },
                { id: 'organization', title: 'Organization' },
                { id: 'requested_organization', title: 'Requested Organization' },
                { id: 'signed_fio', title: 'Signed FIO' },
                { id: 'signed_position', title: 'Signed Position' },
                { id: 'link', title: 'Link' },
                { id: 'notes', title: 'Notes' },
                { id: 'executorId', title: 'Executor ID' },
                { id: 'data', title: 'Data' },
                { id: 'createdAt', title: 'Created At' },
                { id: 'updatedAt', title: 'Updated At' }
            ],
            dataMapper: (item) => ({
                id: item.id,
                name: item.name || '',
                code: item.code || '',
                code_ru: item.code_ru || '',
                code_uz: item.code_uz || '',
                organization: item.organization || '',
                requested_organization: item.requested_organization || '',
                signed_fio: item.signed_fio || '',
                signed_position: item.signed_position || '',
                link: item.link || '',
                notes: item.notes || '',
                executorId: item.executorId || '',
                data: item.data ? JSON.stringify(item.data) : '',
                createdAt: item.createdAt.toISOString(),
                updatedAt: item.updatedAt.toISOString()
            })
        },
        {
            name: 'raportLinks',
            headers: [
                { id: 'id', title: 'ID' },
                { id: 'raportId', title: 'Raport ID' },
                { id: 'regNumber', title: 'Reg Number' },
                { id: 'code', title: 'Code' },
                { id: 'delete', title: 'Delete' },
                { id: 'display', title: 'Display' },
                { id: 'adminCheck', title: 'Admin Check' },
                { id: 'discussCheck', title: 'Discuss Check' },
                { id: 'operator', title: 'Operator' },
                { id: 'notes', title: 'Notes' },
                { id: 'createdAt', title: 'Created At' },
                { id: 'updatedAt', title: 'Updated At' }
            ],
            dataMapper: (item) => ({
                id: item.id,
                raportId: item.raportId || '',
                regNumber: item.regNumber || '',
                code: item.code || '',
                delete: item.delete !== undefined ? item.delete : false,
                display: item.display !== undefined ? item.display : true,
                adminCheck: item.adminCheck !== undefined ? item.adminCheck : false,
                discussCheck: item.discussCheck !== undefined ? item.discussCheck : false,
                operator: item.operator !== undefined ? item.operator : false,
                notes: item.notes || '',
                createdAt: item.createdAt.toISOString(),
                updatedAt: item.updatedAt.toISOString()
            })
        }
    ];
};

module.exports = {
    getTableConfigurations
};
