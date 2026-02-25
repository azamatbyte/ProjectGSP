// Helper functions and configurations for complete database backup/restore

const COMPLETE_STATUSES = new Set(['WAITING', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED']);
const SESSION_TYPES = new Set(['SESSION', 'RESERVE', 'RAPORT']);

const BASE_EXCLUDED_COMPARE_FIELDS = new Set(['createdAt', 'updatedAt']);

const BACKUP_MODEL_CONFIGS = [
  {
    prismaModel: 'admin',
    csvPrefix: 'admins',
    jsonKey: 'admins',
    idField: 'id',
    uniqueMatchers: [['username'], ['phone']],
    restoreOrder: 10,
    fields: [
      { key: 'id', title: 'ID' },
      { key: 'username', title: 'Username' },
      { key: 'password', title: 'Password' },
      { key: 'birthDate', title: 'Birth Date', type: 'date' },
      { key: 'father_name', title: 'Father Name' },
      { key: 'first_name', title: 'First Name' },
      { key: 'last_name', title: 'Last Name' },
      { key: 'nationality', title: 'Nationality' },
      { key: 'rank', title: 'Rank' },
      { key: 'gender', title: 'Gender' },
      { key: 'workplace', title: 'Workplace' },
      { key: 'phone', title: 'Phone' },
      { key: 'photo', title: 'Photo' },
      { key: 'salt', title: 'Salt' },
      { key: 'role', title: 'Role' },
      { key: 'status', title: 'Status' },
      { key: 'createdAt', title: 'Created At', type: 'date' },
      { key: 'updatedAt', title: 'Updated At', type: 'date' }
    ]
  },
  {
    prismaModel: 'service',
    csvPrefix: 'services',
    jsonKey: 'services',
    idField: 'id',
    uniqueMatchers: [['name']],
    restoreOrder: 20,
    fields: [
      { key: 'id', title: 'ID' },
      { key: 'name', title: 'Name' },
      { key: 'description', title: 'Description' },
      { key: 'code', title: 'Code', type: 'int' },
      { key: 'createdAt', title: 'Created At', type: 'date' },
      { key: 'updatedAt', title: 'Updated At', type: 'date' }
    ]
  },
  {
    prismaModel: 'form',
    csvPrefix: 'forms',
    jsonKey: 'forms',
    idField: 'id',
    uniqueMatchers: [['name']],
    restoreOrder: 30,
    fields: [
      { key: 'id', title: 'ID' },
      { key: 'name', title: 'Name' },
      { key: 'description', title: 'Description' },
      { key: 'length', title: 'Length', type: 'int' },
      { key: 'month', title: 'Month', type: 'int' },
      { key: 'type', title: 'Type' },
      { key: 'status', title: 'Status', type: 'boolean' },
      { key: 'createdAt', title: 'Created At', type: 'date' },
      { key: 'updatedAt', title: 'Updated At', type: 'date' }
    ]
  },
  {
    prismaModel: 'initiator',
    csvPrefix: 'initiators',
    jsonKey: 'initiators',
    idField: 'id',
    restoreOrder: 40,
    fields: [
      { key: 'id', title: 'ID' },
      { key: 'first_name', title: 'First Name' },
      { key: 'last_name', title: 'Last Name' },
      { key: 'father_name', title: 'Father Name' },
      { key: 'rank', title: 'Rank' },
      { key: 'notes', title: 'Notes' },
      { key: 'createdAt', title: 'Created At', type: 'date' },
      { key: 'updatedAt', title: 'Updated At', type: 'date' }
    ]
  },
  {
    prismaModel: 'relationDegree',
    csvPrefix: 'relation_degrees',
    jsonKey: 'relationDegrees',
    idField: 'id',
    uniqueMatchers: [['name']],
    restoreOrder: 50,
    fields: [
      { key: 'id', title: 'ID' },
      { key: 'name', title: 'Name' },
      { key: 'createdAt', title: 'Created At', type: 'date' },
      { key: 'updatedAt', title: 'Updated At', type: 'date' }
    ]
  },
  {
    prismaModel: 'workPlace',
    csvPrefix: 'workplaces',
    jsonKey: 'workPlaces',
    idField: 'id',
    uniqueMatchers: [['name']],
    restoreOrder: 60,
    fields: [
      { key: 'id', title: 'ID' },
      { key: 'name', title: 'Name' },
      { key: 'createdAt', title: 'Created At', type: 'date' },
      { key: 'updatedAt', title: 'Updated At', type: 'date' }
    ]
  },
  {
    prismaModel: 'systemSetting',
    csvPrefix: 'system_settings',
    jsonKey: 'systemSettings',
    idField: 'key',
    uniqueMatchers: [['key']],
    restoreOrder: 70,
    fields: [
      { key: 'key', title: 'Key' },
      { key: 'value', title: 'Value' },
      { key: 'createdAt', title: 'Created At', type: 'date' },
      { key: 'updatedAt', title: 'Updated At', type: 'date' }
    ]
  },
  {
    prismaModel: 'accessStatus',
    csvPrefix: 'access_statuses',
    jsonKey: 'accessStatuses',
    idField: 'id',
    uniqueMatchers: [['name']],
    restoreOrder: 80,
    fields: [
      { key: 'id', title: 'ID' },
      { key: 'name', title: 'Name' },
      { key: 'adminId', title: 'Admin ID' },
      { key: 'status', title: 'Status', type: 'boolean' },
      { key: 'createdAt', title: 'Created At', type: 'date' },
      { key: 'updatedAt', title: 'Updated At', type: 'date' }
    ]
  },
  {
    prismaModel: 'adminServiceAccess',
    csvPrefix: 'admin_service_accesses',
    jsonKey: 'adminServiceAccesses',
    idField: 'id',
    uniqueMatchers: [['adminId', 'serviceId', 'grantedBy']],
    restoreOrder: 90,
    fields: [
      { key: 'id', title: 'ID' },
      { key: 'adminId', title: 'Admin ID' },
      { key: 'serviceId', title: 'Service ID' },
      { key: 'grantedBy', title: 'Granted By' },
      { key: 'createdAt', title: 'Created At', type: 'date' },
      { key: 'updatedAt', title: 'Updated At', type: 'date' }
    ]
  },
  {
    prismaModel: 'registration',
    csvPrefix: 'registrations',
    jsonKey: 'registrations',
    idField: 'id',
    uniqueMatchers: [['pinfl'], ['regNumber', 'fullName', 'birthDate']],
    restoreOrder: 100,
    fields: [
      { key: 'id', title: 'ID' },
      { key: 'regNumber', title: 'Registration Number' },
      { key: 'regDate', title: 'Registration Date', type: 'date' },
      { key: 'regEndDate', title: 'Registration End Date', type: 'date' },
      { key: 'fullName', title: 'Full Name' },
      { key: 'firstName', title: 'First Name' },
      { key: 'lastName', title: 'Last Name' },
      { key: 'fatherName', title: 'Father Name' },
      { key: 'nationality', title: 'Nationality' },
      { key: 'pinfl', title: 'PINFL' },
      { key: 'passport', title: 'Passport' },
      { key: 'birthDate', title: 'Birth Date', type: 'date' },
      { key: 'birthYear', title: 'Birth Year', type: 'int' },
      { key: 'birthPlace', title: 'Birth Place' },
      { key: 'residence', title: 'Residence' },
      { key: 'workplace', title: 'Workplace' },
      { key: 'position', title: 'Position' },
      { key: 'status', title: 'Status' },
      { key: 'completeStatus', title: 'Complete Status', type: 'completeStatus' },
      { key: 'form_reg', title: 'Form Registration' },
      { key: 'form_reg_log', title: 'Form Registration Log' },
      { key: 'conclusionDate', title: 'Conclusion Date', type: 'date' },
      { key: 'conclusionRegNum', title: 'Conclusion Registration Number' },
      { key: 'model', title: 'Model' },
      { key: 'notes', title: 'Notes' },
      { key: 'additionalNotes', title: 'Additional Notes' },
      { key: 'conclusion_compr', title: 'Conclusion Comprehensive' },
      { key: 'externalNotes', title: 'External Notes' },
      { key: 'accessStatus', title: 'Access Status' },
      { key: 'expired', title: 'Expired', type: 'date' },
      { key: 'expiredDate', title: 'Expired Date', type: 'date' },
      { key: 'recordNumber', title: 'Record Number' },
      { key: 'endDate', title: 'End Date', type: 'date' },
      { key: 'or_tab', title: 'Initiator ID' },
      { key: 'executorId', title: 'Executor ID' },
      { key: 'whoAdd', title: 'Who Added' },
      { key: 'createdAt', title: 'Created At', type: 'date' },
      { key: 'updatedAt', title: 'Updated At', type: 'date' }
    ]
  },
  {
    prismaModel: 'relatives',
    csvPrefix: 'relatives',
    jsonKey: 'relatives',
    idField: 'id',
    uniqueMatchers: [['pinfl'], ['regNumber', 'fullName', 'relationDegree', 'registrationId']],
    restoreOrder: 110,
    fields: [
      { key: 'id', title: 'ID' },
      { key: 'regNumber', title: 'Registration Number' },
      { key: 'relationDegree', title: 'Relation Degree' },
      { key: 'fullName', title: 'Full Name' },
      { key: 'firstName', title: 'First Name' },
      { key: 'lastName', title: 'Last Name' },
      { key: 'fatherName', title: 'Father Name' },
      { key: 'nationality', title: 'Nationality' },
      { key: 'pinfl', title: 'PINFL' },
      { key: 'birthDate', title: 'Birth Date', type: 'date' },
      { key: 'birthYear', title: 'Birth Year', type: 'int' },
      { key: 'birthStatus', title: 'Birth Status', type: 'boolean' },
      { key: 'birthPlace', title: 'Birth Place' },
      { key: 'residence', title: 'Residence' },
      { key: 'workplace', title: 'Workplace' },
      { key: 'position', title: 'Position' },
      { key: 'familyStatus', title: 'Family Status' },
      { key: 'model', title: 'Model' },
      { key: 'notes', title: 'Notes' },
      { key: 'additionalNotes', title: 'Additional Notes' },
      { key: 'externalNotes', title: 'External Notes' },
      { key: 'accessStatus', title: 'Access Status' },
      { key: 'status_analysis', title: 'Status Analysis', type: 'boolean' },
      { key: 'registrationId', title: 'Related Registration ID' },
      { key: 'or_tab', title: 'Initiator ID' },
      { key: 'executorId', title: 'Executor ID' },
      { key: 'whoAdd', title: 'Who Added' },
      { key: 'createdAt', title: 'Created At', type: 'date' },
      { key: 'updatedAt', title: 'Updated At', type: 'date' }
    ]
  },
  {
    prismaModel: 'registrationLog',
    csvPrefix: 'registration_logs',
    jsonKey: 'registrationLogs',
    idField: 'id',
    restoreOrder: 120,
    fields: [
      { key: 'id', title: 'ID' },
      { key: 'registrationId', title: 'Registration ID' },
      { key: 'fieldName', title: 'Field Name' },
      { key: 'oldValue', title: 'Old Value' },
      { key: 'newValue', title: 'New Value' },
      { key: 'executorId', title: 'Executor ID' },
      { key: 'createdAt', title: 'Created At', type: 'date' },
      { key: 'updatedAt', title: 'Updated At', type: 'date' }
    ]
  },
  {
    prismaModel: 'log',
    csvPrefix: 'logs',
    jsonKey: 'logs',
    idField: 'id',
    restoreOrder: 130,
    fields: [
      { key: 'id', title: 'ID' },
      { key: 'recordId', title: 'Record ID' },
      { key: 'tableName', title: 'Table Name' },
      { key: 'fieldName', title: 'Field Name' },
      { key: 'oldValue', title: 'Old Value' },
      { key: 'newValue', title: 'New Value' },
      { key: 'executorId', title: 'Executor ID' },
      { key: 'createdAt', title: 'Created At', type: 'date' },
      { key: 'updatedAt', title: 'Updated At', type: 'date' }
    ]
  },
  {
    prismaModel: 'seans',
    csvPrefix: 'seans',
    jsonKey: 'seans',
    idField: 'id',
    restoreOrder: 140,
    fields: [
      { key: 'id', title: 'ID' },
      { key: 'adminId', title: 'Admin ID' },
      { key: 'resource', title: 'Resource' },
      { key: 'ip_address', title: 'IP Address' },
      { key: 'user_agent', title: 'User Agent' },
      { key: 'auth_method', title: 'Auth Method' },
      { key: 'createdAt', title: 'Created At', type: 'date' },
      { key: 'updatedAt', title: 'Updated At', type: 'date' }
    ]
  },
  {
    prismaModel: 'refreshToken',
    csvPrefix: 'refresh_tokens',
    jsonKey: 'refreshTokens',
    idField: 'id',
    uniqueMatchers: [['token']],
    restoreOrder: 150,
    fields: [
      { key: 'id', title: 'ID' },
      { key: 'token', title: 'Token' },
      { key: 'adminId', title: 'Admin ID' },
      { key: 'expiredAt', title: 'Expired At', type: 'date' },
      { key: 'createdAt', title: 'Created At', type: 'date' },
      { key: 'updatedAt', title: 'Updated At', type: 'date' }
    ]
  },
  {
    prismaModel: 'upload',
    csvPrefix: 'uploads',
    jsonKey: 'uploads',
    idField: 'id',
    uniqueMatchers: [['file_link']],
    restoreOrder: 160,
    fields: [
      { key: 'id', title: 'ID' },
      { key: 'file_link', title: 'File Link' },
      { key: 'uploadedBy', title: 'Uploaded By' },
      { key: 'createdAt', title: 'Created At', type: 'date' },
      { key: 'updatedAt', title: 'Updated At', type: 'date' }
    ]
  },
  {
    prismaModel: 'signList',
    csvPrefix: 'sign_lists',
    jsonKey: 'signLists',
    idField: 'id',
    uniqueMatchers: [['phone']],
    restoreOrder: 170,
    fields: [
      { key: 'id', title: 'ID' },
      { key: 'lastName', title: 'Last Name' },
      { key: 'firstName', title: 'First Name' },
      { key: 'fatherName', title: 'Father Name' },
      { key: 'workplace', title: 'Workplace' },
      { key: 'position', title: 'Position' },
      { key: 'rank', title: 'Rank' },
      { key: 'notes', title: 'Notes' },
      { key: 'birthDate', title: 'Birth Date', type: 'date' },
      { key: 'nationality', title: 'Nationality' },
      { key: 'gender', title: 'Gender' },
      { key: 'phone', title: 'Phone' },
      { key: 'photo', title: 'Photo' },
      { key: 'status', title: 'Status' },
      { key: 'createdAt', title: 'Created At', type: 'date' },
      { key: 'updatedAt', title: 'Updated At', type: 'date' }
    ]
  },
  {
    prismaModel: 'raportTypes',
    csvPrefix: 'raport_types',
    jsonKey: 'raportTypes',
    idField: 'id',
    restoreOrder: 180,
    fields: [
      { key: 'id', title: 'ID' },
      { key: 'name', title: 'Name' },
      { key: 'code', title: 'Code' },
      { key: 'code_ru', title: 'Code RU' },
      { key: 'code_uz', title: 'Code UZ' },
      { key: 'organization', title: 'Organization' },
      { key: 'requested_organization', title: 'Requested Organization' },
      { key: 'signed_fio', title: 'Signed FIO' },
      { key: 'signed_position', title: 'Signed Position' },
      { key: 'link', title: 'Link' },
      { key: 'notes', title: 'Notes' },
      { key: 'executorId', title: 'Executor ID' },
      { key: 'data', title: 'Data', type: 'json' },
      { key: 'createdAt', title: 'Created At', type: 'date' },
      { key: 'updatedAt', title: 'Updated At', type: 'date' }
    ]
  },
  {
    prismaModel: 'raport',
    csvPrefix: 'raports',
    jsonKey: 'raports',
    idField: 'id',
    restoreOrder: 190,
    fields: [
      { key: 'id', title: 'ID' },
      { key: 'name', title: 'Name' },
      { key: 'executorId', title: 'Executor ID' },
      { key: 'link', title: 'Link' },
      { key: 'notes', title: 'Notes' },
      { key: 'createdAt', title: 'Created At', type: 'date' },
      { key: 'updatedAt', title: 'Updated At', type: 'date' }
    ]
  },
  {
    prismaModel: 'raportLink',
    csvPrefix: 'raport_links',
    jsonKey: 'raportLinks',
    idField: 'id',
    restoreOrder: 200,
    include: {
      registrations: { select: { id: true } }
    },
    fields: [
      { key: 'id', title: 'ID' },
      { key: 'raportId', title: 'Raport ID' },
      { key: 'regNumber', title: 'Reg Number' },
      { key: 'code', title: 'Code' },
      { key: 'delete', title: 'Delete', type: 'boolean' },
      { key: 'display', title: 'Display', type: 'boolean' },
      { key: 'adminCheck', title: 'Admin Check', type: 'boolean' },
      { key: 'discussCheck', title: 'Discuss Check', type: 'boolean' },
      { key: 'operator', title: 'Operator', type: 'boolean' },
      { key: 'notes', title: 'Notes' },
      { key: 'registrationIds', title: 'Registration IDs', type: 'json', exportFrom: (item) => (item.registrations || []).map((reg) => reg.id) },
      { key: 'createdAt', title: 'Created At', type: 'date' },
      { key: 'updatedAt', title: 'Updated At', type: 'date' }
    ]
  },
  {
    prismaModel: 'archive',
    csvPrefix: 'archives',
    jsonKey: 'archives',
    idField: 'id',
    restoreOrder: 210,
    fields: [
      { key: 'id', title: 'ID' },
      { key: 'name', title: 'Name' },
      { key: 'data', title: 'Data', type: 'json' },
      { key: 'executorId', title: 'Executor ID' },
      { key: 'createdAt', title: 'Created At', type: 'date' },
      { key: 'updatedAt', title: 'Updated At', type: 'date' }
    ]
  },
  {
    prismaModel: 'temporaryData',
    csvPrefix: 'temporary_data',
    jsonKey: 'temporaryData',
    idField: 'id',
    restoreOrder: 220,
    fields: [
      { key: 'id', title: 'ID' },
      { key: 'order', title: 'Order', type: 'int' },
      { key: 'form_reg', title: 'Form Reg' },
      { key: 'regNumber', title: 'Reg Number' },
      { key: 'regDate', title: 'Reg Date', type: 'date' },
      { key: 'firstName', title: 'First Name' },
      { key: 'lastName', title: 'Last Name' },
      { key: 'fatherName', title: 'Father Name' },
      { key: 'fullName', title: 'Full Name' },
      { key: 'birthYear', title: 'Birth Year', type: 'int' },
      { key: 'birthPlace', title: 'Birth Place' },
      { key: 'workplace', title: 'Workplace' },
      { key: 'position', title: 'Position' },
      { key: 'model', title: 'Model' },
      { key: 'residence', title: 'Residence' },
      { key: 'initiatorId', title: 'Initiator ID' },
      { key: 'executorId', title: 'Executor ID' },
      { key: 'accessStatus', title: 'Access Status' },
      { key: 'data', title: 'Data', type: 'json' },
      { key: 'recordNumber', title: 'Record Number' },
      { key: 'pinfl', title: 'PINFL' },
      { key: 'found_status', title: 'Found Status', type: 'boolean' },
      { key: 'action_status', title: 'Action Status' },
      { key: 'registration', title: 'Registration' },
      { key: 'registrationSimilarity', title: 'Registration Similarity', type: 'json' },
      { key: 'registration_four', title: 'Registration Four' },
      { key: 'registration_four_similarity', title: 'Registration Four Similarity', type: 'json' },
      { key: 'relatives', title: 'Relatives' },
      { key: 'migration_status', title: 'Migration Status', type: 'boolean' },
      { key: 'status', title: 'Status' },
      { key: 'createdAt', title: 'Created At', type: 'date' },
      { key: 'updatedAt', title: 'Updated At', type: 'date' }
    ]
  },
  {
    prismaModel: 'session',
    csvPrefix: 'sessions',
    jsonKey: 'sessions',
    idField: 'id',
    restoreOrder: 230,
    fields: [
      { key: 'id', title: 'ID' },
      { key: 'registrationId', title: 'Registration ID' },
      { key: 'regNumber', title: 'Reg Number' },
      { key: 'fullName', title: 'Full Name' },
      { key: 'firstName', title: 'First Name' },
      { key: 'lastName', title: 'Last Name' },
      { key: 'fatherName', title: 'Father Name' },
      { key: 'birthYear', title: 'Birth Year', type: 'int' },
      { key: 'birthDate', title: 'Birth Date', type: 'date' },
      { key: 'birthPlace', title: 'Birth Place' },
      { key: 'workplace', title: 'Workplace' },
      { key: 'position', title: 'Position' },
      { key: 'residence', title: 'Residence' },
      { key: 'model', title: 'Model' },
      { key: 'notes', title: 'Notes' },
      { key: 'additionalNotes', title: 'Additional Notes' },
      { key: 'externalNotes', title: 'External Notes' },
      { key: 'adminId', title: 'Admin ID' },
      { key: 'type', title: 'Type', type: 'sessionType' },
      { key: 'order', title: 'Order', type: 'int' },
      { key: 'createdAt', title: 'Created At', type: 'date' },
      { key: 'updatedAt', title: 'Updated At', type: 'date' }
    ]
  }
].sort((a, b) => a.restoreOrder - b.restoreOrder);

const byModel = new Map(BACKUP_MODEL_CONFIGS.map((cfg) => [cfg.prismaModel, cfg]));
const byCsvPrefix = new Map(BACKUP_MODEL_CONFIGS.map((cfg) => [cfg.csvPrefix, cfg]));

function isEmptyValue(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (isEmptyValue(value)) return null;
  const raw = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(raw)) return true;
  if (['false', '0', 'no', 'n'].includes(raw)) return false;
  return null;
}

function normalizeDate(value) {
  if (isEmptyValue(value)) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeInt(value) {
  if (isEmptyValue(value)) return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeJson(value) {
  if (isEmptyValue(value)) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeCompleteStatus(value) {
  if (isEmptyValue(value)) return null;
  const status = String(value).trim();
  return COMPLETE_STATUSES.has(status) ? status : null;
}

function normalizeSessionType(value) {
  if (isEmptyValue(value)) return null;
  const type = String(value).trim().toUpperCase();
  return SESSION_TYPES.has(type) ? type : null;
}

function parseFieldValueByType(value, type = 'string') {
  switch (type) {
    case 'boolean':
      return normalizeBoolean(value);
    case 'date':
      return normalizeDate(value);
    case 'int':
      return normalizeInt(value);
    case 'json':
      return normalizeJson(value);
    case 'completeStatus':
      return normalizeCompleteStatus(value);
    case 'sessionType':
      return normalizeSessionType(value);
    default:
      return isEmptyValue(value) ? '' : value;
  }
}

function serializeFieldValueByType(value, type = 'string') {
  if (value === undefined || value === null) return '';

  switch (type) {
    case 'date': {
      const date = normalizeDate(value);
      return date ? date.toISOString() : '';
    }
    case 'json':
      return JSON.stringify(value);
    case 'boolean':
      return value === true;
    default:
      return value;
  }
}

function buildCsvHeader(config) {
  return config.fields.map((field) => ({
    id: field.key,
    title: field.title
  }));
}

function serializeRowForCsv(config, row) {
  const mapped = {};

  for (const field of config.fields) {
    const raw = typeof field.exportFrom === 'function' ? field.exportFrom(row) : row[field.key];
    mapped[field.key] = serializeFieldValueByType(raw, field.type);
  }

  return mapped;
}

function parseImportedRow(config, rawRow) {
  const parsed = {};

  for (const field of config.fields) {
    let rawValue;

    if (Object.prototype.hasOwnProperty.call(rawRow, field.title)) {
      rawValue = rawRow[field.title];
    } else if (Object.prototype.hasOwnProperty.call(rawRow, field.key)) {
      rawValue = rawRow[field.key];
    } else if (Array.isArray(field.aliases)) {
      const alias = field.aliases.find((key) => Object.prototype.hasOwnProperty.call(rawRow, key));
      rawValue = alias ? rawRow[alias] : undefined;
    } else {
      rawValue = undefined;
    }

    parsed[field.key] = parseFieldValueByType(rawValue, field.type);
  }

  return parsed;
}

function normalizeCompareValue(value, type = 'string') {
  if (value === null || value === undefined) return '';

  switch (type) {
    case 'date': {
      const date = normalizeDate(value);
      return date ? date.toISOString() : '';
    }
    case 'json':
      return JSON.stringify(value ?? null);
    case 'boolean':
      return normalizeBoolean(value) === true ? 'true' : normalizeBoolean(value) === false ? 'false' : '';
    case 'int': {
      const intValue = normalizeInt(value);
      return intValue === null ? '' : String(intValue);
    }
    case 'completeStatus': {
      const status = normalizeCompleteStatus(value);
      return status || '';
    }
    case 'sessionType': {
      const sessionType = normalizeSessionType(value);
      return sessionType || '';
    }
    default:
      return String(value).trim();
  }
}

function areRowsEquivalent(config, parsedRow, existingRow) {
  if (!existingRow) return false;

  for (const field of config.fields) {
    if (field.key === config.idField) continue;
    if (BASE_EXCLUDED_COMPARE_FIELDS.has(field.key)) continue;

    const left = normalizeCompareValue(parsedRow[field.key], field.type);
    let right;

    if (field.key === 'registrationIds' && config.prismaModel === 'raportLink') {
      const currentIds = Array.isArray(existingRow.registrations) ? existingRow.registrations.map((x) => x.id) : [];
      right = normalizeCompareValue(currentIds, 'json');
    } else {
      right = normalizeCompareValue(existingRow[field.key], field.type);
    }

    if (left !== right) {
      return false;
    }
  }

  return true;
}

function getBackupModelConfigs() {
  return BACKUP_MODEL_CONFIGS;
}

function getBackupModelConfigByPrismaModel(prismaModel) {
  return byModel.get(prismaModel) || null;
}

function getBackupModelConfigByCsvPrefix(csvPrefix) {
  return byCsvPrefix.get(csvPrefix) || null;
}

module.exports = {
  getBackupModelConfigs,
  getBackupModelConfigByPrismaModel,
  getBackupModelConfigByCsvPrefix,
  buildCsvHeader,
  serializeRowForCsv,
  parseImportedRow,
  areRowsEquivalent,
  isEmptyValue
};
