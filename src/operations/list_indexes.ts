import CommandOperation = require('./command');
import { Aspect, defineAspects } from './operation';
import { maxWireVersion } from '../utils';

const LIST_INDEXES_WIRE_VERSION = 3;

class ListIndexesOperation extends CommandOperation {
  collectionNamespace: any;

  constructor(collection: any, options: any) {
    super(collection, options, { fullResponse: true });

    this.collectionNamespace = collection.s.namespace;
  }

  execute(server: any, callback: Function) {
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

export = ListIndexesOperation;
