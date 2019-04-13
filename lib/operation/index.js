'use strict';

module.exports = {
  Aspect: require('./operation_base').Aspect,
  defineAspects: require('./operation_base').defineAspects,
  executeOperation: require('./execute_operation').executeOperation,
  OperationBase: require('./operation_base').OperationBase,
  CommandOperation: require('./command_operation').CommandOperation
};
