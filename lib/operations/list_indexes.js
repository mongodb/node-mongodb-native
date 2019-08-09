'use strict';

const CommandOperationV2 = require('./command_v2');
const Aspect = require('./operation').Aspect;
const defineAspects = require('./operation').defineAspects;
const maxWireVersion = require('../core/utils').maxWireVersion;

const LIST_INDEXES_WIRE_VERSION = 3;

class ListIndexesOperation extends CommandOperationV2 {
  constructor(collection, options) {
    super(collection, options, { fullResponse: true });

    this.collectionNamespace = collection.s.namespace;
  }

  execute(server, callback) {
    const serverWireVersion = maxWireVersion(server);
    if (serverWireVersion < LIST_INDEXES_WIRE_VERSION) {
      const systemIndexesNS = this.collectionNamespace.withCollection('system.indexes').toString();
      const collectionNS = this.collectionNamespace.toString();

      server.query(systemIndexesNS, { query: { ns: collectionNS } }, {}, this.options, callback);
      return;
    }

    const cursor = this.options.batchSize ? { batchSize: this.options.batchSize } : {};
    super.executeCommand(
      server,
      { listIndexes: this.collectionNamespace.collection, cursor },
      callback
    );
  }
}

defineAspects(ListIndexesOperation, [
  Aspect.READ_OPERATION,
  Aspect.RETRYABLE,
  Aspect.EXECUTE_WITH_SELECTION
]);

module.exports = ListIndexesOperation;
