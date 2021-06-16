'use strict';

const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const CommandOperationV2 = require('./command_v2');
const maxWireVersion = require('../core/utils').maxWireVersion;

class EstimatedDocumentCountOperation extends CommandOperationV2 {
  constructor(collection, options) {
    super(collection, options);
    this.collectionName = collection.s.namespace.collection;
  }

  execute(server, callback) {
    if (maxWireVersion(server) < 12) {
      return this.executeLegacy(server, callback);
    }
    const pipeline = [{ $collStats: { count: {} } }, { $group: { _id: 1, n: { $sum: '$count' } } }];
    const cmd = { aggregate: this.collectionName, pipeline, cursor: {} };

    if (typeof this.options.maxTimeMS === 'number') {
      cmd.maxTimeMS = this.options.maxTimeMS;
    }

    super.executeCommand(server, cmd, (err, response) => {
      if (err && err.code !== 26) {
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

    if (typeof this.options.maxTimeMS === 'number') {
      cmd.maxTimeMS = this.options.maxTimeMS;
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
