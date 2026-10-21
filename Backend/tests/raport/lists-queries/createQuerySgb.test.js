const { ctrl } = require('./_support');
const { registerCommonQueryTests } = require('./_queryShared');
registerCommonQueryTests({ handler: ctrl.generateQuerySgb, fixedName: 'type9', linkCode: 'ЗАПРОС СГБ' });
