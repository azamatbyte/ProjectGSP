const { ctrl } = require('./_support');
const { registerCommonQueryTests } = require('./_queryShared');
registerCommonQueryTests({ handler: ctrl.generateQueryGsbp, fixedName: 'type8', linkCode: 'ЗАПРОС ГСБП' });
