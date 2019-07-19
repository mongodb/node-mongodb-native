'use strict';

const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const CommandOperationV2 = require('./command_v2');

class EstimatedDocumentCountOperation extends CommandOperationV2 {
  constructor(collection, query, options) {
    if (typeof options === 'undefined') {
      options = query;
      query = undefined;
    }

    super(collection, options);
    this.collectionName = collection.s.namespace.collection;
    if (query) {
      this.query = query;
    }
  }

  execute(server, callback) {
    const options = this.options;
    const cmd = { count: this.collectionName };

    if (this.query) {
      cmd.query = this.query;
    }

    if (typeof options.skip === 'number') {
      cmd.skip = options.skip;
    }

    if (typeof options.limit === 'number') {
      cmd.limit = options.limit;
    }

    if (options.hint) {
      cmd.hint = options.hint;
    }

    super.executeCommand(server, cmd, (err, response) => {
      if (err) {
        callback(err);
        return;
      }

      callback(null, response.n);
    });
  }
}

defineAspects(EstimatedDocumentCountOperation, [
  Aspect.READ_OPERATION,
  Aspect.RETRYABLE,
  Aspect.EXECUTE_WITH_SELECTION
]);

module.exports = EstimatedDocumentCountOperation;
