'use strict';

const MONGODB_ERROR_CODES = require('../error_codes').MONGODB_ERROR_CODES;
const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const CommandOperationV2 = require('./command_v2');
const maxWireVersion = require('../core/utils').maxWireVersion;
const CountDocumentsOperation = require('./count_documents');

class EstimatedDocumentCountOperation extends CommandOperationV2 {
  constructor(collection, options) {
    super(collection, options);
    this.collection = collection;
    this.collectionName = collection.s.namespace.collection;
  }

  execute(server, callback) {
    if (maxWireVersion(server) < 12) {
      return this.executeLegacy(server, callback);
    }
    // if the user specifies a filter, use a CountDocumentsOperation instead
    if (this.options.query) {
      const op = new CountDocumentsOperation(this.collection, this.options.query, this.options);
      return op.execute(server, callback);
    }
    const pipeline = [{ $collStats: { count: {} } }, { $group: { _id: 1, n: { $sum: '$count' } } }];
    const cmd = { aggregate: this.collectionName, pipeline, cursor: {} };

    if (typeof this.options.maxTimeMS === 'number') {
      cmd.maxTimeMS = this.options.maxTimeMS;
    }

    super.executeCommand(server, cmd, (err, response) => {
      if (err && err.code !== MONGODB_ERROR_CODES.NamespaceNotFound) {
        callback(err);
        return;
      }

      callback(
        undefined,
        (response &&
          response.cursor &&
          response.cursor.firstBatch &&
          response.cursor.firstBatch[0].n) ||
          0
      );
    });
  }

  executeLegacy(server, callback) {
    const cmd = { count: this.collectionName };

    const options = this.options;
    if (options.query) {
      cmd.query = options.query;
    }
    if (options.hint) {
      cmd.hint = options.hint;
    }
    if (typeof options.maxTimeMS === 'number') {
      cmd.maxTimeMS = options.maxTimeMS;
    }
    if (typeof options.skip === 'number') {
      cmd.skip = options.skip;
    }
    if (typeof options.limit === 'number') {
      cmd.limit = options.limit;
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
